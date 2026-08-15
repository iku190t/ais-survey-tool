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
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:15000});
  await page.waitForFunction(()=>typeof window.eval("startGps")==="function");
  const before=await page.evaluate(()=>({
    display:getComputedStyle(document.getElementById("startupGpsBtn")).display,
    startup:getComputedStyle(document.getElementById("startupModal")).display,
  }));
  if(before.display==="none"||before.startup==="none")throw new Error(`mobile startup GPS button is hidden: ${JSON.stringify(before)}`);
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
  await page.locator("#measureBtn").click();
  await page.locator("#drawBtn").click();
  const drawing=await page.evaluate(()=>window.eval(`({inkEnabled,panel:getComputedStyle(drawPanel).display})`));
  if(!drawing.inkEnabled||drawing.panel==="none")throw new Error(`drawing did not start in GPS-only mode: ${JSON.stringify(drawing)}`);
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
  await desktop.close();
  console.log("mobile GPS startup mode and state restoration checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
