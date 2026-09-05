"""Build offline plane-coordinate zone polygons from MLIT N03-2023.

Development-only dependencies: pyshp 3.1.6, shapely 2.1.2.
Source and attribution: ../data/JAPAN_PLANE_ZONES.md.
The source archive is intentionally not bundled with the application.
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import zipfile
from collections import defaultdict

import shapefile
import numpy as np
from shapely import get_num_coordinates, contains_xy, prepare
from shapely.geometry import shape, Polygon, LineString
from shapely.ops import unary_union
from shapely.validation import make_valid
from shapely import wkb

SOURCE_SHA256 = 'd0cf37cf450438a62b14007179cbc7bd47b085f20465f6a32f7eaad8ac962e7a'

PREFECTURES = "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県".split()
PREF_ZONE = {}
for zone, codes in {
    1: [42], 2: [40, 41, 43, 44, 45, 46], 3: [32, 34, 35],
    4: [36, 37, 38, 39], 5: [28, 31, 33], 6: [18, 24, 25, 26, 27, 29, 30],
    7: [16, 17, 21, 23], 8: [15, 19, 20, 22],
    9: [7, 8, 9, 10, 11, 12, 13, 14], 10: [2, 3, 4, 5, 6],
}.items():
    for code in codes:
        PREF_ZONE[code] = zone


def zone_for(properties, lon, lat):
    """GSI Notification No. 9, including municipal/island exceptions."""
    prefecture = PREFECTURES.index(properties['N03_001']) + 1
    if prefecture == 1:
        office, city = properties['N03_002'], properties['N03_004']
        if office in ('後志総合振興局', '渡島総合振興局', '檜山振興局') or city in (
            '小樽市', '函館市', '伊達市', '北斗市', '豊浦町', '壮瞥町', '洞爺湖町'
        ):
            return 11
        if office in ('十勝総合振興局', '釧路総合振興局', '根室振興局') or city in (
            '北見市', '帯広市', '釧路市', '網走市', '美幌町', '津別町', '斜里町',
            '清里町', '小清水町', '訓子府町', '置戸町', '佐呂間町', '大空町'
        ):
            return 13
        return 12
    if prefecture == 13 and lat < 28:
        return 18 if lon < 140.5 else 19 if lon > 143 else 14
    if prefecture == 47:
        return 16 if lon < 126 else 17 if lon > 130 else 15
    if prefecture == 46 and 27 <= lat <= 32 and 128.3 <= lon <= (130 + 13 / 60):
        # The extension east of 130 degrees is for the Amami archipelago only.
        if lon <= 130 or lat < 29.5:
            return 1
    return PREF_ZONE[prefecture]


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for item in geometry.geoms:
            yield from polygons(item)


def delta_ring(ring, scale):
    result, last_x, last_y = [], 0, 0
    # The runtime closes rings, so do not duplicate the final coordinate.
    points = list(ring.coords)[:-1]
    for x, y in points:
        x, y = round(x * scale), round(y * scale)
        if result and x == last_x and y == last_y:
            continue
        result.extend((x - last_x, y - last_y))
        last_x, last_y = x, y
    return result


def encode_signed(values):
    """Compact lossless signed varints; decoded lazily by the JS resolver."""
    result = []
    for value in values:
        value = value * 2 if value >= 0 else -value * 2 - 1
        while value >= 32:
            result.append(chr((value & 31) + 95))
            value >>= 5
        result.append(chr(value + 63))
    return ''.join(result)


def simplify_ring(ring, near_other_zone):
    """Use 1m detail near another zone, about 100m on remote coastlines."""
    points = np.asarray(ring.coords)[:-1]
    fine = contains_xy(near_other_zone, points[:, 0], points[:, 1])
    transitions = np.flatnonzero(fine != np.roll(fine, 1))
    if not len(transitions):
        tolerance = 0.00001 if fine[0] else 0.001
        return list(LineString(ring.coords).simplify(tolerance).coords)
    # Start at a classification change; simplify each run with shared ends.
    start = transitions[0]
    points, fine = np.roll(points, -start, axis=0), np.roll(fine, -start)
    transitions = [0, *np.flatnonzero(fine[1:] != fine[:-1]) + 1, len(points)]
    closed = np.vstack([points, points[0]])
    result = []
    for start, end in zip(transitions, transitions[1:]):
        line = LineString(closed[start:end + 1])
        simplified = list(line.simplify(0.00001 if fine[start] else 0.001).coords)
        result.extend(simplified[:-1])
    return result + result[:1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=pathlib.Path)
    parser.add_argument('--cache-dir', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    with args.archive.open('rb') as stream:
        source_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
    print('Source SHA256:', source_hash, flush=True)
    if source_hash != SOURCE_SHA256:
        raise ValueError('Expected the documented N03-20230101_GML.zip source')
    cache = args.cache_dir / ('zones-' + source_hash[:16] + '.json')
    if cache.exists():
        merged = {int(zone): wkb.loads(bytes.fromhex(value)) for zone, value in json.loads(cache.read_text()).items()}
    else:
        with zipfile.ZipFile(args.archive) as archive:
            for ext in ('shp', 'shx', 'dbf'):
                name = 'N03-23_230101.' + ext
                target = args.cache_dir / name
                if not target.exists():
                    with archive.open(name) as source, target.open('wb') as output:
                        shutil.copyfileobj(source, output)
        reader = shapefile.Reader(str(args.cache_dir / 'N03-23_230101.shp'), encoding='cp932')
        grouped = defaultdict(list)
        for index, record in enumerate(reader.iterShapeRecords()):
            geometry = shape(record.shape.__geo_interface__)
            if not geometry.is_valid:
                geometry = make_valid(geometry)
            properties = record.record.as_dict()
            for polygon in polygons(geometry):
                point = polygon.representative_point()
                grouped[zone_for(properties, point.x, point.y)].append(polygon)
            if index % 10000 == 0:
                print('Read', index, '/', len(reader), flush=True)
        merged = {}
        for zone in sorted(grouped):
            print('Dissolving zone', zone, 'parts', len(grouped[zone]), flush=True)
            merged[zone] = unary_union(grouped[zone])
        cache.write_text(json.dumps({zone: value.wkb_hex for zone, value in merged.items()}))
    zones = sorted(merged)
    geometries = [merged[zone] for zone in zones]
    print('Original vertices', sum(int(get_num_coordinates(g)) for g in geometries), flush=True)
    # Avoid an expensive national union of ten million vertices. A coarse
    # envelope of OTHER zones selects all near-border vertices for fine detail.
    # Its 0.02-degree buffer exceeds the coarse simplification tolerance, so
    # this mask is not used as the actual administrative boundary.
    rough = []
    for geometry in geometries:
        # The fine-border mask need not retain uninhabited tiny islets or
        # inland water holes. They remain in the final source/anchor pass.
        parts = [Polygon(part.exterior).simplify(0.005, preserve_topology=True)
                 for part in polygons(geometry) if part.area >= 0.000001]
        rough.append(unary_union(parts))
    simplified = []
    for index, (zone, geometry) in enumerate(zip(zones, geometries)):
        print('Simplifying zone', zone, flush=True)
        nearby = [item for j, item in enumerate(rough) if j != index and
                  item.envelope.distance(geometry.envelope) < 0.05]
        near_other = unary_union(nearby).buffer(0.02)
        prepare(near_other)
        kept = []
        for polygon in polygons(geometry):
            if polygon.area < 0.000001:
                continue
            outer = simplify_ring(polygon.exterior, near_other)
            if len(outer) < 4:
                continue
            holes = [simplify_ring(ring, near_other) for ring in polygon.interiors]
            result = Polygon(outer, [ring for ring in holes if len(ring) >= 4])
            if not result.is_valid:
                result = make_valid(result)
            kept.extend(polygons(result))
        # Store disjoint parts individually. No national geometry merge is
        # needed by the runtime spatial index.
        simplified.append(kept)
    # Numeric quantization is approximately 0.1m in latitude. This is NOT a
    # claim that the administrative boundaries have 0.1m positional accuracy.
    scale = 1000000
    entries, islets = [], {}
    for zone, original, parts in zip(zones, geometries, simplified):
        # Retain tiny islands as sparse 100m-cell anchors. These are consulted
        # only when no area polygon contains the query; never move a land point
        # across an administrative boundary just because an anchor is nearby.
        for polygon in polygons(original):
            if polygon.area < 0.00001:
                point = polygon.representative_point()
                key = (zone, round(point.x * 1000), round(point.y * 1000))
                islets.setdefault(key, [zone, round(point.x * scale), round(point.y * scale)])
        for polygon in parts:
            if polygon.area < 0.000001:
                continue
            outer = delta_ring(polygon.exterior, scale)
            if len(outer) < 6:
                continue
            holes = [delta_ring(ring, scale) for ring in polygon.interiors]
            rings = [outer, *[ring for ring in holes if len(ring) >= 6]]
            bounds = [round(value * scale) for value in polygon.bounds]
            entries.append([zone, bounds, [encode_signed(ring) for ring in rings]])
    grouped_islets = defaultdict(list)
    for zone, x, y in islets.values():
        grouped_islets[(zone, x // scale, y // scale)].append((x, y))
    islet_groups = []
    for (zone, _, _), points in sorted(grouped_islets.items()):
        values, last_x, last_y = [], 0, 0
        for x, y in sorted(points, key=lambda item: (item[1], item[0])):
            values.extend((x - last_x, y - last_y))
            last_x, last_y = x, y
        bounds = [min(p[0] for p in points), min(p[1] for p in points),
                  max(p[0] for p in points), max(p[1] for p in points)]
        islet_groups.append([zone, bounds, encode_signed(values)])
    dataset = {'version': 1, 'encoding': 'signed-varint5', 'source': 'MLIT N03-2023', 'sourceSha256': source_hash, 'scale': scale, 'polygons': entries, 'isletGroups': islet_groups}
    encoded = json.dumps(dataset, separators=(',', ':'))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text('// Generated by scripts/build-japan-plane-zone-data.py. See data/JAPAN_PLANE_ZONES.md.\n' +
                           'globalThis.EzJapanPlaneZoneData=' + encoded + ';\n', encoding='utf-8')
    print('Output polygons', len(entries), 'bytes', args.output.stat().st_size, flush=True)


if __name__ == '__main__':
    main()
