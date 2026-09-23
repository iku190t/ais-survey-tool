import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
const own = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.resolve(own, "../..");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd();
const hash = (file) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");
const baseline = path.join(own, "PROTECTION_BASELINE.json");
if (process.argv[2] === "capture") {
  if (fs.existsSync(baseline))
    throw Error("Baseline already exists; never replace it.");
  const files = git("ls-files", "-z").split("\0").filter(Boolean);
  fs.writeFileSync(
    baseline,
    JSON.stringify(
      {
        commit: git("rev-parse", "HEAD"),
        branch: git("branch", "--show-current"),
        files: Object.fromEntries(files.map((file) => [file, hash(file)])),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Captured ${files.length} existing files`);
} else {
  const before = JSON.parse(fs.readFileSync(baseline, "utf8"));
  const changed = Object.entries(before.files)
    .filter(
      ([file, sum]) =>
        !fs.existsSync(path.join(root, file)) || hash(file) !== sum,
    )
    .map(([file]) => file);
  const unexpected = git("status", "--porcelain", "--untracked-files=all")
    .split("\n")
    .filter(Boolean)
    .filter(
      (line) =>
        !line.slice(3).replaceAll('"', "").startsWith("addons/ez-viewer-plus/"),
    );
  console.log(
    JSON.stringify({
      existingFiles: Object.keys(before.files).length,
      changed,
      unexpected,
    }),
  );
  if (changed.length || unexpected.length) process.exitCode = 1;
}
