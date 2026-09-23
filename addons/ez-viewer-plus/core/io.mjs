export const LIMITS = {
  bytes: 32 * 1024 * 1024,
  records: 300000,
  points: 20000,
  instances: 400000,
};
export const finite = (value, label = "数値") => {
  const s = String(value ?? "").trim();
  if (
    !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s) ||
    !Number.isFinite(Number(s))
  )
    throw Error(`${label}が不正です`);
  return Number(s);
};
export function csvRow(line) {
  const out = [];
  let s = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        s += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(s);
      s = "";
    } else s += c;
  }
  if (quoted) throw Error("閉じていない引用符です");
  out.push(s);
  return out;
}
export function sourceId(name, text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${name}:${(h >>> 0).toString(16)}`;
}
export function parseSima(text, name, { fixed = false } = {}) {
  const sid = sourceId(name, text),
    points = [],
    entities = [],
    records = [],
    warnings = [],
    byId = new Map();
  let parcel = null;
  const finish = () => {
    if (parcel) {
      const path = parcel.refs.map((id) => byId.get(id)).filter(Boolean);
      if (path.length !== parcel.refs.length)
        warnings.push(`画地 ${parcel.name}: 未解決の構成点`);
      if (path.length > 1)
        entities.push({
          id: `${sid}:parcel:${parcel.id}`,
          kind: "polyline",
          layer: "画地",
          points: path.map((p) => [p.x, p.y]),
          closed: parcel.type === "1",
          text: parcel.name,
          sourceIds: [`${sid}:D00:${parcel.id}`],
        });
    }
    parcel = null;
  };
  for (const [i, line] of text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    if (!line.trim()) continue;
    if (records.length >= LIMITS.records)
      throw Error("レコード数が上限を超えます");
    const f = csvRow(line).map((v) => v.trim()),
      kind = f[0]?.toUpperCase();
    records.push({ id: i + 1, kind, raw: line });
    if (kind === "A01") {
      try {
        if (!f[1] || byId.has(f[1]))
          throw Error("点番号が空、または重複しています");
        const p = {
          id: `${sid}:point:${f[1]}`,
          name: f[2] || f[1],
          x: finite(f[4], "Y（東）"),
          y: finite(f[3], "X（北）"),
          z: f[5]?.trim() ? finite(f[5], "Z") : null,
          kind: fixed ? "measured" : "source_xyz",
          fixed,
          sourceIds: [`${sid}:line:${i + 1}`],
          rawXYZ: { x: f[4], y: f[3], z: f[5] || "" },
          method: "SIMA A01",
          group: "terrain",
        };
        if (
          Math.max(Math.abs(p.x), Math.abs(p.y)) > 1e8 ||
          (p.z !== null && Math.abs(p.z) > 1e5)
        )
          throw Error("座標範囲を確認してください");
        points.push(p);
        byId.set(f[1], p);
      } catch (e) {
        warnings.push(`${i + 1}行: ${e.message}`);
      }
    } else if (kind === "D00") {
      finish();
      parcel = { id: f[1], name: f[2], type: f[3] || "1", refs: [] };
    } else if (kind === "B01" && parcel) parcel.refs.push(f[1]);
    else if (kind === "D99") finish();
  }
  finish();
  if (!points.length) throw Error("有効なSIMA座標（A01）がありません");
  if (points.length > LIMITS.points) throw Error("点数上限20,000を超えます");
  return {
    id: sid,
    name,
    format: "SIMA",
    rawText: text,
    points,
    entities,
    records,
    warnings,
    figures: [],
    frame: "SIMA X=北/Y=東・m",
    unsupported: [],
  };
}
export function sxfArgs(s) {
  const out = [];
  let value = "",
    quote = false,
    depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      if (quote && s[i + 1] === "'") {
        value += "'";
        i++;
      } else quote = !quote;
    } else if (c === "," && !quote && depth === 0) {
      out.push(value.trim());
      value = "";
    } else {
      if (!quote && c === "(") depth++;
      if (!quote && c === ")") depth--;
      value += c;
    }
  }
  if (quote || depth !== 0) throw Error("SXF引数の括弧または引用符が不正です");
  out.push(value.trim());
  return out;
}
const I = [1, 0, 0, 1, 0, 0];
export const applyMatrix = (m, p) => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];
const compose = (p, c) => [
  p[0] * c[0] + p[2] * c[1],
  p[1] * c[0] + p[3] * c[1],
  p[0] * c[2] + p[2] * c[3],
  p[1] * c[2] + p[3] * c[3],
  p[0] * c[4] + p[2] * c[5] + p[4],
  p[1] * c[4] + p[3] * c[5] + p[5],
];
function locate(a) {
  const angle = (finite(a[4]) * Math.PI) / 180,
    sx = finite(a[5]),
    sy = finite(a[6]);
  if (Math.abs(sx * sy) < 1e-15) throw Error("部分図の尺度が0です");
  return [
    Math.cos(angle) * sx,
    Math.sin(angle) * sx,
    -Math.sin(angle) * sy,
    Math.cos(angle) * sy,
    finite(a[2]),
    finite(a[3]),
  ];
}
const tuple = (s) =>
  s
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map((v) => finite(v));
export function parseSfc(
  text,
  name,
  { unitScale = 0.001, figure = "auto" } = {},
) {
  if (![0.001, 1].includes(unitScale))
    throw Error("SFC単位はmmまたはmを指定してください");
  const sid = sourceId(name, text),
    records = [],
    warnings = [],
    unsupported = [],
    entities = [],
    definitions = new Map(),
    layers = [];
  const ids = new Set();
  for (const block of text.matchAll(/\/\*SXF\s*([\s\S]*?)SXF\*\//g)) {
    const m = block[1]
      .replace(/\\'/g, "'")
      .match(/^\s*#(\d+)\s*=\s*(\w+)\s*\(([\s\S]*)\)\s*;?\s*$/);
    if (!m) {
      warnings.push("解析できないSXFブロック（原文は保存）");
      continue;
    }
    if (ids.has(m[1])) throw Error(`SXF要素ID #${m[1]} が重複しています`);
    ids.add(m[1]);
    records.push({ id: m[1], kind: m[2], args: sxfArgs(m[3]), raw: block[0] });
    if (records.length > LIMITS.records)
      throw Error("SXF要素数が上限を超えます");
  }
  if (!records.length)
    throw Error(
      "対応するSFC（SXFフィーチャ記述）が見つかりません。P21/SFZは未対応です",
    );
  const drawable = new Set([
    "line_feature",
    "polyline_feature",
    "circle_feature",
    "arc_feature",
    "text_string_feature",
    "point_marker_feature",
  ]);
  const definitionKinds = /(?:colour|font|width|layer|drawing_sheet)_feature$/;
  let members = [];
  for (const r of records) {
    if (r.kind === "layer_feature") layers.push(r.args[0]);
    if (r.kind === "sfig_org_feature") {
      if (definitions.has(r.args[0])) throw Error("部分図名が重複しています");
      definitions.set(r.args[0], {
        name: r.args[0],
        type: Number(r.args[1]),
        members,
      });
      members = [];
    } else if (drawable.has(r.kind) || r.kind === "sfig_locate_feature")
      members.push(r);
    else if (!definitionKinds.test(r.kind))
      unsupported.push({ id: `${sid}:#${r.id}`, kind: r.kind });
  }
  const figures = [...definitions.values()]
    .filter((d) => d.type === 2)
    .map((d) => ({ name: d.name, count: d.members.length }));
  let chosen = figure;
  if (chosen === "auto")
    chosen =
      figures.slice().sort((a, b) => b.count - a.count)[0]?.name || "sheet";
  if (chosen !== "sheet" && !definitions.has(chosen))
    throw Error("指定した部分図がありません");
  const walk = (items, matrix, path, stack = []) => {
    if (stack.length > 24) throw Error("部分図の入れ子が深すぎます");
    for (const r of items) {
      if (entities.length >= LIMITS.instances)
        throw Error("展開図形数が上限を超えます");
      const a = r.args,
        id = `${sid}:#${r.id}:${path}`,
        base = {
          id,
          layer: layers[Number(a[0]) - 1] || `L${a[0]}`,
          sourceIds: [`${sid}:#${r.id}`],
          transform: matrix.slice(),
        };
      if (r.kind === "sfig_locate_feature") {
        if (stack.includes(a[1])) throw Error("部分図が循環参照しています");
        const d = definitions.get(a[1]);
        if (!d) {
          warnings.push(`未解決の部分図 ${a[1]}`);
          continue;
        }
        walk(d.members, compose(matrix, locate(a)), `${path}/${r.id}`, [
          ...stack,
          a[1],
        ]);
        continue;
      }
      try {
        const pt = (x, y) =>
          applyMatrix(matrix, [finite(x), finite(y)]).map((v) => v * unitScale);
        if (r.kind === "line_feature")
          entities.push({
            ...base,
            kind: "polyline",
            points: [pt(a[4], a[5]), pt(a[6], a[7])],
          });
        else if (r.kind === "polyline_feature") {
          const x = tuple(a[5]),
            y = tuple(a[6]);
          if (x.length !== Number(a[4]) || x.length !== y.length)
            throw Error("折線点数が一致しません");
          entities.push({
            ...base,
            kind: "polyline",
            points: x.map((v, i) => pt(v, y[i])),
          });
        } else if (r.kind === "point_marker_feature") {
          const p = pt(a[2], a[3]);
          entities.push({
            ...base,
            kind: "marker",
            x: p[0],
            y: p[1],
            code: a[4],
          });
        } else if (r.kind === "text_string_feature") {
          const p = pt(a[4], a[5]),
            angle = (finite(a[9]) * Math.PI) / 180,
            h = finite(a[6]) * unitScale * Math.hypot(matrix[2], matrix[3]);
          entities.push({
            ...base,
            kind: "text",
            x: p[0],
            y: p[1],
            text: a[3],
            height: Math.abs(h),
            angle: angle + Math.atan2(matrix[1], matrix[0]),
            align: [a[11], a[12]],
          });
        } else if (r.kind === "circle_feature" || r.kind === "arc_feature") {
          const cx = finite(a[4]),
            cy = finite(a[5]),
            radius = Math.abs(finite(a[6]));
          let start = 0,
            sweep = 2 * Math.PI;
          if (r.kind === "arc_feature") {
            start = (finite(a[8]) * Math.PI) / 180;
            const end = (finite(a[9]) * Math.PI) / 180;
            sweep =
              (((end - start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            if (Number(a[7]) !== 1) sweep = sweep - 2 * Math.PI;
          }
          const steps = Math.max(8, Math.ceil(Math.abs(sweep) * 16)),
            points = Array.from({ length: steps + 1 }, (_, i) =>
              pt(
                cx + radius * Math.cos(start + (sweep * i) / steps),
                cy + radius * Math.sin(start + (sweep * i) / steps),
              ),
            );
          const center = pt(cx, cy);
          entities.push({
            ...base,
            kind: r.kind === "circle_feature" ? "circle" : "arc",
            points,
            x: center[0],
            y: center[1],
            radius:
              radius *
              unitScale *
              Math.max(
                Math.hypot(matrix[0], matrix[1]),
                Math.hypot(matrix[2], matrix[3]),
              ),
          });
        }
      } catch (error) {
        warnings.push(`#${r.id}: ${error.message}`);
        unsupported.push({ id, kind: r.kind });
      }
    }
  };
  walk(
    chosen === "sheet" ? members : definitions.get(chosen).members,
    I,
    chosen,
    [chosen],
  );
  if (!entities.length)
    throw Error("表示可能な要素がありません（対応範囲を確認してください）");
  if (unsupported.length)
    warnings.push(
      `${unsupported.length}要素は解析未対応。原レコードを保持し、3Dへは使いません`,
    );
  return {
    id: sid,
    name,
    format: "SFC",
    rawText: text,
    records,
    entities,
    points: [],
    figures,
    selectedFigure: chosen,
    unitScale,
    frame:
      chosen === "sheet"
        ? "用紙座標：現場座標の確認が必要"
        : `部分図「${chosen}」のローカル座標 / ${unitScale === 0.001 ? "mm→m" : "m"}`,
    warnings,
    unsupported,
  };
}
export function decodeInput(buffer, encoding = "auto") {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength > LIMITS.bytes)
    throw Error("入力は1ファイル32MBまでです");
  if (encoding !== "auto")
    return {
      text: new TextDecoder(encoding, { fatal: true }).decode(bytes),
      encoding,
    };
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("shift-jis", { fatal: true }).decode(bytes),
      encoding: "shift-jis",
    };
  }
}
export const parseInput = (text, name, options = {}) =>
  /\.sfc$/i.test(name)
    ? parseSfc(text, name, options)
    : /\.(?:sim|sima)$/i.test(name)
      ? parseSima(text, name, options)
      : (() => {
          throw Error("SFC / SIM / SIMA を選択してください");
        })();
