import * as vendor from "../vendor/proj4.js";
const proj4 = globalThis.proj4 || vendor.default;
export const ZONES = [
  [33, 129.5],
  [33, 131],
  [36, 132 + 10 / 60],
  [33, 133.5],
  [36, 134 + 20 / 60],
  [36, 136],
  [36, 137 + 10 / 60],
  [36, 138.5],
  [36, 139 + 50 / 60],
  [40, 140 + 50 / 60],
  [44, 140.25],
  [44, 142.25],
  [44, 144.25],
  [26, 142],
  [26, 127.5],
  [26, 124],
  [26, 131],
  [20, 136],
  [26, 154],
];
export function toLonLat(point, zone) {
  if (!Number.isInteger(zone) || zone < 1 || zone > 19)
    throw Error("DEMを使うには平面直角座標の系を指定してください");
  const [lat, lon] = ZONES[zone - 1];
  return proj4(
    `+proj=tmerc +lat_0=${lat} +lon_0=${lon} +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`,
    "+proj=longlat +ellps=GRS80 +no_defs",
    [point.x, point.y],
  );
}
export const decodeHeight = (r, g, b) => {
  const n = r * 65536 + g * 256 + b;
  return n === 8388608 ? null : (n > 8388608 ? n - 16777216 : n) * 0.01;
};
export function tilePixel(lon, lat, z) {
  const n = 2 ** z,
    x = ((lon + 180) / 360) * n,
    y = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    px: Math.floor((x % 1) * 256),
    py: Math.floor((y % 1) * 256),
  };
}
export const DEM_SOURCES = [
  ["dem1a_png", 17],
  ["dem5a_png", 15],
  ["dem5b_png", 15],
  ["dem5c_png", 15],
  ["dem_png", 14],
];
async function pngPixels(url, signal) {
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Error(`DEM通信 HTTP ${response.status}`);
  const blob = await response.blob();
  if (blob.size > 2 * 1024 * 1024) throw Error("DEM応答が大きすぎます");
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width !== 256 || bitmap.height !== 256)
      throw Error("DEM画像寸法が不正です");
    const canvas = new OffscreenCanvas(256, 256),
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, 256, 256).data;
  } finally {
    bitmap.close();
  }
}
export async function loadDem(
  project,
  { loader = pngPixels, signal, onProgress = () => {} } = {},
) {
  // OFF is a strict no-network/no-cache-use branch, including project reload.
  if (!project.settings.useDem) return [];
  if (!project.settings.coordinatesConfirmed)
    throw Error(
      "DEMの前に「現場の平面直角座標と確認済み」をチェックしてください",
    );
  if (!project.centerline.length)
    throw Error("DEM取得範囲を決める中心線を指定してください");
  const path = project.centerline,
    w = project.settings.width + 5,
    zone = project.settings.zone;
  const minX = Math.min(...path.map((p) => p.x)) - w,
    maxX = Math.max(...path.map((p) => p.x)) + w,
    minY = Math.min(...path.map((p) => p.y)) - w,
    maxY = Math.max(...path.map((p) => p.y)) + w;
  if ((maxX - minX) * (maxY - minY) > 1000000)
    throw Error("DEM補助は1km²以内の中心線範囲で実行してください");
  const spacing = Math.max(
    5,
    Math.ceil(Math.max(maxX - minX, maxY - minY) / 25),
  );
  project.settings.demSpacing = spacing;
  const jobs = [];
  for (let y = minY; y <= maxY + 1e-6; y += spacing)
    for (let x = minX; x <= maxX + 1e-6; x += spacing) jobs.push({ x, y });
  const cache = new Map(),
    points = [];
  let done = 0,
    requests = 0;
  const sample = async (p) => {
    if (signal?.aborted) throw new DOMException("中止", "AbortError");
    const [lon, lat] = toLonLat(p, zone);
    if (lon < 120 || lon > 156 || lat < 19 || lat > 47)
      throw Error(
        "DEM取得位置が国内の想定範囲外です。座標系・部分図・単位を確認してください",
      );
    for (const [id, z] of DEM_SOURCES) {
      const t = tilePixel(lon, lat, z),
        url = `https://cyberjapandata.gsi.go.jp/xyz/${id}/${z}/${t.x}/${t.y}.png`;
      if (!cache.has(url)) {
        if (++requests > 96)
          throw Error("DEM取得タイル上限です。中心線範囲を狭めてください");
        cache.set(url, loader(url, signal));
      }
      const pixels = await cache.get(url);
      if (!pixels) continue;
      const at = (t.py * 256 + t.px) * 4,
        height = decodeHeight(pixels[at], pixels[at + 1], pixels[at + 2]);
      if (height !== null && Number.isFinite(height)) {
        points.push({
          id: `DEM:${p.x}:${p.y}`,
          name: id,
          x: p.x,
          y: p.y,
          z: height,
          kind: "dem",
          fixed: false,
          sourceIds: [url],
          method: "国土地理院DEM画素値",
          rawXYZ: { x: String(p.x), y: String(p.y), z: String(height) },
        });
        break;
      }
    }
    onProgress(++done, jobs.length);
  };
  let index = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < jobs.length) await sample(jobs[index++]);
    }),
  );
  return points;
}
