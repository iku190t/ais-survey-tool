const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
const toolbarIds=[
  "openIconBtn","fitBtn","bgBtn","backgroundSxfToolbarBtn","terrainToolbarBtn","registryToolbarBtn",
  "controlPointToolbarBtn","hazardToolbarBtn","simaToolbarBtn","measureBtn","drawBtn","profileBtn",
  "photoToolBtn","textSearchOpenBtn","settingsBtn","helpBtn","layerFab","undoFab",
  "redoFab","gpsBtn","gpsReturnBtn","compassFab","gpsDetailFab"
];
for(const id of toolbarIds){
  const tag=source.match(new RegExp(`<button\\s+id=["']${id}["'][^>]*>`,`i`));
  if(!tag)throw new Error(`missing toolbar button: ${id}`);
  if(!/data-tooltip=["'][^"']+["']/.test(tag[0]))throw new Error(`missing tooltip: ${id}`);
}
for(const token of [
  "function togglePcMapToolbarPanel(panel,openButton,anchorButton)",
  "function positionPcToolbarPanel(panel,anchorButton)",
  "function scheduleMapFeatureWarmup()",
  "function getFullViewSafeTop(h)",
  'registryMapAutoBtn.textContent=registryMapAutoBusy?"キャンセル":registryMapState.loaded?(registryMapDisplayEnabled?"非表示":"表示"):"国土地調査境界"',
  "#aerialPhotoPanel #terrainPanelOpenBtn",
  'document.querySelectorAll("[data-tooltip]")',
  'data-tooltip="制作：株式会社アイズ測量"'
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
  const startupState=await desktop.evaluate(()=>({
    visible:Array.from(document.querySelectorAll("#topbar .toolIconBtn svg")).every(svg=>{
      const button=svg.closest("button"),style=getComputedStyle(button);
      return Number(style.opacity)>=0.6&&getComputedStyle(svg).display!=="none";
    }),
    pcMapButtons:["backgroundSxfToolbarBtn","terrainToolbarBtn","registryToolbarBtn","controlPointToolbarBtn","hazardToolbarBtn","simaToolbarBtn"].map(id=>{
      const button=document.getElementById(id),svg=button?.querySelector("svg");
      const buttonRect=button?.getBoundingClientRect(),svgRect=svg?.getBoundingClientRect();
      return {
        id,
        display:button?getComputedStyle(button).display:"missing",
        opacity:button?Number(getComputedStyle(button).opacity):0,
        label:button?getComputedStyle(button,"::after").content:"none",
        width:buttonRect?.width||0,
        height:buttonRect?.height||0,
        svgWidth:svgRect?.width||0,
        svgHeight:svgRect?.height||0
      };
    }),
    unavailable:Array.from(document.querySelectorAll("#topbar .toolIconBtn:not(#openIconBtn)")).every(button=>button.classList.contains("unavailableTool")),
    terrainPath:document.querySelector("#terrainToolbarBtn svg")?.innerHTML||"",
    profilePath:document.querySelector("#profileBtn svg")?.innerHTML||""
  }));
  if(!startupState.visible||!startupState.unavailable)throw new Error(`startup toolbar icon state failed: ${JSON.stringify(startupState)}`);
  if(startupState.pcMapButtons.some(item=>item.display==="none"||item.opacity<0.6||item.width<36||item.height<45||item.svgWidth<10||item.svgHeight<10||item.label==="none")){
    throw new Error(`startup PC map icon/label rendering failed: ${JSON.stringify(startupState.pcMapButtons)}`);
  }
  if(startupState.terrainPath===startupState.profilePath||!startupState.profilePath||!startupState.terrainPath)throw new Error("terrain/profile icons are not distinct");
  await desktop.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,10,1,1,1]];
    updateDrawingDependentUi();
  });
  const desktopEditButtonHeights=await desktop.evaluate(()=>
    ["layerFab","undoFab","redoFab"].map(id=>document.getElementById(id).getBoundingClientRect().height)
  );
  if(desktopEditButtonHeights.some(height=>Math.abs(height-desktopEditButtonHeights[0])>.5)){
    throw new Error(`desktop layer/undo/redo heights differ: ${JSON.stringify(desktopEditButtonHeights)}`);
  }
  for(const id of ["backgroundSxfToolbarBtn","terrainToolbarBtn","registryToolbarBtn","controlPointToolbarBtn","hazardToolbarBtn","simaToolbarBtn"]){
    if(!(await desktop.locator(`#${id}`).isVisible()))throw new Error(`desktop map toolbar button is hidden: ${id}`);
  }
  await desktop.locator("#drawBtn").hover();
  await desktop.waitForTimeout(430);
  const tip=await desktop.locator("#toolbarTooltip").textContent();
  if(!tip||!tip.includes("図面へ書き込む"))throw new Error(`handwriting tooltip failed: ${tip}`);
  await desktop.locator("#viewerLabel").hover();
  await desktop.waitForTimeout(430);
  const viewerTip=await desktop.locator("#toolbarTooltip").textContent();
  if(viewerTip!=="制作：株式会社アイズ測量")throw new Error(`viewer tooltip failed: ${viewerTip}`);
  await desktop.locator("#terrainToolbarBtn").click();
  if(!(await desktop.locator("#terrainPanel").isVisible()))throw new Error("terrain panel did not open from PC toolbar");
  const terrainPlacement=await desktop.evaluate(()=>{
    const button=document.getElementById("terrainToolbarBtn").getBoundingClientRect();
    const panel=document.getElementById("terrainPanel").getBoundingClientRect();
    const controls=["layerFab","undoFab","redoFab"].map(id=>document.getElementById(id)).filter(Boolean)
      .filter(element=>getComputedStyle(element).display!=="none").map(element=>element.getBoundingClientRect());
    return {buttonCenter:button.left+button.width/2,panelLeft:panel.left,panelRight:panel.right,panelTop:panel.top,safeBottom:Math.max(0,...controls.map(rect=>rect.bottom))};
  });
  if(terrainPlacement.panelTop<terrainPlacement.safeBottom+4||terrainPlacement.buttonCenter<terrainPlacement.panelLeft-12||terrainPlacement.buttonCenter>terrainPlacement.panelRight+12){
    throw new Error(`terrain panel was not placed by its toolbar button: ${JSON.stringify(terrainPlacement)}`);
  }
  if(!(await desktop.locator("#terrainToolbarBtn").evaluate(element=>element.classList.contains("modeActive"))))throw new Error("terrain toolbar active state was not shown");
  if(await desktop.locator("#aerialPhotoPanel").isVisible())throw new Error("background panel opened with PC terrain panel");
  await desktop.locator("#terrainToolbarBtn").click();
  if(await desktop.locator("#terrainPanel").isVisible())throw new Error("terrain panel did not close from PC toolbar");
  await desktop.locator("#simaToolbarBtn").click();
  if(!(await desktop.locator("#simaMapPanel").isVisible()))throw new Error("SIMA panel did not open from PC toolbar");
  await desktop.locator("#simaToolbarBtn").click();
  if(await desktop.locator("#simaMapPanel").isVisible())throw new Error("SIMA panel did not close from PC toolbar");
  await desktop.evaluate(()=>{
    registryMapState={...registryEmptyState(),loaded:true,sourceName:"test"};
    registryMapDisplayEnabled=true;
    updateRegistryMapUi();
  });
  await desktop.locator("#registryToolbarBtn").click();
  const registryHiddenState=await desktop.evaluate(()=>(
    {panelVisible:getComputedStyle(registryMapPanel).display!=="none",displayEnabled:registryMapDisplayEnabled}
  ));
  if(registryHiddenState.panelVisible||registryHiddenState.displayEnabled)throw new Error(`registry settings did not close while hiding loaded data: ${JSON.stringify(registryHiddenState)}`);
  await desktop.locator("#registryToolbarBtn").click();
  const registryShownState=await desktop.evaluate(()=>(
    {panelVisible:getComputedStyle(registryMapPanel).display!=="none",displayEnabled:registryMapDisplayEnabled}
  ));
  if(!registryShownState.panelVisible||!registryShownState.displayEnabled)throw new Error(`registry settings did not open while showing loaded data: ${JSON.stringify(registryShownState)}`);
  await desktop.locator("#registryMapCloseBtn").click();
  await desktop.locator("#bgBtn").click();

  const fitState=await desktop.evaluate(()=>{
    data.lines=[[0,0,1000,0,1,1,1],[1000,0,1000,500,1,1,1],[1000,500,0,500,1,1,1],[0,500,0,0,1,1,1]];
    data.polylines=[];data.texts=[];data.circles=[];data.arcs=[];data.ellipses=[];data.ellipseArcs=[];data.markers=[];
    data._mainDrawingPlacement=null;data._drawingSheet=null;
    initialLoadRotationDeg=45;rotationDeg=45;fitToScreen();
    const points=[[0,0],[1000,0],[1000,500],[0,500]].map(([x,y])=>worldToScreen(x,y));
    return {minY:Math.min(...points.map(point=>point[1])),maxY:Math.max(...points.map(point=>point[1])),height:canvas.clientHeight,safeTop:getFullViewSafeTop(canvas.clientHeight)};
  });
  if(fitState.minY<fitState.safeTop-2||fitState.maxY>fitState.height+2)throw new Error(`rotated full view clipped by toolbar area: ${JSON.stringify(fitState)}`);
  const sheetFitState=await desktop.evaluate(()=>{
    data.lines=[[400,200,600,200,1,1,1],[600,200,600,300,1,1,1],[600,300,400,300,1,1,1],[400,300,400,200,1,1,1]];
    data._mainDrawingPlacement={name:"MAIN",originX:0,originY:0,angle:0,sx:1,sy:1};
    data._drawingSheet={width:1000,height:500};
    initialLoadRotationDeg=0;rotationDeg=0;fitToScreen();
    const sheet=[[0,0],[1000,0],[1000,500],[0,500]].map(([x,y])=>worldToScreen(x,y));
    const content=[[400,200],[600,200],[600,300],[400,300]].map(([x,y])=>worldToScreen(x,y));
    const range=points=>({minX:Math.min(...points.map(point=>point[0])),maxX:Math.max(...points.map(point=>point[0])),minY:Math.min(...points.map(point=>point[1])),maxY:Math.max(...points.map(point=>point[1]))});
    return {sheet:range(sheet),content:range(content),width:canvas.clientWidth,height:canvas.clientHeight,safeTop:getFullViewSafeTop(canvas.clientHeight)};
  });
  if(sheetFitState.sheet.minX<-2||sheetFitState.sheet.maxX>sheetFitState.width+2||sheetFitState.sheet.minY<sheetFitState.safeTop-2||sheetFitState.sheet.maxY>sheetFitState.height+2||sheetFitState.content.maxX-sheetFitState.content.minX>sheetFitState.width*.35){
    throw new Error(`Home fitted inner content instead of the SXF drawing sheet: ${JSON.stringify(sheetFitState)}`);
  }
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
  const mobileEditButtonHeights=await mobile.evaluate(()=>
    ["layerFab","undoFab","redoFab"].map(id=>document.getElementById(id).getBoundingClientRect().height)
  );
  if(mobileEditButtonHeights.some(height=>Math.abs(height-mobileEditButtonHeights[0])>.5)){
    throw new Error(`mobile layer/undo/redo heights differ: ${JSON.stringify(mobileEditButtonHeights)}`);
  }
  const mobileSheetFit=await mobile.evaluate(()=>{
    data.lines=[[400,200,600,200,1,1,1],[600,200,600,300,1,1,1],[600,300,400,300,1,1,1],[400,300,400,200,1,1,1]];
    data.polys=[];data.splines=[];data.texts=[];data.circles=[];data.arcs=[];data.ellipses=[];data.ellipseArcs=[];data.markers=[];
    data._mainDrawingPlacement={name:"MAIN",originX:0,originY:0,angle:0,sx:1,sy:1};
    data._drawingSheet={width:1000,height:500};
    initialLoadRotationDeg=0;rotationDeg=0;fitToScreen();
    const sheet=[[0,0],[1000,0],[1000,500],[0,500]].map(([x,y])=>worldToScreen(x,y));
    const range={minX:Math.min(...sheet.map(point=>point[0])),maxX:Math.max(...sheet.map(point=>point[0])),minY:Math.min(...sheet.map(point=>point[1])),maxY:Math.max(...sheet.map(point=>point[1]))};
    return {...range,width:canvas.clientWidth,height:canvas.clientHeight,safeTop:getFullViewSafeTop(canvas.clientHeight)};
  });
  if(mobileSheetFit.minX<-2||mobileSheetFit.maxX>mobileSheetFit.width+2||mobileSheetFit.minY<mobileSheetFit.safeTop-2||mobileSheetFit.maxY>mobileSheetFit.height+2){
    throw new Error(`mobile Home clipped the SXF drawing sheet: ${JSON.stringify(mobileSheetFit)}`);
  }
  if(await mobile.locator("#terrainToolbarBtn").isVisible())throw new Error("PC terrain toolbar button is visible on mobile");
  if(await mobile.locator("#simaToolbarBtn").isVisible())throw new Error("PC SIMA toolbar button is visible on mobile");
  await mobile.locator("#bgBtn").click();
  if(!(await mobile.locator("#terrainPanelOpenBtn").isVisible()))throw new Error("mobile background panel lost terrain button");
  if(!(await mobile.locator("#simaMapOpenBtn").isVisible()))throw new Error("mobile background panel lost SIMA button");
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("PC map toolbar and tooltips validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
