const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  "function stepCompassFollowAnimation(now)",
  "const COMPASS_FOLLOW_FRAME_MS = 1000/60",
  "const COMPASS_FOLLOW_RESPONSE_MS = 28",
  "const COMPASS_FOLLOW_TARGET_FILTER = 0.88",
  "requestAnimationFrame(stepCompassFollowAnimation)",
  "if(largeDrawingMode)scheduleTouchTransformDraw()",
  'compassFab.addEventListener("click", async event=>',
  'compassFab?.setAttribute("aria-pressed",active?"true":"false")'
])if(!source.includes(token))throw new Error(`missing smooth compass-follow implementation: ${token}`);
for(const obsolete of ["COMPASS_FOLLOW_DEFAULT_ENABLED","startDefaultCompassFollow(","requestCompassOrientationPermissionFromGesture"]){
  if(source.includes(obsolete))throw new Error(`automatic compass startup remains: ${obsolete}`);
}
for(const obsolete of ['id="compassMenu"','id="compassNorthBtn"','id="compassFieldBtn"']){
  if(source.includes(obsolete))throw new Error(`obsolete compass popup remains: ${obsolete}`);
}
const homeHandler=source.slice(source.indexOf('document.getElementById("fitBtn").addEventListener'),source.indexOf('document.getElementById("gpsBtn").addEventListener'));
if(!/stopCompassFollow\(\);/.test(homeHandler)||!/fitToScreen\(\);/.test(homeHandler))throw new Error("Home does not cancel compass follow and restore the drawing orientation");

const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase();
  res.setHeader("Content-Type",ext===".js"?"text/javascript; charset=utf-8":ext===".webmanifest"?"application/manifest+json":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on("pageerror",error=>console.error("PAGE ERROR",error));
  await page.addInitScript(()=>{
    const definitions=new Map();
    const mockProj4=(from,to,coordinate)=>from==="EPSG:4326"?[coordinate[0]*1000,coordinate[1]*1000]:[coordinate[0]/1000,coordinate[1]/1000];
    mockProj4.defs=(key,value)=>{if(value!==undefined)definitions.set(key,value);return definitions.get(key)||key;};
    window.proj4=mockProj4;
    Object.defineProperty(navigator,"geolocation",{configurable:true,value:{
      watchPosition(success){setTimeout(()=>success({coords:{latitude:34.0703,longitude:134.5548,accuracy:4}}),20);return 1;},
      clearWatch(){},
      getCurrentPosition(success){setTimeout(()=>success({coords:{latitude:34.0703,longitude:134.5548,accuracy:4}}),0);}
    }});
    class MockDeviceOrientationEvent extends Event{}
    Object.defineProperty(window,"DeviceOrientationEvent",{configurable:true,value:MockDeviceOrientationEvent});
    setInterval(()=>{
      const event=new Event("deviceorientationabsolute");
      Object.defineProperties(event,{alpha:{value:350},absolute:{value:true}});
      window.dispatchEvent(event);
    },25);
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:15000});
  await page.waitForFunction(()=>typeof window.eval("startCompassFollow")==="function");
  await page.evaluate(()=>window.eval(`(()=>{
    data.lines=[[0,0,1000,1000,1,1,1]];
    data.source_name="compass-test.sfc";
    document.getElementById("startupModal").style.display="none";
    updateDrawingDependentUi();
  })()`));
  const defaultState=await page.evaluate(()=>window.eval(`({enabled:compassFollowEnabled,pending:!!compassFollowStartPromise,active:compassFab.classList.contains("following"),pressed:compassFab.getAttribute("aria-pressed"),gpsEnabled})`));
  if(defaultState.enabled||defaultState.pending||defaultState.active||defaultState.pressed!=="false"||defaultState.gpsEnabled)throw new Error(`Compass rotation was not OFF initially: ${JSON.stringify(defaultState)}`);

  await page.locator("#compassFab").click();
  await page.waitForFunction(()=>window.eval("compassFollowEnabled"),null,{timeout:5000});
  const manualStartState=await page.evaluate(()=>window.eval(`({
    enabled:compassFollowEnabled,
    active:compassFab.classList.contains("following"),
    pressed:compassFab.getAttribute("aria-pressed"),
    borderColor:getComputedStyle(compassFab.querySelector(".compassFace")).borderTopColor,
    gpsEnabled
  })`));
  if(!manualStartState.enabled||!manualStartState.active||manualStartState.pressed!=="true"||manualStartState.borderColor!=="rgb(22, 119, 255)"||manualStartState.gpsEnabled)throw new Error(`Compass button did not start GPS-independent rotation with a blue active state: ${JSON.stringify(manualStartState)}`);

  const relativeHeading=await page.evaluate(()=>window.eval(`headingFromOrientationEvent({alpha:315,absolute:false,type:"deviceorientation"})`));
  if(Math.abs(relativeHeading-45)>0.001)throw new Error(`Android/WebView relative alpha was ignored: ${relativeHeading}`);

  await page.locator("#compassFab").click();
  const toggledOff=await page.evaluate(()=>window.eval(`({enabled:compassFollowEnabled,pending:!!compassFollowStartPromise,active:compassFab.classList.contains("following"),pressed:compassFab.getAttribute("aria-pressed")})`));
  if(toggledOff.enabled||toggledOff.pending||toggledOff.active||toggledOff.pressed!=="false")throw new Error(`Compass button did not stop rotation directly: ${JSON.stringify(toggledOff)}`);
  await page.locator("#compassFab").click();
  await page.waitForFunction(()=>window.eval("compassFollowEnabled"),null,{timeout:5000});
  const toggledOn=await page.evaluate(()=>window.eval(`({enabled:compassFollowEnabled,active:compassFab.classList.contains("following"),pressed:compassFab.getAttribute("aria-pressed")})`));
  if(!toggledOn.enabled||!toggledOn.active||toggledOn.pressed!=="true")throw new Error(`Compass button did not restart rotation directly: ${JSON.stringify(toggledOn)}`);

  await page.evaluate(()=>window.eval(`(()=>{
    stopCompassFollow();
    rotationDeg=350;
    compassFollowEnabled=true;
    compassFollowTargetRotationDeg=null;
    compassFollowAnimationLastAt=0;
    largeDrawingMode=false;
    window.__compassDrawCount=0;
    draw=()=>{window.__compassDrawCount++;};
    applyCompassFollowHeading(10,true);
  })()`));
  const immediate=await page.evaluate(()=>window.eval("rotationDeg"));
  if(Math.abs(immediate-350)>0.001)throw new Error(`rotation jumped before the animation frame: ${immediate}`);
  await page.waitForTimeout(55);
  const middle=await page.evaluate(()=>window.eval(`({rotation:rotationDeg,remaining:Math.abs(normalizeAngleDeltaDeg(10-rotationDeg)),draws:window.__compassDrawCount,enabled:compassFollowEnabled,target:compassFollowTargetRotationDeg,frame:compassFollowAnimationFrame})`));
  if(!(middle.remaining>0.02&&middle.remaining<18)||middle.draws<2)throw new Error(`rotation was not smoothly interpolated: ${JSON.stringify(middle)}`);
  await page.waitForTimeout(300);
  const settled=await page.evaluate(()=>window.eval(`({rotation:rotationDeg,remaining:Math.abs(normalizeAngleDeltaDeg(10-rotationDeg)),draws:window.__compassDrawCount})`));
  if(settled.remaining>0.2)throw new Error(`rotation did not settle at the target: ${JSON.stringify(settled)}`);
  if(settled.draws<5||settled.draws>100)throw new Error(`unexpected redraw count during smoothing: ${JSON.stringify(settled)}`);

  await page.evaluate(()=>window.eval("initialLoadRotationDeg=0;rotationDeg=37;compassFollowEnabled=true;compassFollowTargetRotationDeg=90;requestCompassFollowAnimation();"));
  await page.locator("#fitBtn").click();
  const homeState=await page.evaluate(()=>window.eval(`({enabled:compassFollowEnabled,target:compassFollowTargetRotationDeg,frame:compassFollowAnimationFrame,rotation:rotationDeg,active:compassFab.classList.contains("following"),pressed:compassFab.getAttribute("aria-pressed")})`));
  if(homeState.enabled||homeState.target!==null||homeState.frame!==0||Math.abs(homeState.rotation)>0.001||homeState.active||homeState.pressed!=="false")throw new Error(`Home did not cancel automatic rotation and restore the initial orientation: ${JSON.stringify(homeState)}`);

  const iosPage=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"});
  await iosPage.addInitScript(()=>{
    const definitions=new Map();
    const mockProj4=(from,to,coordinate)=>from==="EPSG:4326"?[coordinate[0]*1000,coordinate[1]*1000]:[coordinate[0]/1000,coordinate[1]/1000];
    mockProj4.defs=(key,value)=>{if(value!==undefined)definitions.set(key,value);return definitions.get(key)||key;};
    window.proj4=mockProj4;
    window.__compassPermissionCalls=0;
    class MockDeviceOrientationEvent extends Event{}
    MockDeviceOrientationEvent.requestPermission=()=>{window.__compassPermissionCalls++;return Promise.resolve("granted");};
    Object.defineProperty(window,"DeviceOrientationEvent",{configurable:true,value:MockDeviceOrientationEvent});
    setInterval(()=>{
      const event=new Event("deviceorientation");
      Object.defineProperties(event,{alpha:{value:330},absolute:{value:false}});
      window.dispatchEvent(event);
    },20);
  });
  await iosPage.route(/^https:\/\//,route=>route.abort());
  await iosPage.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:15000});
  await iosPage.waitForFunction(()=>typeof window.eval("startCompassFollow")==="function");
  await iosPage.evaluate(()=>window.eval(`(()=>{
    data.lines=[[0,0,1000,1000,1,1,1]];
    data.source_name="ios-compass-test.sfc";
    document.getElementById("startupModal").style.display="none";
    updateDrawingDependentUi();
  })()`));
  const iosBeforeClick=await iosPage.evaluate(()=>window.eval(`({enabled:compassFollowEnabled,calls:window.__compassPermissionCalls})`));
  if(iosBeforeClick.enabled||iosBeforeClick.calls!==0)throw new Error(`iPhone requested orientation permission before the compass button: ${JSON.stringify(iosBeforeClick)}`);
  await iosPage.locator("#compassFab").click();
  await iosPage.waitForFunction(()=>window.eval("compassFollowEnabled"),null,{timeout:5000});
  const iosState=await iosPage.evaluate(()=>window.eval(`({enabled:compassFollowEnabled,calls:window.__compassPermissionCalls,active:compassFab.classList.contains("following")})`));
  if(!iosState.enabled||iosState.calls!==1||!iosState.active)throw new Error(`iPhone compass button did not request permission and start rotation: ${JSON.stringify(iosState)}`);
  await iosPage.close();

  console.log(`manual responsive compass checks passed (mid=${middle.remaining.toFixed(2)}deg, final=${settled.remaining.toFixed(3)}deg, draws=${settled.draws}, iOS permission calls=${iosState.calls})`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
