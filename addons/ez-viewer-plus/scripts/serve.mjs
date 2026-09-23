import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export function makeServer() {
  return http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      let file = path.resolve(root, "." + pathname);
      if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      const types = {
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".html": "text/html",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".md": "text/plain",
      };
      res.setHeader(
        "Content-Type",
        (types[path.extname(file)] || "application/octet-stream") +
          "; charset=utf-8",
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(fs.readFileSync(file));
    } catch {
      res.writeHead(404).end();
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = makeServer(),
    port = Number(process.env.PORT) || 4173;
  server.listen(port, "127.0.0.1", () =>
    console.log(`http://127.0.0.1:${port}/addons/ez-viewer-plus/`),
  );
}
