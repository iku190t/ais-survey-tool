import { newProject, addSource } from "../core/project.mjs";
import { parseSima } from "../core/io.mjs";
export function demoProject() {
  const project = newProject(),
    rows = ["Z00,合成検証用データ（現地実測ではありません）,"],
    groups = { road: [], left: [], right: [] };
  let id = 1;
  for (const [group, xs] of [
    ["road", [-5, 0, 5]],
    ["left", [-15, -10, -5]],
    ["right", [7, 11, 15]],
  ])
    for (let y = 0; y <= 40; y += 10)
      for (const x of xs) {
        const z =
          (group === "left" ? 12 : group === "right" ? 9.5 : 10) +
          y * 0.01 +
          (group === "road" ? Math.abs(x) * 0.02 : 0);
        const name = `${group[0].toUpperCase()}${id}`;
        rows.push(`A01,${id},${name},${y},${x},${z.toFixed(3)},`);
        groups[group].push(name);
        id++;
      }
  const source = parseSima(rows.join("\n"), "合成例_道路と擁壁.sim", {
    fixed: true,
  });
  source.points.forEach((p) => {
    p.kind = "synthetic";
    p.method = "独立期待値を持つ合成検証データ";
  });
  addSource(project, source);
  const ids = (names) =>
    names.map((name) => project.points.find((p) => p.name === name).id);
  project.surfaces = [
    {
      id: "road",
      name: "道路（合成）",
      kind: "road",
      pointIds: ids(groups.road),
      maxEdge: 15,
      breaklines: [],
    },
    {
      id: "left",
      name: "高い側の地盤（合成）",
      kind: "terrain",
      pointIds: ids(groups.left),
      maxEdge: 15,
      breaklines: [],
    },
    {
      id: "right",
      name: "低い側の地盤（合成）",
      kind: "terrain",
      pointIds: ids(groups.right),
      maxEdge: 15,
      breaklines: [],
    },
  ];
  const edge = (names, x) =>
    ids(names)
      .filter((id) => project.points.find((p) => p.id === id).x === x)
      .sort(
        (a, b) =>
          project.points.find((p) => p.id === a).y -
          project.points.find((p) => p.id === b).y,
      );
  project.walls = [
    {
      id: "wall",
      name: "高さを確認した壁（合成）",
      upperIds: edge(groups.left, -5),
      lowerIds: edge(groups.road, -5),
    },
  ];
  project.centerline = [
    { x: 0, y: 0 },
    { x: 0, y: 40 },
  ];
  project.settings.width = 20;
  return project;
}
