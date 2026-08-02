const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
if(source.includes('id="controlPointEnabledToggle"'))throw new Error("legacy control-point master checkbox remains");
for(const id of ["controlTriangulationToggle","controlBenchmarkToggle","controlElectronicToggle"]){
  if(!new RegExp(`<button\\s+id=["']${id}["']`,`i`).test(source))throw new Error(`control-point type is not a button: ${id}`);
}

const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader("Content-Type",path.extname(file).toLowerCase()===".js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
async function prepare(page){
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  await page.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,10,1,1,1]];
    resolveProfileZone=async()=>4;
    scheduleDraw=()=>{};
    updateDrawingDependentUi();
    document.getElementById("controlPointPanel").style.display="block";
  });
}
async function state(page){
  return page.evaluate(()=>({
    enabled:controlPointEnabled,
    filters:{...controlPointFilters},
    active:["controlTriangulationToggle","controlBenchmarkToggle","controlElectronicToggle"].map(id=>document.getElementById(id).classList.contains("active")),
    pressed:["controlTriangulationToggle","controlBenchmarkToggle","controlElectronicToggle"].map(id=>document.getElementById(id).getAttribute("aria-pressed"))
  }));
}
async function verify(page,label){
  await page.locator("#controlTriangulationToggle").click();
  await page.waitForFunction(()=>controlPointEnabled===true);
  let current=await state(page);
  if(JSON.stringify(current.active)!==JSON.stringify([true,false,false]))throw new Error(`${label}: first selection failed ${JSON.stringify(current)}`);

  await page.locator("#controlBenchmarkToggle").click();
  current=await state(page);
  if(JSON.stringify(current.active)!==JSON.stringify([true,true,false]))throw new Error(`${label}: multi-selection failed ${JSON.stringify(current)}`);

  await page.locator("#controlTriangulationToggle").click();
  current=await state(page);
  if(JSON.stringify(current.active)!==JSON.stringify([false,true,false]))throw new Error(`${label}: second-click removal failed ${JSON.stringify(current)}`);

  await page.locator("#controlElectronicToggle").click();
  await page.locator("#controlBenchmarkToggle").click();
  await page.locator("#controlElectronicToggle").click();
  current=await state(page);
  if(current.enabled||current.active.some(Boolean)||current.pressed.some(value=>value!=="false"))throw new Error(`${label}: all-off state failed ${JSON.stringify(current)}`);
}

(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const desktop=await browser.newPage({viewport:{width:1440,height:900}});
  await prepare(desktop);
  await verify(desktop,"desktop");

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await prepare(mobile);
  await verify(mobile,"mobile");
  console.log("Control-point type buttons validated on desktop and mobile");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
