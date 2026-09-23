const { chromium } = require("playwright");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const own = path.resolve(__dirname, ".."),
  out = path.join(own, "test-results");
let server, browser;
(async () => {
  await fs.mkdir(out, { recursive: true });
  let base = process.env.BASE_URL;
  if (!base) {
    const { makeServer } = await import("../scripts/serve.mjs");
    server = makeServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}/addons/ez-viewer-plus/`;
  }
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
      acceptDownloads: true,
    }),
    page = await context.newPage(),
    errors = [],
    external = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await context.addInitScript(() => {
    localStorage.setItem("sfcviewer-ui-preferences-v1", "original-sentinel");
    localStorage.setItem("plus-test-sentinel", "unchanged");
    window.originalSentinel = { x: 17 };
  });
  let png = null,
    slow = false;
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (new URL(url).origin !== new URL(base).origin) {
      external.push(url);
      if (url.startsWith("https://cyberjapandata.gsi.go.jp/") && png) {
        if (slow) await new Promise((r) => setTimeout(r, 1500));
        try {
          await route.fulfill({
            contentType: "image/png",
            body: png,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        } catch {}
        return;
      }
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("original-ez-test", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("state");
        r.onsuccess = () => {
          const db = r.result,
            t = db.transaction("state", "readwrite");
          t.objectStore("state").put({ unchanged: true }, "data");
          t.oncomplete = () => {
            db.close();
            resolve();
          };
        };
        r.onerror = () => reject(r.error);
      }),
  );
  assert.equal(await page.locator("#useDem").isChecked(), false);
  await page.locator("#demo").click();
  await page.waitForFunction(
    () =>
      document.getElementById("stationSelect").options.length === 5 &&
      document.getElementById("build").textContent === "3D・横断を生成",
  );
  assert.equal(external.length, 0, "OFF must not request any external URLs");
  assert.ok((await page.locator("#stats").textContent()).includes("45点"));
  await page.screenshot({
    path: path.join(out, "desktop-plan.png"),
    fullPage: true,
  });
  await page.locator("#threeTab").click();
  await page.screenshot({
    path: path.join(out, "desktop-3d.png"),
    fullPage: true,
  });
  await page.locator("#planTab").click();
  async function download(button, name) {
    const pending = page.waitForEvent("download");
    await page.locator(button).click();
    const d = await pending;
    const file = path.join(out, name);
    await d.saveAs(file);
    return file;
  }
  const csv = await download("#csv", "sections.csv");
  assert.match(await fs.readFile(csv, "utf8"), /drawing-only/);
  const svg = await download("#svg", "section.svg");
  assert.match(await fs.readFile(svg, "utf8"), /<svg/);
  const saved = await download("#saveProject", "project.json"),
    model = await download("#modelJson", "model.json");
  assert.equal(JSON.parse(await fs.readFile(model, "utf8")).sections.length, 5);
  await page.locator("#newProject").click();
  await page.locator("#openProject").setInputFiles(saved);
  await page.waitForFunction(() =>
    document.getElementById("stats").textContent.includes("45点"),
  );
  await page.locator("#build").click();
  await page.waitForFunction(
    () => document.getElementById("stationSelect").options.length === 5,
  );
  assert.equal(external.length, 0);
  // Bad JSON must leave a valid project untouched.
  await page
    .locator("#openProject")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"format":"nope"}'),
    });
  await page.waitForFunction(() =>
    document.getElementById("status").textContent.includes("作業JSONでは"),
  );
  assert.ok((await page.locator("#stats").textContent()).includes("45点"));
  png = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d");
      g.fillStyle = "rgb(0,39,16)";
      g.fillRect(0, 0, 256, 256);
      return c.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  await page.locator("#useDem").check();
  assert.equal(await page.locator("#demOptions").isVisible(), true);
  await page.locator("#zone").selectOption("4");
  await page.locator("#coordinatesConfirmed").check();
  await page.locator("#build").click();
  await page.waitForFunction(
    () =>
      document.getElementById("stationSelect").options.length === 5 &&
      document.getElementById("build").textContent === "3D・横断を生成",
  );
  assert.ok(
    external.length > 0,
    "ON must invoke PNG fetch + decode in actual Worker",
  );
  const withDem = JSON.parse(
    await fs.readFile(await download("#modelJson", "model-dem.json"), "utf8"),
  );
  assert.ok(withDem.model.faces.some((f) => f.kind === "dem"));
  assert.ok(withDem.sections.every((s) => s.mode === "drawing+dem"));
  await page.locator("#useDem").uncheck();
  const count = external.length;
  await page.locator("#build").click();
  await page.waitForFunction(
    () => document.getElementById("stationSelect").options.length === 5,
  );
  assert.equal(external.length, count);
  const noDem = JSON.parse(
    await fs.readFile(
      await download("#modelJson", "model-no-dem.json"),
      "utf8",
    ),
  );
  assert.ok(noDem.model.points.every((p) => p.kind !== "dem"));
  // Turning OFF while a DEM task is in flight must not reapply its stale result.
  slow = true;
  await page.locator("#useDem").check();
  await page.locator("#build").click();
  await page.waitForFunction(
    () => document.getElementById("cancel").disabled === false,
  );
  await page.locator("#useDem").uncheck();
  await page.waitForFunction(
    () => document.getElementById("cancel").disabled === true,
  );
  assert.equal(await page.locator("#stationSelect").inputValue(), "");
  slow = false;
  // Real UI import -> assign a surface -> pick centerline -> sections -> export.
  await page.locator("#newProject").click();
  const sim =
    "A01,1,P1,0,0,10.000\nA01,2,P2,0,20,10.000\nA01,3,P3,40,20,12.000\nA01,4,P4,40,0,12.000";
  await page
    .locator("#files")
    .setInputFiles({
      name: "synthetic.sim",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(sim),
    });
  await page.waitForFunction(() =>
    document.getElementById("stats").textContent.includes("4点"),
  );
  await page.locator("#allPoints").click();
  await page.locator("#maxEdge").fill("100");
  await page.locator("#addSurface").click();
  await page.locator("#centerMode").click();
  const rect = await page.locator("#plan").boundingBox(),
    scale = (rect.height / 40) * 0.82;
  await page.mouse.click(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2 + 15 * scale,
  );
  await page.mouse.click(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2 - 15 * scale,
  );
  await page.locator("#finishPath").click();
  await page.locator("#build").click();
  await page.waitForFunction(
    () => document.getElementById("stationSelect").options.length === 4,
  );
  const realUI = JSON.parse(
    await fs.readFile(
      await download("#modelJson", "model-import.json"),
      "utf8",
    ),
  );
  assert.equal(realUI.model.points.length, 4);
  assert.equal(realUI.sections.length, 4);
  assert.ok(realUI.sections[1].segments.length);
  // SFC vector file also passes the browser/Worker entry.
  const sfc =
    "/*SXF\n#1 = point_marker_feature('1','1','0','0','1')\nSXF*/\n/*SXF\n#2 = text_string_feature('1','1','1','15.00','1000','0','500','1','1','0','0','1','1')\nSXF*/";
  await page
    .locator("#files")
    .setInputFiles({
      name: "synthetic.sfc",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(sfc),
    });
  await page.waitForFunction(() =>
    document.getElementById("stats").textContent.includes("2ファイル"),
  );
  await page.locator("#candidates").click();
  await page.locator("#dataDialog").waitFor({ state: "visible" });
  await page.locator("#dialogBody select").selectOption({ index: 1 });
  await page.getByRole("button", { name: "対応を確認して採用" }).click();
  assert.ok((await page.locator("#stats").textContent()).includes("5点"));
  await page.locator("#closeDialog").click();
  const untouched = await page.evaluate(async () => ({
    storage: localStorage.getItem("sfcviewer-ui-preferences-v1"),
    sentinel: window.originalSentinel,
    sw: (await navigator.serviceWorker.getRegistrations()).length,
    idb: await new Promise((resolve) => {
      const r = indexedDB.open("original-ez-test");
      r.onsuccess = () => {
        const db = r.result,
          q = db.transaction("state").objectStore("state").get("data");
        q.onsuccess = () => {
          db.close();
          resolve(q.result);
        };
      };
    }),
  }));
  assert.deepEqual(untouched, {
    storage: "original-sentinel",
    sentinel: { x: 17 },
    sw: 0,
    idb: { unchanged: true },
  });
  assert.ok(
    !requests.some(
      (u) => /\/index\.html$/.test(u) && !u.includes("/ez-viewer-plus/"),
    ),
  );
  assert.deepEqual(errors, []);
  await context.close();
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    }),
    mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(String(e)));
  await mp.goto(base, { waitUntil: "networkidle" });
  await mp.locator("#demo").click();
  await mp.waitForFunction(
    () => document.getElementById("stationSelect").options.length === 5,
  );
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await mp.screenshot({ path: path.join(out, "mobile.png"), fullPage: true });
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        base,
        result: "PASS",
        checks: [
          "default OFF/no external calls",
          "demo multi-surface pipeline",
          "3D canvas",
          "CSV/SVG/model output",
          "project roundtrip",
          "invalid JSON preserves work",
          "DEM Worker PNG path",
          "OFF discards DEM",
          "cancel prevents stale result",
          "SIMA UI to sections",
          "SFC UI candidates",
          "original storage/global unchanged",
          "no Service Worker",
          "mobile layout",
        ],
        errors,
        screenshots: out,
      },
      null,
      2,
    ),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server?.close();
  });
