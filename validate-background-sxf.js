const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="backgroundSxfToolbarBtn"',
  'id="backgroundSxfOpenBtn"',
  'id="backgroundSxfInput"',
  'function appendBackgroundSxfData(',
  '先に元のSFC図面を開いてください'
])if(!source.includes(token))throw new Error(`missing background SXF implementation: ${token}`);
const bgIndex=source.indexOf('id="bgBtn"');
const sxfIndex=source.indexOf('id="backgroundSxfToolbarBtn"');
const terrainIndex=source.indexOf('id="terrainToolbarBtn"');
if(!(bgIndex<sxfIndex&&sxfIndex<terrainIndex))throw new Error("desktop background SXF toolbar order is incorrect");

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
  if(!(await desktop.locator("#backgroundSxfToolbarBtn").isVisible()))throw new Error("desktop background SXF button is hidden");
  if(await desktop.locator("#backgroundSxfRow").isVisible())throw new Error("mobile background SXF row is visible on desktop");
  const result=await desktop.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    loadedSfcText="base";
    data={
      lines:[[0,0,10,0,1,1,1,1,[]]],polys:[],splines:[],texts:[],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],
      layerNames:{"1":"元図面"}
    };
    layerVisibility={"1":true};
    layerColorOverrides={};
    deletedLayerNames=new Set();
    prepareRenderMetadata(data,4);
    const imported={
      lines:[[100,100,200,100,7,1,1,1,[]]],polys:[],splines:[],
      texts:[{text:"道路",x:120,y:100,h:10,w:20,sp:0,angle:0,slant:0,align1:1,align2:1,layer:7,color:"#000000"}],
      circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{"7":"道路"}
    };
    const count=appendBackgroundSxfData(imported,"基盤.sfc",256);
    renderLayerList();
    const backgroundLayer=getAllLayers().find(layer=>getLayerLabel(layer)==="基盤背景_基盤_道路");
    const labels=Array.from(document.querySelectorAll("#layerList .layerItemName")).map(element=>element.textContent);
    return {
      count,
      originalLine:data.lines.some(line=>line[4]===1),
      backgroundLayer,
      color:layerColorOverrides[String(backgroundLayer)],
      visible:layerVisibility[String(backgroundLayer)],
      labels
    };
  });
  if(result.count!==2||!result.originalLine||!result.backgroundLayer||result.color!=="#8fa3b8"||!result.visible||!result.labels.includes("基盤背景_基盤_道路")){
    throw new Error(`background SXF merge failed: ${JSON.stringify(result)}`);
  }

  const integration=await browser.newPage({viewport:{width:1440,height:900}});
  integration.on("pageerror",error=>errors.push(String(error)));
  await integration.route(/^https:\/\//,route=>route.abort());
  await integration.goto(base,{waitUntil:"load",timeout:10000});
  const samplePath=path.join(root,"sample.sfc");
  await integration.locator("#fileInput").setInputFiles(samplePath);
  await integration.waitForFunction(()=>hasLoadedDrawing()&&data.lines.length>100,undefined,{timeout:15000});
  const originalCount=await integration.evaluate(()=>getAllLayers().length);
  await integration.locator("#backgroundSxfInput").setInputFiles(samplePath);
  try{
    await integration.waitForFunction(()=>Array.from(document.querySelectorAll("#layerList .layerItemName")).some(element=>element.textContent.startsWith("基盤背景_sample_")),undefined,{timeout:20000});
  }catch(error){
    const handlerState=await integration.evaluate(()=>({loaded:hasLoadedDrawing(),status:backgroundSxfStatus?.textContent||"",layers:getAllLayers().slice(-20).map(layer=>getLayerLabel(layer))}));
    throw new Error(`real SFC input did not add layers: ${JSON.stringify(handlerState)}; page errors: ${errors.join(" | ")}; ${error}`);
  }
  const importedState=await integration.evaluate(()=>({
    layers:getAllLayers().length,
    backgroundLayers:getAllLayers().filter(layer=>getLayerLabel(layer).startsWith("基盤背景_sample_")),
    colors:getAllLayers().filter(layer=>getLayerLabel(layer).startsWith("基盤背景_sample_")).map(layer=>layerColorOverrides[String(layer)]),
    status:backgroundSxfStatus?.textContent||""
  }));
  if(importedState.layers<=originalCount||!importedState.backgroundLayers.length||importedState.colors.some(color=>color!=="#8fa3b8")||!importedState.status.includes("背景レイヤーとして追加しました")){
    throw new Error(`real SFC background import failed: ${JSON.stringify(importedState)}`);
  }

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.route(/^https:\/\//,route=>route.abort());
  await mobile.goto(base,{waitUntil:"load",timeout:10000});
  await mobile.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,0,1,1,1,1,[]]];
    updateDrawingDependentUi();
    document.getElementById("aerialPhotoPanel").style.display="block";
  });
  if(await mobile.locator("#backgroundSxfToolbarBtn").isVisible()){
    const details=await mobile.locator("#backgroundSxfToolbarBtn").evaluate(element=>({display:getComputedStyle(element).display,className:element.className,viewport:innerWidth,hover:matchMedia("(hover:hover)").matches,pointer:matchMedia("(pointer:fine)").matches,terrain:getComputedStyle(document.getElementById("terrainToolbarBtn")).display,body:document.body.className}));
    throw new Error(`desktop background SXF button is visible on mobile: ${JSON.stringify(details)}`);
  }
  if(!(await mobile.locator("#backgroundSxfRow").isVisible()))throw new Error("mobile background SXF row is hidden");
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("Background SXF import validated on desktop and mobile");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
