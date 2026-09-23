export const EPS = 1e-8;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const cross = (a, b, c) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function inside(p, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
}
export function properCross(a, b, c, d) {
  return (
    cross(a, b, c) * cross(a, b, d) < -1e-12 &&
    cross(c, d, a) * cross(c, d, b) < -1e-12
  );
}
export function pointSegment(p, a, b) {
  const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len
    ? Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len,
        ),
      )
    : 0;
  return {
    distance: dist(p, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
    t,
  };
}
export function barycentric(p, a, b, c) {
  const det = cross(a, b, c);
  if (Math.abs(det) < 1e-12) return null;
  const u = cross(p, b, c) / det,
    v = cross(a, p, c) / det,
    w = 1 - u - v;
  return u >= -EPS && v >= -EPS && w >= -EPS
    ? { u, v, w, z: a.z * u + b.z * v + c.z * w }
    : null;
}
export function pathInfo(path) {
  if (path.length < 2) throw Error("中心線は2点以上必要です");
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1], path[i]);
    if (d < 1e-6) throw Error("中心線に重複する隣接点があります");
    lengths.push(lengths.at(-1) + d);
  }
  return { lengths, total: lengths.at(-1) };
}
export function stationAt(path, chainage) {
  const { lengths, total } = pathInfo(path);
  if (chainage < -EPS || chainage > total + EPS)
    throw Error("測点が中心線の範囲外です");
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < chainage - EPS) i++;
  const a = path[i - 1],
    b = path[i],
    len = lengths[i] - lengths[i - 1],
    t = (chainage - lengths[i - 1]) / len;
  return {
    chainage,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    tx: (b.x - a.x) / len,
    ty: (b.y - a.y) / len,
    segment: i - 1,
    atVertex: i < path.length - 1 && Math.abs(chainage - lengths[i]) < EPS,
  };
}
export function stations(path, pitch, extras = []) {
  const { total } = pathInfo(path);
  if (
    !Number.isFinite(pitch) ||
    pitch <= 0 ||
    total / pitch > 500 ||
    extras.length > 500
  )
    throw Error("ピッチは正数、横断は500断面以内にしてください");
  const values = [0, total, ...extras];
  for (let s = pitch; s < total; s += pitch) values.push(s);
  for (const s of values)
    if (!Number.isFinite(s) || s < 0 || s > total)
      throw Error("追加測点が範囲外です");
  const unique = [
    ...new Set(values.map((s) => Math.round(s * 1e8) / 1e8)),
  ].sort((a, b) => a - b);
  if (unique.length > 500)
    throw Error("端点・追加測点を含め500断面以内にしてください");
  return unique.map((s) => stationAt(path, s));
}
export function triangleSection(vertices, station, width, angle = 0) {
  const r = (angle * Math.PI) / 180,
    tx = station.tx * Math.cos(r) - station.ty * Math.sin(r),
    ty = station.tx * Math.sin(r) + station.ty * Math.cos(r),
    nx = -ty,
    ny = tx;
  const signed = (p) => (p.x - station.x) * tx + (p.y - station.y) * ty,
    offset = (p) => (p.x - station.x) * nx + (p.y - station.y) * ny;
  const values = vertices.map(signed);
  if (values.every((v) => Math.abs(v) < EPS))
    return { coplanar: true, points: [] };
  const hits = [];
  for (let i = 0; i < 3; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % 3],
      da = values[i],
      db = values[(i + 1) % 3];
    if (Math.abs(da) < EPS) hits.push({ x: offset(a), z: a.z });
    if (da * db < 0) {
      const t = da / (da - db);
      hits.push({
        x: offset({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
        z: a.z + (b.z - a.z) * t,
      });
    }
  }
  const unique = hits.filter(
    (p, i) =>
      hits.findIndex(
        (q) => Math.abs(p.x - q.x) < EPS && Math.abs(p.z - q.z) < EPS,
      ) === i,
  );
  if (unique.length < 2) return null;
  let [a, b] = unique;
  if (a.x > b.x) [a, b] = [b, a];
  if (a.x > width || b.x < -width) return null;
  if (b.x - a.x > EPS) {
    const slope = (b.z - a.z) / (b.x - a.x);
    if (a.x < -width) a = { x: -width, z: a.z + (-width - a.x) * slope };
    if (b.x > width) b = { x: width, z: a.z + (width - a.x) * slope };
  }
  return { points: [a, b] };
}
