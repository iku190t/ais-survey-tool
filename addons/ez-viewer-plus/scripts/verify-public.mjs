import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const base = "https://iku190t.github.io/ais-survey-tool/";
const files = [
  "index.html",
  ...[
    "index.html",
    "styles.css",
    "app.mjs",
    "worker.mjs",
    "core/io.mjs",
    "core/model.mjs",
    "core/dem.mjs",
    "vendor/proj4.js",
    "vendor/delaunator.js",
  ].map((p) => "addons/ez-viewer-plus/" + p),
];
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
for (const file of files) {
  const expected = execFileSync("git", ["show", `HEAD:${file}`], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  });
  const response = await fetch(base + file + "?verify=" + commit, {
    cache: "no-store",
  });
  if (!response.ok) throw Error(`${file}: HTTP ${response.status}`);
  if (hash(expected) !== hash(Buffer.from(await response.arrayBuffer())))
    throw Error(`${file}: published hash differs`);
  console.log(`MATCH ${file}`);
}
