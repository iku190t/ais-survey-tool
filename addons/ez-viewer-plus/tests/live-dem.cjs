// Optional, read-only live integration check. Uses a public coordinate-system origin,
// not a customer drawing or the device location. Not an elevation-accuracy test.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
let browser;
(async () => {
  const base =
    process.env.BASE_URL ||
    "https://iku190t.github.io/ais-survey-tool/addons/ez-viewer-plus/";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const { loadDem } = await import("./core/dem.mjs"),
      { newProject } = await import("./core/project.mjs");
    const p = newProject();
    p.settings = {
      ...p.settings,
      useDem: true,
      zone: 9,
      coordinatesConfirmed: true,
      width: 5,
    };
    p.centerline = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ];
    const points = await loadDem(p);
    return {
      count: points.length,
      finite: points.every((p) => Number.isFinite(p.z)),
      sourceTypes: [...new Set(points.map((p) => p.name))],
    };
  });
  assert.ok(result.count > 0, "No live DEM samples");
  assert.equal(result.finite, true);
  console.log(
    JSON.stringify({
      result: "PASS",
      test: "Live official PNG fetch/decode; not accuracy verification",
      ...result,
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => browser?.close());
