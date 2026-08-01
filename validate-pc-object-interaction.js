const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  "function hitTestPhotoPositionMarker(screenX,screenY)",
  "function activatePhotoPositionAdjustment(hit)",
  "function findDesktopCadInteractiveTarget(screenX,screenY)",
  "desktopCadCrosshairHit",
  "if(e.button===0&&!isTouchMobileLike()){dragging=false;return;}",
  'startTextLongPress(e.touches[0].clientX,e.touches[0].clientY,"touch")'
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
  const page=await browser.newPage({viewport:{width:1200,height:820}});
  const pageErrors=[];
  page.on("pageerror",error=>pageErrors.push(String(error)));
  await page.addInitScript(()=>{
    const mock=(_from,_to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=key=>key;
    window.proj4=mock;
    window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("findDesktopCadInteractiveTarget")==="function",null,{timeout:10000});

  const setup=await page.evaluate(()=>window.eval(`(()=>{
    document.getElementById("startupModal").style.display="none";
    loadedSfcText="test";currentLoadedKind="sfc";showText=true;
    rotationDeg=0;view={scale:2,tx:430,ty:360};
    data={lines:[],polys:[],splines:[],texts:[{x:0,y:0,w:34,h:12,sp:0,angle:0,align1:1,text:"TEST",layer:"1",_sxfFeatureId:101}],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{"1":"TEXT"},source_name:"test.sfc",_drawingToPaperScale:1};
    photoAnnotations=[{number:1,fileName:"P1.jpg",lat:34,lon:134,direction:0,capturedAt:"2026:08:01 10:00:00",xNorth:0,yEast:0,demElevation:10,demSource:"DEM1A",demElevationChecked:true,worldX:0,worldY:0,markerX:0,markerY:0,coordinateZone:4,originalLat:34,originalLon:134,originalDirection:0,originalXNorth:0,originalYEast:0,listX:0,listY:-20,listLayoutVersion:2}];
    layerVisibility[PHOTO_POSITION_LAYER_ID]=true;layerVisibility["1"]=true;
    setPhotoListPanelOpen(false);setPhotoPositionAdjustMode(false);scheduleDraw();
    const g=getPhotoMarkerScreenGeometry(photoAnnotations[0]);
    return {center:g.center};
  })()`));
  const rect=await page.locator("#canvas").boundingBox();
  const px=rect.x+setup.center[0],py=rect.y+setup.center[1];
  await page.mouse.move(px,py);
  await page.waitForTimeout(90);
  const hoverPhoto=await page.evaluate(()=>document.getElementById("desktopCadCrosshair").classList.contains("interactive"));
  if(!hoverPhoto)throw new Error("photo hover target was not indicated");

  await page.mouse.click(px,py);
  const photoClick=await page.evaluate(()=>window.eval(`({panel:photoPositionPanelIsOpen(),active:photoPositionAdjustIsActive(),selected:selectedPhotoPositionItem===photoAnnotations[0],textModal:getComputedStyle(document.getElementById("textLayerModal")).display})`));
  if(!photoClick.panel||!photoClick.active||!photoClick.selected||photoClick.textModal!=="none")throw new Error(`photo click/priority failed: ${JSON.stringify(photoClick)}`);

  const textClick=await page.evaluate(()=>window.eval(`(()=>{
    setPhotoListPanelOpen(false);photoAnnotations=[];selectedTextForLayerChange=null;suppressClickUntil=0;
    const p=worldToScreen(0,0),r=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent("click",{bubbles:true,button:0,clientX:r.left+p[0]+8,clientY:r.top+p[1]+5}));
    return {selected:selectedTextForLayerChange?._sxfFeatureId,display:getComputedStyle(document.getElementById("textLayerModal")).display};
  })()`));
  if(textClick.selected!==101||textClick.display!=="flex")throw new Error(`text click failed: ${JSON.stringify(textClick)}`);

  const pan=await page.evaluate(()=>window.eval(`(()=>{
    document.getElementById("textLayerModal").style.display="none";data.texts=[];
    view.tx=100;view.ty=200;
    const r=canvas.getBoundingClientRect(),x=r.left+250,y=r.top+220;
    canvas.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0,buttons:1,clientX:x,clientY:y}));
    window.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,button:0,buttons:1,clientX:x+50,clientY:y+35}));
    window.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,button:0,buttons:0,clientX:x+50,clientY:y+35}));
    const left={tx:view.tx,ty:view.ty};
    canvas.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:1,buttons:4,clientX:x,clientY:y}));
    window.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,button:1,buttons:4,clientX:x+50,clientY:y+35}));
    window.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,button:1,buttons:0,clientX:x+50,clientY:y+35}));
    return {left,middle:{tx:view.tx,ty:view.ty}};
  })()`));
  if(pan.left.tx!==100||pan.left.ty!==200)throw new Error(`left click still pans: ${JSON.stringify(pan.left)}`);
  if(pan.middle.tx!==150||pan.middle.ty!==235)throw new Error(`middle-button pan failed: ${JSON.stringify(pan.middle)}`);
  if(pageErrors.length)throw new Error(`page errors: ${pageErrors.join(" | ")}`);
  console.log("PC object interaction and pan checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
