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
  'startTextLongPress(e.clientX,e.clientY,"mouse")',
  "setTouchPanPreview(e.clientX-lastX,e.clientY-lastY)",
  "updateDesktopWheelZoomPreview(mx,my,view.scale*factor,layoutRect)",
  'id="interactionCanvas"',
  "function scheduleInteractionDraw()",
  "if(desktopWheelZoomPreviewBase)return;",
  "if(textLayerModalIsOpen())closeTextLayerModal();",
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

  await page.evaluate(()=>window.eval(`(()=>{
    selectedTextForLayerChange=data.texts[0];
    document.getElementById("textLayerModal").style.display="flex";
    document.getElementById("coordinateInspectModal").style.display="flex";
  })()`));
  await page.mouse.click(px,py);
  const photoClick=await page.evaluate(()=>window.eval(`({panel:photoPositionPanelIsOpen(),active:photoPositionAdjustIsActive(),selected:selectedPhotoPositionItem===photoAnnotations[0],textModal:getComputedStyle(document.getElementById("textLayerModal")).display,coordinateModal:getComputedStyle(document.getElementById("coordinateInspectModal")).display})`));
  if(!photoClick.panel||!photoClick.active||!photoClick.selected||photoClick.textModal!=="none"||photoClick.coordinateModal!=="none")throw new Error(`photo click/priority failed: ${JSON.stringify(photoClick)}`);

  const textClick=await page.evaluate(()=>window.eval(`(()=>{
    setPhotoListPanelOpen(false);photoAnnotations=[];selectedTextForLayerChange=null;suppressClickUntil=0;
    document.getElementById("coordinateInspectModal").style.display="flex";
    const p=worldToScreen(0,0),r=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent("click",{bubbles:true,button:0,clientX:r.left+p[0]+8,clientY:r.top+p[1]+5}));
    return {selected:selectedTextForLayerChange?._sxfFeatureId,display:getComputedStyle(document.getElementById("textLayerModal")).display,coordinate:getComputedStyle(document.getElementById("coordinateInspectModal")).display};
  })()`));
  if(textClick.selected!==101||textClick.display!=="flex"||textClick.coordinate!=="none")throw new Error(`text click failed: ${JSON.stringify(textClick)}`);

  await page.evaluate(()=>window.eval(`(()=>{
    closeTextLayerModal();closeCoordinateInspectModal();
    data.texts=[];photoAnnotations=[];data.lines=[[0,0,10,10,1,1,1]];
    suppressClickUntil=0;window.__desktopLongPress=null;
    openCoordinateInspectModal=(x,y)=>{window.__desktopLongPress={x,y};};
  })()`));
  await page.mouse.move(rect.x+760,rect.y+610);
  await page.mouse.down({button:"left"});
  await page.waitForTimeout(590);
  const desktopLongPress=await page.evaluate(()=>window.__desktopLongPress);
  await page.mouse.up({button:"left"});
  if(!desktopLongPress)throw new Error("PC left long press did not open coordinate/DEM information");

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
    const preview={tx:view.tx,ty:view.ty,transform:canvas.style.transform,active:touchPanPreviewActive};
    window.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,button:1,buttons:0,clientX:x+50,clientY:y+35}));
    const middle={tx:view.tx,ty:view.ty,transform:canvas.style.transform,active:touchPanPreviewActive};
    view.tx=20;view.ty=30;
    canvas.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:2,buttons:2,clientX:x,clientY:y}));
    window.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,button:2,buttons:2,clientX:x-25,clientY:y+15}));
    const rightPreview={tx:view.tx,ty:view.ty,transform:canvas.style.transform,active:touchPanPreviewActive};
    window.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,button:2,buttons:0,clientX:x-25,clientY:y+15}));
    const right={tx:view.tx,ty:view.ty,transform:canvas.style.transform,active:touchPanPreviewActive};
    return {left,preview,middle,rightPreview,right};
  })()`));
  if(pan.left.tx!==100||pan.left.ty!==200)throw new Error(`left click still pans: ${JSON.stringify(pan.left)}`);
  if(pan.preview.tx!==100||pan.preview.ty!==200||!pan.preview.active||!pan.preview.transform.includes("50px"))throw new Error(`middle-button preview is not lightweight: ${JSON.stringify(pan.preview)}`);
  if(pan.middle.tx!==150||pan.middle.ty!==235||pan.middle.active||pan.middle.transform!=="")throw new Error(`middle-button pan failed: ${JSON.stringify(pan.middle)}`);
  if(pan.rightPreview.tx!==20||pan.rightPreview.ty!==30||!pan.rightPreview.active||!pan.rightPreview.transform.includes("-25px"))throw new Error(`right-button preview is not lightweight: ${JSON.stringify(pan.rightPreview)}`);
  if(pan.right.tx!==-5||pan.right.ty!==45||pan.right.active||pan.right.transform!=="")throw new Error(`right-button pan failed: ${JSON.stringify(pan.right)}`);

  const wheelPreview=await page.evaluate(()=>window.eval(`(()=>{
    finishDesktopWheelZoomPreview();
    view.scale=2;view.tx=100;view.ty=200;
    const r=canvas.getBoundingClientRect(),x=r.left+360,y=r.top+280;
    const before=screenToWorld(360,280);
    for(let i=0;i<6;i++)canvas.dispatchEvent(new WheelEvent("wheel",{bubbles:true,cancelable:true,deltaY:-100,clientX:x,clientY:y}));
    const during=screenToWorld(360,280);
    return {scale:view.scale,transform:canvas.style.transform,active:!!desktopWheelZoomPreviewBase,before,during};
  })()`));
  if(!(wheelPreview.scale>2)||!wheelPreview.active||!wheelPreview.transform.startsWith("matrix("))throw new Error(`wheel zoom preview did not start: ${JSON.stringify(wheelPreview)}`);
  if(Math.hypot(wheelPreview.before[0]-wheelPreview.during[0],wheelPreview.before[1]-wheelPreview.during[1])>1e-8)throw new Error(`wheel zoom anchor drifted during repeated zoom: ${JSON.stringify(wheelPreview)}`);
  await page.waitForTimeout(140);
  const wheelCommitted=await page.evaluate(()=>window.eval(`({transform:canvas.style.transform,active:!!desktopWheelZoomPreviewBase,after:screenToWorld(360,280)})`));
  if(wheelCommitted.active||wheelCommitted.transform!=="")throw new Error(`wheel zoom preview did not commit: ${JSON.stringify(wheelCommitted)}`);
  if(Math.hypot(wheelPreview.before[0]-wheelCommitted.after[0],wheelPreview.before[1]-wheelCommitted.after[1])>1e-8)throw new Error(`wheel zoom anchor drifted after commit: ${JSON.stringify({wheelPreview,wheelCommitted})}`);

  const lightweight=await page.evaluate(()=>window.eval(`(async()=>{
    finishDesktopWheelZoomPreview();
    const originalDraw=draw,originalOverlay=drawInteractionOverlay;
    let baseDraws=0,overlayDraws=0;
    draw=()=>{baseDraws++;return originalDraw();};
    drawInteractionOverlay=()=>{overlayDraws++;return originalOverlay();};
    const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const sendMoves=(r)=>{for(let i=0;i<20;i++)window.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,clientX:r.left+300+i,clientY:r.top+260+i}));};
    const r=canvas.getBoundingClientRect();

    measureMode=true;profileMode=false;inkDrawing=false;activePickModes=["free"];
    sendMoves(r);await settle();
    const measure={baseDraws,overlayDraws};

    baseDraws=0;overlayDraws=0;measureMode=false;hoverMeasurePoint=null;profileMode=true;profileStartWorld={x:0,y:0};profileEndWorld=null;
    sendMoves(r);await settle();
    const profile={baseDraws,overlayDraws};

    baseDraws=0;overlayDraws=0;profileMode=false;profileStartWorld=null;profileHoverWorld=null;inkDrawing=true;
    currentStroke={type:"freehand",color:"#f00",width:1,opacity:1,eraser:false,points:[{x:0,y:0}]};
    sendMoves(r);await settle();
    const ink={baseDraws,overlayDraws};

    inkDrawing=false;currentStroke=null;draw=originalDraw;drawInteractionOverlay=originalOverlay;
    return {measure,profile,ink,overlaySize:[interactionCanvas.width,interactionCanvas.height],canvasSize:[canvas.width,canvas.height]};
  })()`));
  for(const [mode,result] of Object.entries({measure:lightweight.measure,profile:lightweight.profile,ink:lightweight.ink})){
    if(result.baseDraws!==0||result.overlayDraws<1||result.overlayDraws>3)throw new Error(`${mode} interaction still redraws the full drawing: ${JSON.stringify(lightweight)}`);
  }
  if(JSON.stringify(lightweight.overlaySize)!==JSON.stringify(lightweight.canvasSize))throw new Error(`interaction overlay size mismatch: ${JSON.stringify(lightweight)}`);
  if(pageErrors.length)throw new Error(`page errors: ${pageErrors.join(" | ")}`);
  console.log("PC object interaction and pan checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
