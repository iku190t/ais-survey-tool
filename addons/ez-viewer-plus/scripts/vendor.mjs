// Build output is restricted to this new add-on directory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  out = path.join(root, "vendor");
fs.mkdirSync(out, { recursive: true });
for (const [src, dst] of [
  ["delaunator/delaunator.js", "delaunator.js"],
  ["delaunator/LICENSE", "delaunator-LICENSE"],
  ["proj4/dist/proj4.js", "proj4.js"],
  ["proj4/LICENSE.md", "proj4-LICENSE.md"],
])
  fs.copyFileSync(path.join(root, "node_modules", src), path.join(out, dst));
// Normalize trailing whitespace only; preserve third-party license wording.
const license = path.join(out, "proj4-LICENSE.md");
fs.writeFileSync(
  license,
  fs.readFileSync(license, "utf8").replace(/[ \t]+$/gm, ""),
);
console.log("Prepared local vendor files; no CDN required at startup.");
