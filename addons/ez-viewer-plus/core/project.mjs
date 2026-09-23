import { finite } from "./io.mjs";
export function newProject() {
  return {
    id: `plus-${Date.now()}`,
    revision: 0,
    sources: [],
    points: [],
    surfaces: [],
    walls: [],
    exclusions: [],
    centerline: [],
    accepted: [],
    settings: {
      useDem: false,
      zone: 0,
      coordinatesConfirmed: false,
      pitch: 10,
      width: 20,
      extras: [],
      sectionAngle: 0,
      demSpacing: 5,
    },
  };
}
export function addSource(project, source) {
  if (project.sources.some((s) => s.id === source.id))
    throw Error("同じファイルは既に読み込まれています");
  if (project.sources.length >= 10) throw Error("1作業10ファイルまでです");
  if (project.points.length + source.points.length > 20000)
    throw Error("作業全体で20,000点までです");
  project.sources.push(source);
  project.points.push(...structuredClone(source.points));
  project.revision++;
}
export function validateProject(value) {
  if (value?.format !== "EZ_VIEWER_PLUS" || value.version !== 1)
    throw Error("EZ Viewer Plusの作業JSONではありません");
  const p = value.project;
  if (
    !p ||
    !Array.isArray(p.sources) ||
    p.sources.length > 10 ||
    !Array.isArray(p.points) ||
    p.points.length > 20000
  )
    throw Error("作業データの件数が不正です");
  const number = (n) => {
      if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e9)
        throw Error("数値が不正です");
    },
    xy = (v) => {
      if (!v) throw Error("座標が不正です");
      number(v.x);
      number(v.y);
    },
    strings = (a) => Array.isArray(a) && a.every((v) => typeof v === "string");
  if (
    typeof p.id !== "string" ||
    !Number.isSafeInteger(p.revision) ||
    p.revision < 0
  )
    throw Error("作業ID・版が不正です");
  const ids = new Set();
  for (const point of p.points) {
    if (typeof point.id !== "string" || ids.has(point.id))
      throw Error("点IDが重複しています");
    ids.add(point.id);
    xy(point);
    if (point.z !== null) number(point.z);
    if (typeof point.name !== "string" || !strings(point.sourceIds))
      throw Error("点の情報が不正です");
  }
  for (const key of [
    "surfaces",
    "walls",
    "exclusions",
    "centerline",
    "accepted",
  ])
    if (!Array.isArray(p[key])) throw Error(`${key}が不正です`);
  if (
    p.centerline.length > 2000 ||
    p.surfaces.length > 200 ||
    p.walls.length > 200 ||
    p.exclusions.length > 200
  )
    throw Error("作業の規模が上限を超えます");
  const surfaceIds = new Set();
  for (const s of [...p.surfaces, ...p.walls]) {
    if (
      typeof s.id !== "string" ||
      s.id === "DEM" ||
      surfaceIds.has(s.id) ||
      typeof s.name !== "string"
    )
      throw Error("面ID・名前が不正です");
    surfaceIds.add(s.id);
  }
  for (const s of p.surfaces) {
    if (
      !Array.isArray(s.pointIds) ||
      s.pointIds.some((id) => !ids.has(id)) ||
      !["terrain", "road", "channel", "bridge"].includes(s.kind) ||
      !(s.maxEdge > 0 && s.maxEdge <= 1000) ||
      typeof s.maxEdge !== "number" ||
      !Array.isArray(s.breaklines) ||
      s.breaklines.some(
        (line) =>
          !Array.isArray(line) ||
          line.length < 2 ||
          line.some((id) => !s.pointIds.includes(id)),
      )
    )
      throw Error("面の指定が不正です");
  }
  for (const w of p.walls) {
    if (
      !Array.isArray(w.upperIds) ||
      !Array.isArray(w.lowerIds) ||
      [...w.upperIds, ...w.lowerIds].some((id) => !ids.has(id))
    )
      throw Error("擁壁の参照が不正です");
  }
  for (const polygon of p.exclusions)
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 2000)
      throw Error("除外範囲が不正です");
  for (const point of [...p.centerline, ...p.exclusions.flat()]) xy(point);
  if (
    !p.settings ||
    typeof p.settings.useDem !== "boolean" ||
    !Array.isArray(p.settings.extras)
  )
    throw Error("設定が不正です");
  for (const k of ["pitch", "width", "sectionAngle", "zone", "demSpacing"])
    number(p.settings[k]);
  const settings = p.settings;
  if (
    settings.pitch <= 0 ||
    settings.width <= 0 ||
    settings.width > 1000 ||
    Math.abs(settings.sectionAngle) > 80 ||
    !Number.isInteger(settings.zone) ||
    settings.zone < 0 ||
    settings.zone > 19 ||
    settings.demSpacing < 5 ||
    typeof settings.coordinatesConfirmed !== "boolean" ||
    settings.extras.length > 500
  )
    throw Error("設定の範囲が不正です");
  settings.extras.forEach(number);
  const sourceIds = new Set();
  let entityCount = 0;
  for (const s of p.sources) {
    if (
      typeof s.id !== "string" ||
      sourceIds.has(s.id) ||
      typeof s.name !== "string" ||
      typeof s.frame !== "string" ||
      !["SFC", "SIMA"].includes(s.format) ||
      !Array.isArray(s.entities) ||
      !Array.isArray(s.records) ||
      s.records.length > 300000 ||
      typeof s.rawText !== "string" ||
      s.rawText.length > 32 * 1024 * 1024 ||
      !Array.isArray(s.figures) ||
      !Array.isArray(s.points) ||
      !strings(s.warnings)
    )
      throw Error("元データの形式が不正です");
    sourceIds.add(s.id);
    entityCount += s.entities.length;
    for (const f of s.figures)
      if (
        !f ||
        typeof f.name !== "string" ||
        !Number.isSafeInteger(f.count) ||
        f.count < 0
      )
        throw Error("部分図の情報が不正です");
    if (
      s.format === "SFC" &&
      (![0.001, 1].includes(s.unitScale) ||
        typeof s.selectedFigure !== "string")
    )
      throw Error("部分図単位が不正です");
    for (const e of s.entities) {
      if (
        typeof e.id !== "string" ||
        typeof e.layer !== "string" ||
        !strings(e.sourceIds) ||
        !["polyline", "circle", "arc", "marker", "text"].includes(e.kind)
      )
        throw Error("図形の形式が不正です");
      if (e.points) {
        if (!Array.isArray(e.points) || e.points.length > 300000)
          throw Error("折線が不正です");
        for (const pair of e.points) {
          if (!Array.isArray(pair) || pair.length !== 2)
            throw Error("折線点が不正です");
          pair.forEach(number);
        }
      } else xy(e);
      if (e.kind === "text") {
        if (typeof e.text !== "string") throw Error("文字が不正です");
        number(e.angle);
        number(e.height);
      }
      if (e.kind === "circle") {
        xy(e);
        number(e.radius);
      }
    }
  }
  if (entityCount > 400000) throw Error("図形数が上限を超えます");
  for (const a of p.accepted)
    if (
      !a ||
      typeof a.rowId !== "string" ||
      !ids.has(a.pointId) ||
      !sourceIds.has(a.sourceId)
    )
      throw Error("採用対応の参照が不正です");
  return structuredClone(p);
}
export function projectJson(project) {
  return JSON.stringify(
    {
      format: "EZ_VIEWER_PLUS",
      version: 1,
      savedAt: new Date().toISOString(),
      project,
    },
    null,
    2,
  );
}
const cell = (value) => {
  let s = String(value ?? "");
  if (/^[=+@-]/.test(s) && !/^[-+]?\d+(?:\.\d+)?$/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export function sectionCsv(sections) {
  const rows = [
    [
      "model_version",
      "mode",
      "chainage_m",
      "surface",
      "segment",
      "offset_left_positive_m",
      "elevation_m",
      "classification",
      "source_ids",
    ],
  ];
  for (const section of sections) {
    for (const [i, s] of section.segments.entries())
      for (const p of s.points)
        rows.push([
          section.modelVersion,
          section.mode,
          section.station.chainage,
          s.surface,
          i,
          p.x.toFixed(6),
          p.z.toFixed(6),
          s.kind === "dem" ? "DEM補助" : "面からの切断交点（実測点ではない）",
          s.sourceIds.join("|"),
        ]);
    for (const g of section.gaps)
      rows.push([
        section.modelVersion,
        section.mode,
        section.station.chainage,
        "UNKNOWN",
        `${g.from}..${g.to}`,
        "",
        "",
        "未確定・線を接続しない",
        "",
      ]);
  }
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
export function sectionSvg(section) {
  const segments = section.segments,
    points = segments.flatMap((s) => s.points);
  if (!points.length) throw Error("この断面には出力可能な線がありません");
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z),
    xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    zmin = Math.min(...zs),
    zmax = Math.max(...zs);
  const x = (v) => 40 + ((v - xmin) / Math.max(1, xmax - xmin)) * 720,
    y = (v) => 340 - ((v - zmin) / Math.max(1, zmax - zmin)) * 260;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="white"/><text x="40" y="28" font-size="16">EZ Viewer Plus / ${section.station.chainage.toFixed(3)}m / ${section.mode}</text>${segments.map((s) => `<line x1="${x(s.points[0].x)}" y1="${y(s.points[0].z)}" x2="${x(s.points[1].x)}" y2="${y(s.points[1].z)}" stroke="${s.kind === "dem" ? "#be7829" : "#176a64"}" stroke-width="2" ${s.kind === "dem" ? 'stroke-dasharray="5 4"' : ""}/>`).join("")}<text x="40" y="382" font-size="12">表示用SVG / 横縦の表示倍率は別 / 隙間は未確定 / 測量精度の保証ではありません</text></svg>`;
}
