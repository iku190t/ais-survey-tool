const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="registryMapAutoBtn" type="button" aria-pressed="false">図面範囲</button>',
  'registryMapAutoBtn.classList.toggle("active",!!registryMapState.loaded)',
  'if(registryMapState.loaded){',
  'clearRegistryMap();',
  'loadRegistryMapAutomatically({append:false});',
  'function enableVectorBaseMapAfterDrawingLoad()',
  'enableVectorBaseMapAfterDrawingLoad();',
  'backgroundSxfToolbarBtn:!!(vectorBaseMapEnabled||vectorBaseMapResolveBusy)',
  'desktopInkPencilCursor',
  'event.clipboardData.setData("text/plain",plainText)'
])if(!source.includes(token))throw new Error(`missing implementation: ${token}`);
for(const removed of [
  'id="registryMapAppendBtn"',
  'id="registryMapFileInput"',
  'id="registryMapClearBtn"',
  '>地点を指定して追加取得<',
  '>ファイル読込<'
])if(source.includes(removed))throw new Error(`removed registry control is still visible: ${removed}`);

const openHandler=source.slice(source.indexOf('registryMapOpenBtn?.addEventListener("click"'),source.indexOf('document.getElementById("registryMapCloseBtn")'));
if(openHandler.includes("loadRegistryMapAutomatically"))throw new Error("opening the registry panel still starts a download");

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
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  const result=await page.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,10,1,1,1]];
    updateDrawingDependentUi();
    let downloads=0;
    const original=loadRegistryMapAutomatically;
    loadRegistryMapAutomatically=()=>{downloads++;};
    document.getElementById("registryMapOpenBtn").click();
    const afterOpen=downloads;
    const button=document.getElementById("registryMapAutoBtn");
    const initial={active:button.classList.contains("active"),pressed:button.getAttribute("aria-pressed"),text:button.textContent.trim()};
    button.click();
    const afterAcquireClick=downloads;
    registryMapState=registryEmptyState();registryMapState.loaded=true;updateRegistryMapUi();
    const loaded={active:button.classList.contains("active"),pressed:button.getAttribute("aria-pressed"),text:button.textContent.trim()};
    button.click();
    const cleared={loaded:registryMapState.loaded,active:button.classList.contains("active"),pressed:button.getAttribute("aria-pressed"),text:button.textContent.trim()};
    loadRegistryMapAutomatically=original;
    return {afterOpen,afterAcquireClick,initial,loaded,cleared};
  });
  if(result.afterOpen!==0||result.afterAcquireClick!==1)throw new Error(`registry download trigger failed: ${JSON.stringify(result)}`);
  if(result.initial.active||result.initial.pressed!=="false"||result.initial.text!=="図面範囲")throw new Error(`registry initial state failed: ${JSON.stringify(result.initial)}`);
  if(!result.loaded.active||result.loaded.pressed!=="true"||result.loaded.text!=="図面範囲")throw new Error(`registry loaded state failed: ${JSON.stringify(result.loaded)}`);
  if(result.cleared.loaded||result.cleared.active||result.cleared.pressed!=="false"||result.cleared.text!=="図面範囲")throw new Error(`registry clear state failed: ${JSON.stringify(result.cleared)}`);
  const automatic=await page.evaluate(async()=>{
    const original=enableVectorBaseMap;
    let calls=0,silent=false;
    enableVectorBaseMap=options=>{calls++;silent=options?.silent===true;vectorBaseMapEnabled=true;updateAerialPhotoUi();updateToolbarActivationUI();return Promise.resolve();};
    await openBundledSampleDrawing();
    await new Promise(resolve=>setTimeout(resolve,30));
    const checked=document.getElementById("vectorMapToggleSwitch").checked;
    const toolbarActive=document.getElementById("backgroundSxfToolbarBtn").classList.contains("modeActive");
    enableVectorBaseMap=original;
    return {calls,silent,checked,toolbarActive};
  });
  if(automatic.calls!==1||!automatic.silent||!automatic.checked||!automatic.toolbarActive)throw new Error(`foundation map auto-enable failed: ${JSON.stringify(automatic)}`);
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("Automatic foundation map and single-button registry UI validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
