import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSima,
  parseSfc,
  decodeInput,
  finite,
  csvRow,
} from "../core/io.mjs";
import {
  heightCandidates,
  acceptCandidate,
  diagnoseLines,
} from "../core/evidence.mjs";
import {
  newProject,
  addSource,
  projectJson,
  validateProject,
  sectionCsv,
  sectionSvg,
} from "../core/project.mjs";
import { buildModel, inspectModel, generateSections } from "../core/model.mjs";
import {
  stations,
  stationAt,
  triangleSection,
  barycentric,
} from "../core/geometry.mjs";
import { decodeHeight, toLonLat, loadDem } from "../core/dem.mjs";
import { demoProject } from "../fixtures/demo.mjs";
const near = (a, b, eps = 1e-8) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const sx = (id, kind, args) => `/*SXF\n#${id} = ${kind}(${args})\nSXF*/\n`;
const point = (id, x, y, z) => ({
  id,
  name: id,
  x,
  y,
  z,
  sourceIds: [`raw:${id}`],
  kind: "measured",
  fixed: true,
  method: "synthetic",
  rawXYZ: { x: String(x), y: String(y), z: String(z) },
});
function flat() {
  const p = newProject();
  p.points = [
    point("A", -10, 0, 10),
    point("B", 10, 0, 10),
    point("C", 10, 20, 12),
    point("D", -10, 20, 12),
  ];
  p.surfaces = [
    {
      id: "ground",
      name: "ground",
      kind: "terrain",
      pointIds: p.points.map((p) => p.id),
      maxEdge: 30,
      breaklines: [],
    },
  ];
  p.centerline = [
    { x: 0, y: 0 },
    { x: 0, y: 20 },
  ];
  p.settings.width = 15;
  return p;
}
const shape = (sections) =>
  sections.map((s) => ({
    station: s.station.chainage,
    segments: s.segments
      .map((a) => ({
        surface: a.surface,
        points: a.points.map((p) => ({
          x: +p.x.toFixed(6),
          z: +p.z.toFixed(6),
        })),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    gaps: s.gaps,
  }));

test("SIMA preserves raw XYZ, X north/Y east, names and missing Z", () => {
  const s = parseSima(
    'A01,1,"P,one",120000.12345,90000.00001,2.010,\nA01,2,P2,120001,90001,,',
    "t.SIM",
    { fixed: true },
  );
  assert.equal(s.points[0].name, "P,one");
  assert.equal(s.points[0].y, 120000.12345);
  assert.equal(s.points[0].x, 90000.00001);
  assert.equal(s.points[0].rawXYZ.z, "2.010");
  assert.equal(s.points[1].z, null);
  assert.equal(s.points[0].fixed, true);
});
test("SIMA rejects duplicate/nonnumeric points without silently inserting zero", () => {
  const s = parseSima(
    "A01,1,P1,0,0,10\nA01,1,PX,5,5,9\nA01,2,P2,not-number,5,9",
    "t.sim",
  );
  assert.equal(s.points.length, 1);
  assert.equal(s.warnings.length, 2);
  assert.equal(s.points[0].kind, "source_xyz");
  assert.throws(() => parseSima("A01,1,P1,NaN,0,0", "bad.sim"));
  assert.throws(() => finite(""));
  assert.throws(() => csvRow('"bad'));
});
test("SIMA D00 parcel name is not point number", () => {
  const s = parseSima(
    "A01,1,101,0,0,1\nA01,2,102,0,1,1\nA01,3,103,1,1,1\nD00,9,922-2,1\nB01,1\nB01,2\nB01,3\nD99",
    "p.sim",
  );
  assert.equal(s.entities[0].text, "922-2");
  assert.equal(s.entities[0].closed, true);
});
test("SFC nested rotation and scale use partial figure local coordinates and mm conversion", () => {
  const text =
    sx(1, "point_marker_feature", "'1','1','1000','0','1'") +
    sx(2, "sfig_org_feature", "'part','3'") +
    sx(3, "sfig_locate_feature", "'1','part','10000','20000','90','2','2'") +
    sx(4, "sfig_org_feature", "'survey','2'") +
    sx(
      5,
      "sfig_locate_feature",
      "'1','survey','500','500','0','0.002','0.002'",
    );
  const s = parseSfc(text, "t.sfc");
  near(s.entities[0].x, 10);
  near(s.entities[0].y, 22);
  assert.equal(s.selectedFigure, "survey");
  assert.equal(
    s.records[0].raw,
    sx(1, "point_marker_feature", "'1','1','1000','0','1'").trim(),
  );
  const metres = parseSfc(text, "t.sfc", { unitScale: 1 });
  near(metres.entities[0].x, 10000);
  near(metres.entities[0].y, 22000);
});
test("SFC cycles, repeated IDs and unsupported data are explicit", () => {
  assert.throws(
    () =>
      parseSfc(
        sx(1, "sfig_locate_feature", "'1','self','0','0','0','1','1'") +
          sx(2, "sfig_org_feature", "'self','2'"),
        "t.sfc",
      ),
    /循環/,
  );
  assert.throws(
    () =>
      parseSfc(
        sx(1, "point_marker_feature", "'1','1','0','0','1'").repeat(2),
        "t.sfc",
      ),
    /重複/,
  );
  const s = parseSfc(
    sx(1, "point_marker_feature", "'1','1','0','0','1'") +
      sx(2, "unknown_feature", "'original'"),
    "t.sfc",
  );
  assert.equal(s.unsupported.length, 1);
  assert.ok(s.warnings.length);
  assert.ok(s.rawText.includes("original"));
});
test("SFC text, arc, circle and polyline are vector inputs, not OCR", () => {
  const s = parseSfc(
    sx(
      1,
      "text_string_feature",
      "'1','1','1','12.34','2000','3000','1800','1','1','30','0','1','1'",
    ) +
      sx(2, "circle_feature", "'1','1','1','1','0','0','400'") +
      sx(3, "arc_feature", "'1','1','1','1','0','0','1000','1','0','90'") +
      sx(4, "polyline_feature", "'1','1','1','1','2',(0,1000),(0,2000)"),
    "vector.sfc",
  );
  assert.equal(s.entities[0].text, "12.34");
  near(s.entities[0].height, 1.8);
  near(s.entities[0].angle, Math.PI / 6);
  near(s.entities[1].radius, 0.4);
  assert.deepEqual(s.entities[3].points, [
    [0, 0],
    [1, 2],
  ]);
});
test("input byte-size and fatal decoding protect import", () => {
  assert.equal(decodeInput(new TextEncoder().encode("abc").buffer).text, "abc");
  assert.throws(
    () => decodeInput(new Uint8Array(32 * 1024 * 1024 + 1).buffer),
    /32MB/,
  );
  assert.throws(() => decodeInput(new Uint8Array([255]).buffer, "utf-8"));
});
test("candidate ambiguity stays unconfirmed; user may choose non-nearest plot", () => {
  const s = {
    entities: [
      {
        id: "text",
        kind: "text",
        x: 1,
        y: 0,
        text: "12.34",
        height: 0.2,
        angle: 0,
        layer: "A",
        sourceIds: ["t"],
      },
      {
        id: "near",
        kind: "marker",
        x: 1.1,
        y: 0,
        layer: "B",
        sourceIds: ["near"],
      },
      {
        id: "intended",
        kind: "marker",
        x: 0,
        y: 0,
        layer: "A",
        sourceIds: ["intended"],
      },
    ],
  };
  const before = structuredClone(s),
    rows = heightCandidates([s]);
  assert.equal(rows[0].status, "unconfirmed");
  assert.equal(rows[0].candidates.length, 2);
  const p = acceptCandidate(rows[0], "intended", "H1");
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
  assert.equal(p.z, 12.34);
  assert.equal(p.kind, "reconstructed");
  assert.equal(p.evidence.calibrated, false);
  assert.deepEqual(s, before);
});
test("integer/dimension-like labels, orphan labels and plots are not auto heights", () => {
  const s = {
    entities: [
      {
        id: "t",
        kind: "text",
        text: "102",
        x: 0,
        y: 0,
        height: 1,
        angle: 0,
        layer: "A",
        sourceIds: ["t"],
      },
      { id: "p", kind: "marker", x: 100, y: 100, layer: "A", sourceIds: ["p"] },
    ],
  };
  const rows = heightCandidates([s]);
  assert.equal(rows[0].integerAmbiguous, true);
  assert.equal(rows[0].candidates.length, 0);
  assert.throws(() => acceptCandidate(rows[0], "p", "H"));
});
test("near endpoints and short lines diagnosed; gaps/overlaps/duplicates left untouched", () => {
  const s = {
    entities: [
      {
        id: "a",
        kind: "polyline",
        layer: "l",
        points: [
          [0, 0],
          [1, 0],
        ],
      },
      {
        id: "b",
        kind: "polyline",
        layer: "l",
        points: [
          [1.02, 0],
          [2, 0],
        ],
      },
      {
        id: "c",
        kind: "polyline",
        layer: "l",
        points: [
          [5, 0],
          [5.01, 0],
        ],
      },
      {
        id: "dup",
        kind: "polyline",
        layer: "l",
        points: [
          [0, 0],
          [1, 0],
        ],
      },
    ],
  };
  const before = structuredClone(s),
    issues = diagnoseLines([s]);
  assert.ok(issues.some((i) => i.kind === "near-endpoint"));
  assert.ok(issues.some((i) => i.kind === "short-line"));
  assert.deepEqual(s, before);
});
test("fixed XYZ remains exact and surfaces interpolate through each assigned point", () => {
  const p = flat(),
    before = structuredClone(p),
    m = buildModel(p);
  assert.deepEqual(p, before);
  assert.deepEqual(m.points, p.points);
  assert.deepEqual(inspectModel(p, m), []);
  for (const point of p.points) {
    const f = m.faces.find((f) => f.pointIds.includes(point.id));
    assert.ok(f);
    near(
      barycentric(
        point,
        ...f.pointIds.map((id) => m.points.find((p) => p.id === id)),
      ).z,
      point.z,
    );
  }
  const s = generateSections(p, m)[1];
  for (const segment of s.segments)
    for (const q of segment.points) near(q.z, 11);
});
test("vertical wall at same XY preserves upper and lower; shared boundary references", () => {
  const p = demoProject(),
    m = buildModel(p),
    s = generateSections(p, m)[1];
  assert.equal(inspectModel(p, m).length, 0);
  const wall = s.segments.filter((s) => s.kind === "wall");
  assert.ok(wall.length);
  const z = wall.flatMap((s) => s.points.map((p) => p.z));
  near(Math.min(...z), 10.2);
  near(Math.max(...z), 12.1);
  for (const segment of wall) segment.points.forEach((p) => near(p.x, 5));
  assert.ok(
    m.boundaries.some(
      (b) =>
        m.faces
          .filter((f) => f.boundaryIds.includes(b.id))
          .some((f) => f.kind === "wall") &&
        m.faces
          .filter((f) => f.boundaryIds.includes(b.id))
          .some((f) => f.kind === "road"),
    ),
  );
});
test("bridge and ground share XY without being merged when separate groups", () => {
  const p = flat();
  const upper = p.points.map((q) => ({ ...q, id: q.id + "2", z: q.z + 5 }));
  p.points.push(...upper);
  p.surfaces.push({
    ...p.surfaces[0],
    id: "bridge",
    kind: "bridge",
    pointIds: upper.map((p) => p.id),
  });
  const m = buildModel(p),
    s = generateSections(p, m)[1];
  assert.equal(m.issues.filter((i) => i.level === "error").length, 0);
  assert.deepEqual(
    [...new Set(s.segments.flatMap((a) => a.points.map((q) => q.z)))].sort(),
    [11, 16],
  );
});
test("conflicting heights in one terrain group are diagnosed, never averaged", () => {
  const p = flat();
  p.points.push(point("conflict", -10, 0, 20));
  p.surfaces[0].pointIds.push("conflict");
  const m = buildModel(p);
  assert.equal(m.faces.length, 0);
  assert.ok(m.issues.some((i) => i.code === "multi-z" && i.level === "error"));
  assert.equal(m.points.find((p) => p.id === "A").z, 10);
});
test("reverse slopes and buried negative elevations are not normalized", () => {
  const p = flat();
  p.points[0].z = -2;
  p.points[1].z = -2;
  p.points[2].z = -4;
  p.points[3].z = -4;
  const m = buildModel(p),
    s = generateSections(p, m);
  for (const q of s[1].segments.flatMap((s) => s.points)) near(q.z, -3);
  assert.deepEqual(m.points, p.points);
});
test("one-sided channel without opposite height produces no invented width or bottom", () => {
  const p = flat();
  p.points = p.points.filter((q) => q.x < 0);
  p.surfaces = [
    { ...p.surfaces[0], kind: "channel", pointIds: p.points.map((q) => q.id) },
  ];
  const m = buildModel(p),
    s = generateSections(p, m)[1];
  assert.equal(m.faces.length, 0);
  assert.equal(s.segments.length, 0);
  assert.deepEqual(s.gaps, [{ from: -15, to: 15 }]);
  assert.match(s.suggestions[0].target, /地盤|底/);
  assert.ok(s.suggestions[0].range);
});
test("unaccepted contour-like text never moves measured points", () => {
  const p = flat();
  p.sources = [
    {
      entities: [
        {
          id: "t",
          kind: "text",
          text: "100",
          x: 0,
          y: 0,
          layer: "contour",
          height: 1,
          angle: 0,
          sourceIds: ["c"],
        },
      ],
    },
  ];
  const m = buildModel(p);
  assert.equal(m.points.length, 4);
  assert.equal(m.points[0].z, 10);
});
test("gaps, maximum-edge limits, exclusions and separate objects are not connected", () => {
  const p = demoProject(),
    s = generateSections(p, buildModel(p))[1];
  assert.ok(
    s.gaps.some(
      (g) => Math.abs(g.from + 7) < 1e-8 && Math.abs(g.to + 5) < 1e-8,
    ),
  );
  const f = flat();
  f.surfaces[0].maxEdge = 1;
  assert.equal(buildModel(f).faces.length, 0);
  f.surfaces[0].maxEdge = 30;
  f.exclusions = [
    [
      { x: -1, y: 9 },
      { x: 1, y: 9 },
      { x: 1, y: 11 },
      { x: -1, y: 11 },
    ],
  ];
  assert.equal(buildModel(f).faces.length, 0);
});
test("constraint edges not present in Delaunay leave a diagnostic gap, not a crossing face", () => {
  const p = flat(),
    m = buildModel(p);
  const diagonal = [
    ["A", "C"],
    ["B", "D"],
  ].find(
    (ids) =>
      !m.boundaries.some((b) => ids.every((id) => b.pointIds.includes(id))),
  );
  p.surfaces[0].breaklines = [diagonal];
  const cut = buildModel(p);
  assert.equal(cut.faces.length, 0);
  assert.ok(cut.issues.some((i) => i.code === "breakline-gap"));
});
test("10/20/custom pitch, extra stations, incoming tangent at polyline bend, left positive", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 0, y: 20 },
    { x: 20, y: 20 },
  ];
  assert.deepEqual(
    stations(path, 10, [12.5]).map((s) => s.chainage),
    [0, 10, 12.5, 20, 30, 40],
  );
  assert.deepEqual(
    stations(path, 20).map((s) => s.chainage),
    [0, 20, 40],
  );
  assert.equal(stationAt(path, 20).atVertex, true);
  near(stationAt(path, 20).ty, 1);
  assert.throws(() => stations(path, 1, Array(501).fill(0)));
  const result = triangleSection(
    [
      { x: -3, y: 9, z: 2 },
      { x: -3, y: 11, z: 4 },
      { x: -5, y: 10, z: 3 },
    ],
    stationAt(path, 10),
    10,
  );
  assert.ok(result.points.every((p) => p.x > 0));
});
test("model version and source references are common to generated sections", () => {
  const p = flat(),
    m = buildModel(p),
    sections = generateSections(p, m);
  for (const s of sections) {
    assert.equal(s.modelVersion, m.version);
    for (const segment of s.segments) {
      assert.equal(segment.modelVersion, m.version);
      assert.ok(m.faces.some((f) => f.id === segment.faceId));
      assert.ok(segment.sourceIds.length);
    }
  }
});
test("translation and input order do not change section shape", () => {
  const p = demoProject(),
    expected = shape(generateSections(p, buildModel(p))),
    q = structuredClone(p);
  q.points.reverse();
  for (const point of q.points) {
    point.x += 123456;
    point.y -= 98765;
  }
  for (const point of q.centerline) {
    point.x += 123456;
    point.y -= 98765;
  }
  assert.deepEqual(shape(generateSections(q, buildModel(q))), expected);
});
test("DEM OFF does not call any loader and ignores supplied old DEM points", async () => {
  const p = flat();
  let calls = 0;
  assert.deepEqual(
    await loadDem(p, {
      loader: async () => {
        calls++;
        throw Error("forbidden");
      },
    }),
    [],
  );
  const m = buildModel(p, { demPoints: [point("DEM-old", 0, 0, 999)] });
  assert.equal(calls, 0);
  assert.equal(m.points.length, p.points.length);
  assert.equal(m.demUsed, false);
});
test("DEM decode includes zero, negative and missing pixel, and zone axes are correct", () => {
  near(decodeHeight(0, 0, 0), 0);
  near(decodeHeight(255, 255, 156), -1);
  assert.equal(decodeHeight(128, 0, 0), null);
  const [lon, lat] = toLonLat({ x: 0, y: 0 }, 4);
  near(lon, 133.5);
  near(lat, 33);
  assert.throws(() => toLonLat({ x: 0, y: 0 }, 0));
});
test("DEM requires coordinate confirmation; source fallback and provenance do not overwrite input", async () => {
  const p = flat();
  p.settings.useDem = true;
  p.settings.zone = 4;
  await assert.rejects(loadDem(p, { loader: async () => null }), /確認/);
  p.settings.coordinatesConfirmed = true;
  let calls = [];
  const pixels = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i + 1] = 39;
    pixels[i + 2] = 16;
    pixels[i + 3] = 255;
  } // 100.00m, deliberately wrong vs drawing.
  const dem = await loadDem(p, {
    loader: async (url) => {
      calls.push(url);
      return url.includes("dem1a") ? null : pixels;
    },
  });
  assert.ok(dem.length);
  assert.ok(calls.some((u) => u.includes("dem5a")));
  assert.ok(dem.every((p) => p.z === 100 && p.kind === "dem"));
  const before = structuredClone(p.points),
    m = buildModel(p, { demPoints: dem }),
    s = generateSections(p, m)[1];
  assert.deepEqual(p.points, before);
  assert.ok(s.segments.some((s) => s.kind === "dem"));
  for (const a of s.segments.filter((s) => s.kind === "dem"))
    assert.ok(a.points[1].x <= -10 + 1e-8 || a.points[0].x >= 10 - 1e-8);
  for (const a of s.segments.filter((s) => s.kind !== "dem"))
    a.points.forEach((p) => near(p.z, 11));
});
test("JSON round trip is lossless for supported geometry/provenance; malformed input is rejected before swap", () => {
  const p = demoProject();
  assert.deepEqual(validateProject(JSON.parse(projectJson(p))), p);
  for (const change of [
    (q) => (q.points[0].x = "0"),
    (q) => (q.sources[0].entities = [{ kind: "text" }]),
    (q) => (q.surfaces[0].breaklines = [["missing", "no"]]),
    (q) => (q.settings.width = -1),
    (q) => (q.exclusions = [null]),
    (q) => (q.sources[0].warnings = null),
  ]) {
    const raw = JSON.parse(projectJson(p));
    change(raw.project);
    assert.throws(() => validateProject(raw));
  }
  assert.equal(p.points[0].x, -5);
});
test("CSV and SVG label source/mode, do not round source data; formula names escaped", () => {
  const p = flat(),
    before = structuredClone(p.points),
    m = buildModel(p),
    s = generateSections(p, m);
  s[0].segments[0].surface = '=HYPERLINK("bad")';
  const csv = sectionCsv(s);
  assert.match(csv, /drawing-only/);
  assert.match(csv, /UNKNOWN/);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.match(sectionSvg(s[1]), /<svg/);
  assert.deepEqual(p.points, before);
});
test("source import failure does not mutate existing project", () => {
  const p = demoProject(),
    before = projectJson(p);
  assert.throws(() => addSource(p, p.sources[0]));
  assert.equal(
    projectJson(p).replace(/savedAt[^\n]*/, ""),
    before.replace(/savedAt[^\n]*/, ""),
  );
});
