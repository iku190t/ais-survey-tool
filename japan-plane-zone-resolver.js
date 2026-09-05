/* Offline zone lookup. Geographic data attribution: data/JAPAN_PLANE_ZONES.md. */
(function (global) {
  'use strict';
  const CELL_DEGREES = 0.25;
  const NEAR_COAST_METERS = 3000;
  let source = null, cells = null;
  const decoded = new Map();
  const decodedIslets = new Map();

  function ready() {
    const data = global.EzJapanPlaneZoneData;
    return data?.version === 1 && data.encoding === 'signed-varint5' && !!data.polygons?.length;
  }
  function cellKey(x, y) { return `${x},${y}`; }
  function addToCells(bounds, kind, index, scale) {
    const pad = 0.05 * scale;
    const cell = CELL_DEGREES * scale;
    for (let x = Math.floor((bounds[0] - pad) / cell); x <= Math.floor((bounds[2] + pad) / cell); x++) {
      for (let y = Math.floor((bounds[1] - pad) / cell); y <= Math.floor((bounds[3] + pad) / cell); y++) {
        const key = cellKey(x, y);
        if (!cells.has(key)) cells.set(key, { polygons: [], isletGroups: [] });
        cells.get(key)[kind].push(index);
      }
    }
  }
  function initialize() {
    if (!ready()) return false;
    if (source === global.EzJapanPlaneZoneData) return true;
    source = global.EzJapanPlaneZoneData;
    cells = new Map(); decoded.clear(); decodedIslets.clear();
    source.polygons.forEach((entry, index) => addToCells(entry[1], 'polygons', index, source.scale));
    source.isletGroups.forEach((entry, index) => addToCells(entry[1], 'isletGroups', index, source.scale));
    return true;
  }
  function decodePoints(encoded) {
    const points = [];
    let value = 0, shift = 0, x = 0, y = 0;
    for (let i = 0; i < encoded.length; i++) {
      const byte = encoded.charCodeAt(i) - 63;
      value += (byte & 31) * (2 ** shift);
      if (byte >= 32) { shift += 5; continue; }
      const delta = value & 1 ? -(value + 1) / 2 : value / 2;
      if (points.length % 2 === 0) { x += delta; points.push(x); }
      else { y += delta; points.push(y); }
      value = 0; shift = 0;
    }
    return Int32Array.from(points);
  }
  function ringsAt(index) {
    if (!decoded.has(index)) {
      decoded.set(index, source.polygons[index][2].map(decodePoints));
    }
    return decoded.get(index);
  }
  function insideRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = ring[i], ay = ring[i + 1], bx = ring[j], by = ring[j + 1];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    return inside;
  }
  function ringDistanceSquared(x, y, ring, longitudeWeight) {
    let best = Infinity;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = (ring[j] - x) * longitudeWeight, ay = ring[j + 1] - y;
      const bx = (ring[i] - x) * longitudeWeight, by = ring[i + 1] - y;
      const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
      best = Math.min(best, (ax + t * dx) ** 2 + (ay + t * dy) ** 2);
    }
    return best;
  }
  function resolve(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || !initialize()) return null;
    const bucket = cells.get(cellKey(Math.floor(lon / CELL_DEGREES), Math.floor(lat / CELL_DEGREES)));
    if (!bucket) return null;
    const x = lon * source.scale, y = lat * source.scale;
    for (const index of bucket.polygons) {
      const [zone, bounds] = source.polygons[index];
      if (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3]) continue;
      const rings = ringsAt(index);
      if (insideRing(x, y, rings[0]) && !rings.slice(1).some(ring => insideRing(x, y, ring))) {
        return { zone, method: 'administrative-area', distanceMeters: 0 };
      }
    }
    // N03 coastlines exclude water and can predate reclaimed land. Nearby
    // coastal/islet fallback uses the zone of that land, not projection-origin
    // distance (which is unrelated to administrative applicability).
    const longitudeWeight = Math.cos(lat * Math.PI / 180), metersPerUnit = 111320 / source.scale;
    let bestDistance = (NEAR_COAST_METERS / metersPerUnit) ** 2, bestZone = null;
    for (const index of bucket.polygons) {
      const [zone, bounds] = source.polygons[index];
      const dx = Math.max(bounds[0] - x, 0, x - bounds[2]) * longitudeWeight;
      const dy = Math.max(bounds[1] - y, 0, y - bounds[3]);
      if (dx * dx + dy * dy > bestDistance) continue;
      for (const ring of ringsAt(index)) {
        const distance = ringDistanceSquared(x, y, ring, longitudeWeight);
        if (distance < bestDistance) { bestDistance = distance; bestZone = zone; }
      }
    }
    for (const index of bucket.isletGroups) {
      const [zone, bounds, encoded] = source.isletGroups[index];
      const dx = Math.max(bounds[0] - x, 0, x - bounds[2]) * longitudeWeight;
      const dy = Math.max(bounds[1] - y, 0, y - bounds[3]);
      if (dx * dx + dy * dy > bestDistance) continue;
      if (!decodedIslets.has(index)) decodedIslets.set(index, decodePoints(encoded));
      const points = decodedIslets.get(index);
      for (let i = 0; i < points.length; i += 2) {
        const distance = ((points[i] - x) * longitudeWeight) ** 2 + (points[i + 1] - y) ** 2;
        if (distance < bestDistance) { bestDistance = distance; bestZone = zone; }
      }
    }
    return bestZone ? { zone: bestZone, method: 'near-coast', distanceMeters: Math.sqrt(bestDistance) * metersPerUnit } : null;
  }
  global.EzJapanPlaneZoneResolver = Object.freeze({ resolve, ready });
})(globalThis);
