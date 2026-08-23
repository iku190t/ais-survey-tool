const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const source=fs.readFileSync("index.html","utf8");
const required=[
  'id="startupGpsBtn"',
  'startGps({allowWithoutDrawing:true})',
  'const zone = chooseJapanPlaneZone(lat, lon);',
  'gpsTemporaryCoordinateZone=zone;',
  'enableGpsContextTiles(zone);',
  'adoptCurrentLocationZoneForDrawing(zone)',
  'drawingZone=adoptCurrentLocationZoneForDrawing(zone);',
  'const drawingZone=getManualCoordinateZone()||null;',
  'drawingReferenceBounds:getGpsDrawingReferenceBoundsWorld()',
  'state.drawingReferenceBounds',
  'if(!shouldDrawAerialCadImages())return;',
  'if(gpsEnabled&&gpsTemporaryCoordinateZone&&aerialPhotoZone===gpsTemporaryCoordinateZone)return;',
  'const distanceUnavailable=!!(state&&state.hadDrawing&&distance==null);',
  'if(!available&&gpsContextSource)',
  'restoreGpsSessionState()',
  'view={scale:state.view.scale,tx:state.view.tx,ty:state.view.ty};',
  'aerialPhotoEnabled=state.aerialPhotoEnabled;',
  'coordinateSystemSelect.disabled=!!gpsTemporaryCoordinateZone;',
  'return hasLoadedDrawing()||gpsOnlyBlankMode;',
  'if(gpsOnlyBlankMode&&!activePickModes.includes("free"))',
];
for(const token of required)if(!source.includes(token))throw new Error(`missing GPS startup implementation: ${token}`);

const root=__dirname;
const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase();
  res.setHeader("Content-Type",ext===".js"?"text/javascript; charset=utf-8":ext===".css"?"text/css; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.addInitScript(()=>{
    const definitions=new Map();
    const mockProj4=(from,to,coordinate)=>{
      if(from==="EPSG:4326")return [coordinate[0]*1000,coordinate[1]*1000];
      return [coordinate[0]/1000,coordinate[1]/1000];
    };
    mockProj4.defs=(key,value)=>{
      if(value!==undefined)definitions.set(key,value);
      return definitions.get(key)||key;
    };
    window.proj4=mockProj4;
    let watchId=0;
    const watches=new Map();
    const position={coords:{latitude:34.0703,longitude:134.5548,accuracy:4,altitude:12.3}};
    Object.defineProperty(navigator,"geolocation",{configurable:true,value:{
      watchPosition(success){const id=++watchId;watches.set(id,success);setTimeout(()=>watches.get(id)?.(position),20);return id;},
      clearWatch(id){watches.delete(id);},
      getCurrentPosition(success){setTimeout(()=>success(position),0);}
    }});
  });
  const tilePng=fs.readFileSync(path.join(root,"sfc-viewer-icon-180.png"));
  let failAerialProbeRequests=false;
  await page.route(/^https:\/\//,route=>{
    if(route.request().url().startsWith("https://cyberjapandata.gsi.go.jp/xyz/")){
      if(failAerialProbeRequests&&route.request().resourceType()==="fetch")route.abort();
      else route.fulfill({status:200,contentType:"image/png",body:tilePng});
    }else route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:15000});
  await page.waitForFunction(()=>typeof window.eval("startGps")==="function");
  const before=await page.evaluate(()=>({
    display:getComputedStyle(document.getElementById("startupGpsBtn")).display,
    startup:getComputedStyle(document.getElementById("startupModal")).display,
    fileBottom:document.getElementById("startupOpenBtn").getBoundingClientRect().bottom,
    gpsTop:document.getElementById("startupGpsBtn").getBoundingClientRect().top,
  }));
  if(before.display==="none"||before.startup==="none")throw new Error(`mobile startup GPS button is hidden: ${JSON.stringify(before)}`);
  if(before.gpsTop<=before.fileBottom)throw new Error(`startup GPS button is not below file button: ${JSON.stringify(before)}`);
  const mobileStartupButtons=await page.evaluate(()=>{
    const ids=["startupOpenBtn","startupGpsBtn","startupRecoveryBtn","startupSampleBtn","startupVideoBtn"];
    return ids.map(id=>{const element=document.getElementById(id),style=getComputedStyle(element);return {id,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,background:style.backgroundColor,color:style.color};});
  });
  const mobileButtonWidths=mobileStartupButtons.map(item=>item.width);
  if(Math.max(...mobileButtonWidths)-Math.min(...mobileButtonWidths)>.5||mobileStartupButtons.some(item=>item.height<38||item.background!==mobileStartupButtons[0].background||item.color!==mobileStartupButtons[0].color)){
    throw new Error(`startup buttons are not uniform on mobile: ${JSON.stringify(mobileStartupButtons)}`);
  }
  await page.locator("#startupGpsBtn").click();
  await page.waitForFunction(()=>window.eval("gpsEnabled&&gpsOnlyBlankMode&&gpsPosition&&aerialPhotoEnabled"),null,{timeout:5000});
  const active=await page.evaluate(()=>window.eval(`({
    gpsEnabled,gpsOnlyBlankMode,gpsTemporaryCoordinateZone,aerialPhotoEnabled,aerialPhotoZone,
    startupDisplay:document.getElementById("startupModal").style.display,
    scale:view.scale
  })`));
  if(!active.gpsEnabled||!active.gpsOnlyBlankMode||active.gpsTemporaryCoordinateZone!==4||!active.aerialPhotoEnabled||active.aerialPhotoZone!==4||active.startupDisplay!=="none"){
    throw new Error(`GPS-only mode did not initialize correctly: ${JSON.stringify(active)}`);
  }
  if(await page.locator("#defaultCoordinateSystemSelect").count())throw new Error("obsolete default drawing coordinate control is still visible");
  await page.evaluate(()=>window.eval("scheduleAerialPhotoSourceRefresh({lat:gpsPosition.lat,lon:gpsPosition.lon})"));
  await page.waitForTimeout(900);
  const gpsAerialStable=await page.evaluate(()=>window.eval(`({
    count:aerialAvailableSources.length,
    source:aerialAvailableSources[aerialPhotoSourceIndex]?.id,
    busy:aerialPhotoResolveBusy,
    rescanKey:aerialPhotoRescanKey
  })`));
  if(gpsAerialStable.count!==1||gpsAerialStable.source!=="latest"||gpsAerialStable.busy||gpsAerialStable.rescanKey){
    throw new Error(`GPS aerial photo was rescanned instead of staying stable: ${JSON.stringify(gpsAerialStable)}`);
  }
  await page.evaluate(()=>window.eval("enableGpsContextTiles(4)"));
  const preservedGpsSource=await page.evaluate(()=>window.eval("aerialAvailableSources[aerialPhotoSourceIndex]?.id"));
  if(preservedGpsSource!=="latest")throw new Error(`GPS update changed the current aerial photo: ${preservedGpsSource}`);
  const enabledTools=await page.evaluate(()=>window.eval(`(()=>{
    const ids=["fitBtn","bgBtn","measureBtn","drawBtn","profileBtn","textSearchOpenBtn","settingsBtn","helpBtn","layerFab","googleMapsLinkBtn"];
    return {
      activeWorkspace:isDrawingActionAvailable(),
      states:Object.fromEntries(ids.map(id=>{const element=document.getElementById(id);return [id,{disabled:element?.getAttribute("aria-disabled"),unavailable:element?.classList.contains("unavailableTool")}];}))
    };
  })()`));
  if(!enabledTools.activeWorkspace||Object.values(enabledTools.states).some(state=>state.disabled!=="false"||state.unavailable)){
    throw new Error(`tools remain disabled in GPS-only mode: ${JSON.stringify(enabledTools)}`);
  }
  await page.locator("#bgBtn").click();
  if(await page.locator("#aerialPhotoPanel").evaluate(element=>getComputedStyle(element).display)==="none")throw new Error("background panel did not open in GPS-only mode");
  await page.locator("#terrainPanelOpenBtn").click();
  if(await page.locator("#terrainPanel").evaluate(element=>getComputedStyle(element).display)==="none")throw new Error("terrain panel did not open in GPS-only mode");
  await page.locator("#terrainPanelCloseBtn").click();
  await page.locator("#settingsBtn").click();
  if(await page.locator("#settingsPanel").evaluate(element=>getComputedStyle(element).display)==="none")throw new Error("settings panel did not open in GPS-only mode");
  await page.locator("#settingsCloseBtn").click();
  await page.locator("#measureBtn").click();
  const measuring=await page.evaluate(()=>window.eval(`({measureMode,free:activePickModes.includes("free"),panel:getComputedStyle(measureBox).display})`));
  if(!measuring.measureMode||!measuring.free||measuring.panel==="none")throw new Error(`measurement did not start in GPS-only mode: ${JSON.stringify(measuring)}`);
  const measureLayers=await page.evaluate(()=>({panel:Number(getComputedStyle(document.getElementById("measureBox")).zIndex),street:Number(getComputedStyle(document.getElementById("googleMapsLinkBtn")).zIndex)}));
  if(measureLayers.panel<=measureLayers.street)throw new Error(`measurement popup is behind Street View: ${JSON.stringify(measureLayers)}`);
  await page.locator("#measureBtn").click();
  await page.locator("#drawBtn").click();
  const drawing=await page.evaluate(()=>window.eval(`({inkEnabled,panel:getComputedStyle(drawPanel).display})`));
  if(!drawing.inkEnabled||drawing.panel==="none")throw new Error(`drawing did not start in GPS-only mode: ${JSON.stringify(drawing)}`);
  const drawLayers=await page.evaluate(()=>({panel:Number(getComputedStyle(document.getElementById("drawPanel")).zIndex),street:Number(getComputedStyle(document.getElementById("googleMapsLinkBtn")).zIndex)}));
  if(drawLayers.panel<=drawLayers.street)throw new Error(`drawing popup is behind Street View: ${JSON.stringify(drawLayers)}`);
  await page.locator("#drawBtn").click();
  await page.locator("#profileBtn").click();
  await page.waitForFunction(()=>window.eval("profileMode&&!profileZoneResolving"),null,{timeout:3000});
  await page.locator("#profileBtn").click();
  await page.evaluate(()=>window.eval("stopGps(false)"));
  const stopped=await page.evaluate(()=>window.eval(`({
    gpsEnabled,gpsOnlyBlankMode,gpsTemporaryCoordinateZone,aerialPhotoEnabled,
    startupDisplay:getComputedStyle(document.getElementById("startupModal")).display
  })`));
  if(stopped.gpsEnabled||stopped.gpsOnlyBlankMode||stopped.gpsTemporaryCoordinateZone!==null||stopped.aerialPhotoEnabled||stopped.startupDisplay==="none"){
    throw new Error(`GPS-only mode did not restore startup state: ${JSON.stringify(stopped)}`);
  }
  await page.evaluate(()=>window.eval(`(()=>{
    data.lines=[[500000000,500000000,500010000,500010000,1,1,1]];
    data.source_name="gps-restore-test.sfc";
    profileZone=3;
    aerialPhotoEnabled=false;aerialPhotoZone=null;aerialAvailableSources=[];
    vectorBaseMapEnabled=false;vectorBaseMapZone=null;
    view={scale:.037,tx:123,ty:456};baseFitScale=.029;rotationDeg=17;
    document.getElementById("startupModal").style.display="none";
    startGps();
  })()`));
  await page.waitForFunction(()=>window.eval("gpsEnabled&&gpsPosition&&gpsTemporaryCoordinateZone===4&&aerialPhotoEnabled"),null,{timeout:5000});
  await page.evaluate(()=>window.eval("stopGps(true)"));
  const restored=await page.evaluate(()=>window.eval(`({
    profileZone,gpsTemporaryCoordinateZone,aerialPhotoEnabled,aerialPhotoZone,vectorBaseMapEnabled,vectorBaseMapZone,
    scale:view.scale,tx:view.tx,ty:view.ty,baseFitScale,rotationDeg
  })`));
  if(restored.profileZone!==3||restored.gpsTemporaryCoordinateZone!==null||restored.aerialPhotoEnabled||restored.aerialPhotoZone!==null||restored.vectorBaseMapEnabled||restored.vectorBaseMapZone!==null||restored.scale!==.037||restored.tx!==123||restored.ty!==456||restored.baseFitScale!==.029||restored.rotationDeg!==17){
    throw new Error(`drawing state was not restored after distant GPS mode: ${JSON.stringify(restored)}`);
  }
  failAerialProbeRequests=true;
  await page.evaluate(()=>window.eval(`(()=>{
    aerialPhotoProbeCache.clear();
    data.lines=[[500000000,500000000,500010000,500010000,1,1,1]];
    data.source_name="gps-aerial-fallback-test.sfc";
    profileZone=3;
    aerialPhotoEnabled=false;aerialPhotoZone=null;aerialAvailableSources=[];aerialPhotoAvailabilityKey="";
    startGps();
  })()`));
  await page.waitForFunction(()=>window.eval("gpsEnabled&&gpsPosition&&gpsTemporaryCoordinateZone===4&&aerialPhotoEnabled"),null,{timeout:5000});
  await page.evaluate(()=>window.eval("scheduleAerialPhotoSourceRefresh({lat:gpsPosition.lat,lon:gpsPosition.lon})"));
  await page.waitForTimeout(1800);
  const probeFailureFallback=await page.evaluate(()=>window.eval(`({enabled:aerialPhotoEnabled,zone:aerialPhotoZone,source:aerialAvailableSources[aerialPhotoSourceIndex]?.id,status:photoStatus?.textContent})`));
  if(!probeFailureFallback.enabled||probeFailureFallback.zone!==4||probeFailureFallback.source!=="latest"){
    throw new Error(`GPS aerial photo was disabled by a failed period probe: ${JSON.stringify(probeFailureFallback)}`);
  }
  await page.evaluate(()=>window.eval("stopGps(true)"));
  failAerialProbeRequests=false;
  await page.evaluate(()=>window.eval(`(()=>{
    window.__originalGpsDistance=calcDistanceFromPlaneToSfcBoundsMeters;
    calcDistanceFromPlaneToSfcBoundsMeters=()=>null;
    data.lines=[[1000,1000,2000,2000,1,1,1]];
    data.source_name="gps-distance-unavailable-test.sfc";
    profileZone=4;
    aerialPhotoEnabled=false;aerialPhotoZone=null;aerialAvailableSources=[];aerialPhotoAvailabilityKey="";
    startGps();
  })()`));
  await page.waitForFunction(()=>window.eval("gpsEnabled&&gpsPosition&&gpsTemporaryCoordinateZone===4&&aerialPhotoEnabled"),null,{timeout:5000});
  await page.evaluate(()=>window.eval(`(()=>{
    stopGps(true);
    calcDistanceFromPlaneToSfcBoundsMeters=window.__originalGpsDistance;
    delete window.__originalGpsDistance;
  })()`));
  await page.evaluate(()=>window.eval(`(()=>{
    data.lines=[[134554000,34070000,134555000,34071000,1,1,1]];
    data.source_name="gps-current-zone-adoption-test.sfc";
    saveDrawingCoordinateSetting("auto");
    profileZone=null;
    aerialPhotoEnabled=false;aerialPhotoZone=null;aerialAvailableSources=[];aerialPhotoAvailabilityKey="";
    startGps();
  })()`));
  await page.waitForFunction(()=>window.eval("gpsEnabled&&gpsPosition&&gpsSessionState?.drawingZone===4"),null,{timeout:5000});
  const adoptedDrawingZone=await page.evaluate(()=>window.eval(`({
    drawingZone:gpsSessionState?.drawingZone??null,
    savedZone:getManualCoordinateZone(),
    distance:gpsLastDistanceMeters,
    gpsZone:gpsTemporaryCoordinateZone,
    aerial:aerialPhotoEnabled,
    defaultControl:document.getElementById("defaultCoordinateSystemSelect"),
    status:coordinateSystemStatus?.textContent||""
  })`));
  if(adoptedDrawingZone.drawingZone!==4||adoptedDrawingZone.savedZone!==4||adoptedDrawingZone.distance!==0||adoptedDrawingZone.gpsZone!==null||adoptedDrawingZone.aerial||adoptedDrawingZone.defaultControl!==null||!adoptedDrawingZone.status.includes("第4系")){
    throw new Error(`smartphone did not adopt and remember its current coordinate zone for the drawing: ${JSON.stringify(adoptedDrawingZone)}`);
  }
  await page.evaluate(()=>window.eval(`(()=>{
    stopGps(true);
  })()`));
  const coordinatePriority=await page.evaluate(()=>window.eval(`(()=>{
    data.lines=[[700000000,700000000,700010000,700010000,1,1,1]];
    data.source_name="gps-manual-zone-priority-test.sfc";
    profileZone=null;gpsSessionState=null;
    saveDrawingCoordinateSetting("auto");
    saveDrawingCoordinateSetting("3");
    const state=captureGpsSessionState();
    const result={drawingZone:state.drawingZone,manual:getManualCoordinateZone()};
    gpsSessionState=null;
    return result;
  })()`));
  if(coordinatePriority.drawingZone!==3||coordinatePriority.manual!==3){
    throw new Error(`manual per-drawing coordinate zone was not preserved: ${JSON.stringify(coordinatePriority)}`);
  }
  const distantMultiPartDrawing=await page.evaluate(()=>window.eval(`(()=>{
    const main=Object.assign([0,0,1000,1000,1,1,1],{_sxfPartIsMain:true});
    const unrelated=Object.assign([100000000,0,100001000,1000,1,1,1],{_sxfPartIsMain:false});
    data.lines=[main,unrelated];data.polys=[];data.splines=[];data.texts=[];data.circles=[];data.arcs=[];data.ellipses=[];data.ellipseArcs=[];
    data._mainDrawingPlacement={name:"MAIN",originX:0,originY:0,angle:0,sx:1,sy:1};
    const allBounds=getLoadedSfcBoundsWorld();
    const referenceBounds=getGpsDrawingReferenceBoundsWorld();
    const allBoundsDistance=calcDistanceFromPlaneToSfcBoundsMeters(0,100000,false,allBounds);
    const mainDistance=calcDistanceFromPlaneToSfcBoundsMeters(0,100000,false,referenceBounds);
    const previousTransform=activeCoordinateMeshTransform;
    const previousTemporaryZone=gpsTemporaryCoordinateZone;
    const previousGpsEnabled=gpsEnabled;
    activeCoordinateMeshTransform={kind:"affine",xNorth:{a:0,b:1,offset:1000},yEast:{a:1,b:0,offset:2000}};
    gpsTemporaryCoordinateZone=4;
    const stableMeshDistance=calcDistanceFromPlaneToSfcBoundsMeters(1000,2000,true,{minX:0,minY:0,maxX:1000,maxY:1000});
    gpsEnabled=true;
    const savedAerialHidden=shouldDrawAerialCadImages()===false;
    gpsTemporaryCoordinateZone=null;
    const savedAerialRestored=shouldDrawAerialCadImages()===true;
    activeCoordinateMeshTransform=previousTransform;
    gpsTemporaryCoordinateZone=previousTemporaryZone;
    gpsEnabled=previousGpsEnabled;
    return {source:referenceBounds?.source,allBoundsDistance,mainDistance,stableMeshDistance,savedAerialHidden,savedAerialRestored};
  })()`));
  if(distantMultiPartDrawing.source!=="main-part"||distantMultiPartDrawing.allBoundsDistance!==0||distantMultiPartDrawing.mainDistance<99000||distantMultiPartDrawing.stableMeshDistance!==0||!distantMultiPartDrawing.savedAerialHidden||!distantMultiPartDrawing.savedAerialRestored){
    throw new Error(`distant multi-part drawing reused a false global bound or overlaid its saved aerial photo: ${JSON.stringify(distantMultiPartDrawing)}`);
  }
  const desktop=await browser.newPage({viewport:{width:1280,height:800}});
  await desktop.addInitScript(()=>{
    const mock=(from,to,coordinate)=>coordinate;
    mock.defs=key=>key;
    window.proj4=mock;
  });
  await desktop.route(/^https:\/\//,route=>route.abort());
  await desktop.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:15000});
  const desktopDisplay=await desktop.locator("#startupGpsBtn").evaluate(element=>getComputedStyle(element).display);
  if(desktopDisplay!=="none")throw new Error(`startup GPS button must be smartphone-only, got ${desktopDisplay}`);
  const desktopStartupButtons=await desktop.evaluate(()=>{
    const ids=["startupOpenBtn","startupRecoveryBtn","startupSampleBtn","startupVideoBtn"];
    return ids.map(id=>{const element=document.getElementById(id),style=getComputedStyle(element);return {id,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height,background:style.backgroundColor,color:style.color};});
  });
  const desktopButtonWidths=desktopStartupButtons.map(item=>item.width);
  if(Math.max(...desktopButtonWidths)-Math.min(...desktopButtonWidths)>.5||desktopStartupButtons.some(item=>item.height<38||item.background!==desktopStartupButtons[0].background||item.color!==desktopStartupButtons[0].color)){
    throw new Error(`startup buttons are not uniform on desktop: ${JSON.stringify(desktopStartupButtons)}`);
  }
  await desktop.close();
  console.log("mobile GPS startup mode and state restoration checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
