const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
const toolbarIds=[
  "openIconBtn","fitBtn","bgBtn","terrainToolbarBtn","registryToolbarBtn",
  "controlPointToolbarBtn","hazardToolbarBtn","measureBtn","drawBtn","profileBtn",
  "photoToolBtn","textSearchOpenBtn","settingsBtn","helpBtn","layerFab","undoFab",
  "redoFab","gpsBtn","gpsReturnBtn","compassFab","gpsDetailFab"
];
for(const id of toolbarIds){
  const tag=source.match(new RegExp(`<button\\s+id=["']${id}["'][^>]*>`,`i`));
  if(!tag)throw new Error(`missing toolbar button: ${id}`);
  if(!/data-tooltip=["'][^"']+["']/.test(tag[0]))throw new Error(`missing tooltip: ${id}`);
}
for(const token of [
  "function togglePcMapToolbarPanel(panel,openButton)",
  "#aerialPhotoPanel #terrainPanelOpenBtn",
  'document.querySelectorAll("button[data-tooltip]")'
])if(!source.includes(token))throw new Error(`missing PC toolbar implementation: ${token}`);

const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader("Content-Type",path.extname(file).toLowerCase()===".js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const base=`http://127.0.0.1:${server.address().port}/`;
  const desktop=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  desktop.on("pageerror",error=>errors.push(String(error)));
  await desktop.route(/^https:\/\//,route=>route.abort());
  await desktop.goto(base,{waitUntil:"load",timeout:10000});
  await desktop.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,10,1,1,1]];
    updateDrawingDependentUi();
  });
  for(const id of ["terrainToolbarBtn","registryToolbarBtn","controlPointToolbarBtn","hazardToolbarBtn"]){
    if(!(await desktop.locator(`#${id}`).isVisible()))throw new Error(`desktop map toolbar button is hidden: ${id}`);
  }
  await desktop.locator("#drawBtn").hover();
  await desktop.waitForTimeout(430);
  const tip=await desktop.locator("#toolbarTooltip").textContent();
  if(!tip||!tip.includes("図面へ書き込む"))throw new Error(`handwriting tooltip failed: ${tip}`);
  await desktop.locator("#terrainToolbarBtn").click();
  if(!(await desktop.locator("#terrainPanel").isVisible()))throw new Error("terrain panel did not open from PC toolbar");
  if(!(await desktop.locator("#terrainToolbarBtn").evaluate(element=>element.classList.contains("modeActive"))))throw new Error("terrain toolbar active state was not shown");
  if(await desktop.locator("#aerialPhotoPanel").isVisible())throw new Error("background panel opened with PC terrain panel");
  await desktop.locator("#terrainToolbarBtn").click();
  if(await desktop.locator("#terrainPanel").isVisible())throw new Error("terrain panel did not close from PC toolbar");
  await desktop.locator("#bgBtn").click();
  if(!(await desktop.locator("#aerialPhotoPanel").isVisible()))throw new Error("PC background panel did not open");
  if(await desktop.locator("#terrainPanelOpenBtn").isVisible())throw new Error("PC background panel still contains terrain button");
  await desktop.locator("#bgBtn").click();

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.route(/^https:\/\//,route=>route.abort());
  await mobile.goto(base,{waitUntil:"load",timeout:10000});
  await mobile.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,10,1,1,1]];
    updateDrawingDependentUi();
  });
  if(await mobile.locator("#terrainToolbarBtn").isVisible())throw new Error("PC terrain toolbar button is visible on mobile");
  await mobile.locator("#bgBtn").click();
  if(!(await mobile.locator("#terrainPanelOpenBtn").isVisible()))throw new Error("mobile background panel lost terrain button");
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("PC map toolbar and tooltips validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
