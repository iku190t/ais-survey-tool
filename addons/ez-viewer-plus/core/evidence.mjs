import { dist, pointSegment } from "./geometry.mjs";
export function heightCandidates(
  sources,
  { radius = 8, maxCircleRadius = 1 } = {},
) {
  const entities = sources.flatMap((s) => s.entities),
    plots = entities.filter(
      (e) =>
        e.kind === "marker" ||
        (e.kind === "circle" && e.radius <= maxCircleRadius),
    ),
    texts = entities.filter(
      (e) =>
        e.kind === "text" &&
        /^[+-]?\d+(?:\.\d{1,4})?(?:\s*m)?$/i.test(e.text.trim()),
    );
  const rows = [];
  if (texts.length * plots.length > 20000000)
    throw Error("標高候補の組合せが多すぎます。解析部分図を分けてください");
  for (const text of texts) {
    const candidates = [];
    for (const plot of plots) {
      const distance = dist(text, plot);
      if (distance > radius) continue;
      const dx = plot.x - text.x,
        dy = plot.y - text.y,
        along = dx * Math.cos(text.angle) + dy * Math.sin(text.angle),
        normal = -dx * Math.sin(text.angle) + dy * Math.cos(text.angle);
      // This is a candidate ranking, not nearest-neighbour assignment or a probability.
      const score =
        distance / Math.max(0.1, text.height) +
        (Math.abs(normal) / Math.max(0.1, text.height)) * 0.25 +
        (along > text.height ? 2 : 0) +
        (plot.layer === text.layer ? 0 : 1);
      candidates.push({
        plotId: plot.id,
        x: plot.x,
        y: plot.y,
        score,
        distance,
        sourceIds: [...plot.sourceIds, ...text.sourceIds],
        reason: `距離 ${distance.toFixed(2)}m・文字方向・${plot.layer === text.layer ? "同じ" : "異なる"}レイヤー`,
      });
    }
    candidates.sort(
      (a, b) => a.score - b.score || a.plotId.localeCompare(b.plotId),
    );
    rows.push({
      id: text.id,
      text: text.text,
      z: Number(text.text.replace(/m\s*$/i, "")),
      textX: text.x,
      textY: text.y,
      candidates: candidates.slice(0, 5),
      integerAmbiguous: !text.text.includes("."),
      status: "unconfirmed",
    });
  }
  return rows;
}
export function acceptCandidate(row, plotId, name, group = "terrain") {
  const c = row.candidates.find((c) => c.plotId === plotId);
  if (!c) throw Error("対応するプロット候補がありません");
  return {
    id: `accepted:${row.id}:${plotId}`,
    name: name || row.text,
    x: c.x,
    y: c.y,
    z: row.z,
    kind: "reconstructed",
    fixed: false,
    group,
    sourceIds: c.sourceIds,
    method: "標高文字とプロットを利用者が確認",
    rawXYZ: { x: String(c.x), y: String(c.y), z: row.text },
    evidence: { textId: row.id, plotId, rankScore: c.score, calibrated: false },
  };
}
export function diagnoseLines(sources, tolerance = 0.05) {
  const lines = sources
      .flatMap((s) => s.entities)
      .filter((e) => e.kind === "polyline")
      .flatMap((e) =>
        e.points
          .slice(1)
          .map((p, i) => ({
            id: e.id,
            layer: e.layer,
            a: { x: e.points[i][0], y: e.points[i][1] },
            b: { x: p[0], y: p[1] },
          })),
      ),
    issues = [];
  // Bound diagnostic work; leave the original geometry untouched.
  const bins = new Map();
  for (const line of lines) {
    if (dist(line.a, line.b) < tolerance)
      issues.push({
        kind: "short-line",
        ids: [line.id],
        message: "微小線：削除・接続は自動適用しません",
      });
    for (const p of [line.a, line.b]) {
      const key = `${Math.floor(p.x / tolerance)},${Math.floor(p.y / tolerance)}`;
      const bx = Math.floor(p.x / tolerance),
        by = Math.floor(p.y / tolerance);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const q of bins.get(`${bx + dx},${by + dy}`) || []) {
            const gap = dist(p, q.p);
            if (q.id !== line.id && gap > 1e-6 && gap < tolerance) {
              issues.push({
                kind: "near-endpoint",
                ids: [line.id, q.id],
                message: `端点差 ${gap.toFixed(3)}m：同一地物か確認`,
              });
              if (issues.length >= 200) return issues;
            }
          }
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push({ p, id: line.id });
    }
  }
  return issues;
}
