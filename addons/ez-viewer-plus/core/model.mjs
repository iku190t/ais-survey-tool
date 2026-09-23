import * as vendor from "../vendor/delaunator.js";
import {
  dist,
  cross,
  inside,
  properCross,
  barycentric,
  stations,
  triangleSection,
  EPS,
} from "./geometry.mjs";
const Delaunator = globalThis.Delaunator || vendor.default;
export function buildModel(project, { demPoints = [] } = {}) {
  const points = structuredClone(project.points),
    byId = new Map(points.map((p) => [p.id, p])),
    faces = [],
    boundaries = new Map(),
    issues = [];
  const model = {
    version: `${project.id}:${project.revision}`,
    points,
    faces,
    boundaries: [],
    issues,
    demUsed: false,
  };
  const issue = (code, message, pointIds = [], level = "warning") =>
    issues.push({ code, message, pointIds, level });
  const face = (ids, surface, kind, method) => {
    if (ids.some((id) => !byId.has(id))) return;
    const edgeIds = [];
    for (let i = 0; i < 3; i++) {
      const pair = [ids[i], ids[(i + 1) % 3]].sort(),
        id = JSON.stringify(pair);
      if (!boundaries.has(id)) boundaries.set(id, { id, pointIds: pair });
      edgeIds.push(id);
    }
    faces.push({
      id: `${surface}:${faces.length}`,
      pointIds: ids,
      boundaryIds: edgeIds,
      surface,
      kind,
      method,
      modelVersion: model.version,
      sourceIds: [
        ...new Set(ids.flatMap((id) => byId.get(id).sourceIds || [])),
      ],
      status: kind === "dem" ? "dem" : "inferred",
    });
  };
  const masked = (vertices) =>
    (project.exclusions || []).some(
      (poly) =>
        vertices.some((p) => inside(p, poly)) ||
        poly.some((p) => barycentric(p, ...vertices)) ||
        vertices.some((a, i) =>
          poly.some((c, j) =>
            properCross(
              a,
              vertices[(i + 1) % 3],
              c,
              poly[(j + 1) % poly.length],
            ),
          ),
        ),
    );
  function surface(group, selected, kind) {
    const pts = selected
      .filter((p) => p.z !== null && Number.isFinite(p.z))
      .sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id));
    if (pts.length < 3) {
      issue(
        "few-points",
        `${group.name}: 有効な高さが3点未満。面を作りません`,
        selected.map((p) => p.id),
      );
      return;
    }
    if (pts.length > 10000)
      throw Error(`${group.name}: 1面10,000点以下に分割してください`);
    const unique = [],
      locations = new Map();
    let conflict = false;
    for (const p of pts) {
      const key = `${p.x},${p.y}`,
        prev = locations.get(key);
      if (prev && Math.abs(prev.z - p.z) > EPS) {
        issue(
          "multi-z",
          `${group.name}: 同じXYに別の高さ。別の面に分けるか擁壁として指定してください`,
          [prev.id, p.id],
          "error",
        );
        conflict = true;
      } else if (!prev) {
        unique.push(p);
        locations.set(key, p);
      } else
        issue(
          "duplicate-xyz",
          `${group.name}: 同位置同標高の点は片方を三角形頂点として参照`,
          [prev.id, p.id],
        );
    }
    if (conflict) return;
    const origin = unique[0],
      tin = Delaunator.from(
        unique,
        (p) => p.x - origin.x,
        (p) => p.y - origin.y,
      ),
      constraints = (group.breaklines || [])
        .flatMap((ids) =>
          ids.slice(1).map((id, i) => [byId.get(ids[i]), byId.get(id)]),
        )
        .filter((pair) => pair.every(Boolean));
    const start = faces.length;
    for (let i = 0; i < tin.triangles.length; i += 3) {
      const v = [0, 1, 2].map((j) => unique[tin.triangles[i + j]]);
      if (Math.abs(cross(...v)) < 1e-10) continue;
      if (v.some((p, j) => dist(p, v[(j + 1) % 3]) > group.maxEdge)) continue;
      if (masked(v)) continue;
      if (
        constraints.some(([a, b]) =>
          v.some((p, j) => properCross(p, v[(j + 1) % 3], a, b)),
        )
      )
        continue;
      face(
        v.map((p) => p.id),
        group.id,
        kind,
        kind === "dem"
          ? "DEM格子の線形補間"
          : "確認済み所属点の三角形内線形補間",
      );
    }
    if (faces.length === start)
      issue(
        "no-faces",
        `${group.name}: 面なし。高さ・点配置・最大辺長・除外範囲を確認してください`,
        pts.map((p) => p.id),
      );
    for (const [a, b] of constraints) {
      if (!boundaries.has(JSON.stringify([a.id, b.id].sort())))
        issue(
          "breakline-gap",
          `${group.name}: 制約線を跨ぐ面を除外しましたが、線を辺とする面が未生成です。点追加・面分割が必要`,
          [a.id, b.id],
        );
    }
  }
  for (const group of project.surfaces) {
    const selected = group.pointIds.map((id) => byId.get(id)).filter(Boolean);
    surface(group, selected, group.kind);
  }
  for (const wall of project.walls || []) {
    const upper = wall.upperIds.map((id) => byId.get(id)),
      lower = wall.lowerIds.map((id) => byId.get(id));
    if (
      upper.length < 2 ||
      upper.length !== lower.length ||
      [...upper, ...lower].some((p) => !p || !Number.isFinite(p.z))
    ) {
      issue(
        "wall-incomplete",
        `${wall.name}: 上端・下端は同数の高さ付き点を順序通り指定してください`,
        [...wall.upperIds, ...wall.lowerIds],
        "error",
      );
      continue;
    }
    for (let i = 1; i < upper.length; i++) {
      face(
        [upper[i - 1].id, upper[i].id, lower[i].id],
        wall.id,
        "wall",
        "利用者指定の上下対応",
      );
      face(
        [upper[i - 1].id, lower[i].id, lower[i - 1].id],
        wall.id,
        "wall",
        "利用者指定の上下対応",
      );
    }
  }
  if (project.settings.useDem && demPoints.length) {
    for (const p of demPoints) {
      if (byId.has(p.id)) throw Error("DEM点IDが入力点と重複");
      points.push(structuredClone(p));
      byId.set(p.id, points.at(-1));
    }
    surface(
      {
        id: "DEM",
        name: "DEM補助面",
        maxEdge: project.settings.demSpacing * 1.5,
        breaklines: [],
      },
      demPoints,
      "dem",
    );
    model.demUsed = faces.some((f) => f.kind === "dem");
  }
  const used = new Set(faces.flatMap((f) => f.pointIds));
  for (const p of project.points) {
    if (p.z !== null && !used.has(p.id))
      issue(
        "unused-height",
        `${p.name}: 高さは保持していますが面に未反映です`,
        [p.id],
      );
  }
  model.boundaries = [...boundaries.values()];
  return model;
}
export function inspectModel(project, model) {
  const map = new Map(model.points.map((p) => [p.id, p])),
    issues = [];
  for (const p of project.points) {
    const actual = map.get(p.id);
    if (!actual || actual.x !== p.x || actual.y !== p.y || actual.z !== p.z)
      issues.push({
        level: "error",
        code: "point-changed",
        message: `${p.name}: 原座標が変化しました`,
        pointIds: [p.id],
      });
  }
  for (const f of model.faces) {
    if (
      f.modelVersion !== model.version ||
      f.pointIds.some((id) => !map.has(id))
    )
      issues.push({
        level: "error",
        code: "invalid-face",
        message: "面の参照・版が不正です",
        pointIds: f.pointIds,
      });
    const [a, b, c] = f.pointIds.map((id) => map.get(id));
    if (!a || !b || !c) continue;
    const ab = [b.x - a.x, b.y - a.y, b.z - a.z],
      ac = [c.x - a.x, c.y - a.y, c.z - a.z];
    if (
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ) < 1e-10
    )
      issues.push({
        level: "error",
        code: "zero-area",
        message: "面積ゼロの面があります",
        pointIds: f.pointIds,
      });
  }
  return issues;
}
function intervals(segments, width) {
  const ranges = segments
      .filter((s) => s.kind !== "dem")
      .map((s) => [
        Math.min(...s.points.map((p) => p.x)),
        Math.max(...s.points.map((p) => p.x)),
      ])
      .filter(([a, b]) => b - a > EPS)
      .sort((a, b) => a[0] - b[0]),
    merged = [];
  for (const pair of ranges) {
    if (merged.length && pair[0] <= merged.at(-1)[1] + EPS)
      merged.at(-1)[1] = Math.max(merged.at(-1)[1], pair[1]);
    else merged.push(pair.slice());
  }
  return merged;
}
export function generateSections(project, model) {
  const { pitch, width, extras, sectionAngle } = project.settings;
  if (!(width > 0 && width <= 1000))
    throw Error("横断の片幅は0～1000mの範囲で指定してください");
  const list = stations(project.centerline, pitch, extras),
    map = new Map(model.points.map((p) => [p.id, p]));
  return list.map((station) => {
    let segments = [];
    const warnings = [];
    for (const f of model.faces) {
      const result = triangleSection(
        f.pointIds.map((id) => map.get(id)),
        station,
        width,
        sectionAngle,
      );
      if (result?.coplanar) {
        warnings.push(`${f.surface}: 切断面と重なる面。断面線は保留`);
        continue;
      }
      if (result)
        segments.push({
          ...result,
          faceId: f.id,
          pointIds: f.pointIds,
          sourceIds: f.sourceIds,
          surface: f.surface,
          kind: f.kind,
          status: f.status,
          modelVersion: model.version,
        });
    }
    const covered = intervals(segments, width),
      dem = [];
    for (const s of segments.filter((s) => s.kind === "dem")) {
      let pieces = [s.points];
      for (const [lo, hi] of covered) {
        pieces = pieces.flatMap(([a, b]) => {
          if (b.x <= lo || a.x >= hi) return [[a, b]];
          const z = (x) => a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x);
          return [
            ...(a.x < lo ? [[a, { x: lo, z: z(lo) }]] : []),
            ...(b.x > hi ? [[{ x: hi, z: z(hi) }, b]] : []),
          ];
        });
      }
      for (const points of pieces) dem.push({ ...s, points });
    }
    segments = [...segments.filter((s) => s.kind !== "dem"), ...dem];
    const finalRanges = intervals(
        segments.map((s) => ({ ...s, kind: "drawn" })),
        width,
      ),
      gaps = [];
    let last = -width;
    for (const [a, b] of finalRanges) {
      if (a > last + EPS) gaps.push({ from: last, to: a });
      last = Math.max(last, b);
    }
    if (last < width - EPS) gaps.push({ from: last, to: width });
    return {
      station,
      segments,
      gaps,
      warnings,
      modelVersion: model.version,
      mode: project.settings.useDem ? "drawing+dem" : "drawing-only",
      suggestions: gaps.map((g) => ({
        range: g,
        target: "地盤標高。側溝底・壁下地盤など測る対象の所属も確認",
        reason: "この横断区間を拘束する高さ付き面がありません",
        priority: "要確認（確率評価ではありません）",
      })),
    };
  });
}
