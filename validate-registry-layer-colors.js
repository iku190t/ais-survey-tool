const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'data-registry-layer="parcel"',
  'data-registry-layer="boundary"',
  'data-registry-layer="point"',
  'data-registry-layer="label"',
  'REGISTRY_LAYER_COLOR_STORAGE_KEY',
  'layerColorPaletteTarget.type==="registry"',
  'registryColorWithAlpha(registryLayerColors.parcel',
  'ctx.strokeStyle=registryLayerColors.boundary',
  'ctx.fillStyle=registryLayerColors.point',
  'ctx.fillStyle=registryLayerColors.label'
])if(!source.includes(token))throw new Error(`missing implementation: ${token}`);

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
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on("pageerror",error=>errors.push(String(error)));
  await page.route(/^https:\/\//,route=>route.abort());
  const url=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(url,{waitUntil:"load",timeout:10000});
  await page.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    document.getElementById("registryMapPanel").style.display="block";
    updateRegistryMapUi();
  });
  const ids=["registryParcelColorBtn","registryBoundaryColorBtn","registryPointColorBtn","registryLabelColorBtn"];
  for(const id of ids)if(!(await page.locator(`#${id}`).isVisible()))throw new Error(`${id} is not visible`);
  const before=await page.evaluate(()=>({...registryLayerColors}));
  await page.locator("#registryBoundaryColorBtn").click();
  if(!(await page.locator("#layerColorPaletteModal").isVisible()))throw new Error("palette did not open");
  await page.locator('.layerPaletteSwatch[aria-label="色 5"]').click();
  const changed=await page.evaluate(()=>({
    colors:{...registryLayerColors},
    css:getComputedStyle(document.getElementById("registryBoundaryColorBtn")).getPropertyValue("--registry-color").trim(),
    stored:JSON.parse(localStorage.getItem(REGISTRY_LAYER_COLOR_STORAGE_KEY)||"{}")
  }));
  if(changed.colors.boundary!=="#ff0000"||changed.css!=="#ff0000"||changed.stored.boundary!=="#ff0000")throw new Error(`boundary color failed: ${JSON.stringify(changed)}`);
  for(const key of ["parcel","point","label"])if(changed.colors[key]!==before[key])throw new Error(`${key} changed unexpectedly`);
  await page.reload({waitUntil:"load"});
  const persisted=await page.evaluate(()=>({
    color:registryLayerColors.boundary,
    css:getComputedStyle(document.getElementById("registryBoundaryColorBtn")).getPropertyValue("--registry-color").trim()
  }));
  if(persisted.color!=="#ff0000"||persisted.css!=="#ff0000")throw new Error(`persistence failed: ${JSON.stringify(persisted)}`);

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.route(/^https:\/\//,route=>route.abort());
  await mobile.goto(url,{waitUntil:"load",timeout:10000});
  const mobileButtons=await mobile.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    document.getElementById("registryMapPanel").style.display="block";
    updateRegistryMapUi();
    return [...document.querySelectorAll(".registryColorButton[data-registry-layer]")].map(button=>({
      key:button.dataset.registryLayer,
      width:button.getBoundingClientRect().width,
      height:button.getBoundingClientRect().height
    }));
  });
  if(mobileButtons.length!==4||mobileButtons.some(button=>button.width<36||button.height<28))throw new Error(`mobile buttons failed: ${JSON.stringify(mobileButtons)}`);
  await mobile.close();
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("Registry layer colors validated on desktop and mobile");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
