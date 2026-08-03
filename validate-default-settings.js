const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = __dirname;
const server = http.createServer((request, response) => {
  const clean = decodeURIComponent((request.url || "/").split("?")[0]);
  const file = path.join(root, clean === "/" ? "index.html" : clean.replace(/^\//, ""));
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader("Content-Type", path.extname(file) === ".js" ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
  response.end(fs.readFileSync(file));
});

let browser;
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route(/^https:\/\//, route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load", timeout: 10000 });
  const defaults = await page.evaluate(() => ({
    lineDisplayScale: displayLineWidthScale,
    activePicks: [...activePickModes],
    inkWidth,
    circleSize: circleSizeLevelFromPx(inkCircleSize),
    transparency: Math.round((1 - inkOpacity) * 100)
  }));
  const expected = {
    lineDisplayScale: 4,
    activePicks: ["center", "cross", "end", "line"],
    inkWidth: 10,
    circleSize: 25,
    transparency: 20
  };
  if (JSON.stringify(defaults) !== JSON.stringify(expected)) {
    throw new Error(`unexpected defaults: ${JSON.stringify(defaults)}`);
  }
  console.log("default display, ink, and measurement settings validated");
})().finally(async () => {
  if (browser) await browser.close();
  server.close();
});
