const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  "const COMPASS_FOLLOW_DEFAULT_ENABLED = true",
  "function stepCompassFollowAnimation(now)",
  "const COMPASS_FOLLOW_FRAME_MS = 1000/60",
  "requestAnimationFrame(stepCompassFollowAnimation)",
  "if(largeDrawingMode)scheduleTouchTransformDraw()",
  "startDefaultCompassFollow(false);",
  "!hasLoadedDrawing()",
  "stopCompassFollow();\n  setCompassMenuOpen(false);"
])if(!source.includes(token))throw new Error(`missing smooth compass-follow implementation: ${token}`);

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
    MockDeviceOrientationEvent.requestPermission=async()=>"granted";
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
    startDefaultCompassFollow(true);
  })()`));
  await page.waitForFunction(()=>window.eval("compassFollowEnabled"),null,{timeout:5000});
  const defaultState=await page.evaluate(()=>window.eval(`({enabled:compassFollowEnabled,active:compassFieldBtn.classList.contains("active"),defaultEnabled:COMPASS_FOLLOW_DEFAULT_ENABLED,gpsEnabled})`));
  if(!defaultState.enabled||!defaultState.active||!defaultState.defaultEnabled||defaultState.gpsEnabled)throw new Error(`GPS-independent automatic rotation did not start by default: ${JSON.stringify(defaultState)}`);

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
  await page.waitForTimeout(160);
  const middle=await page.evaluate(()=>window.eval(`({rotation:rotationDeg,remaining:Math.abs(normalizeAngleDeltaDeg(10-rotationDeg)),draws:window.__compassDrawCount,enabled:compassFollowEnabled,target:compassFollowTargetRotationDeg,frame:compassFollowAnimationFrame})`));
  if(!(middle.remaining>0.1&&middle.remaining<20)||middle.draws<2)throw new Error(`rotation was not smoothly interpolated: ${JSON.stringify(middle)}`);
  await page.waitForTimeout(650);
  const settled=await page.evaluate(()=>window.eval(`({rotation:rotationDeg,remaining:Math.abs(normalizeAngleDeltaDeg(10-rotationDeg)),draws:window.__compassDrawCount})`));
  if(settled.remaining>0.2)throw new Error(`rotation did not settle at the target: ${JSON.stringify(settled)}`);
  if(settled.draws<5||settled.draws>100)throw new Error(`unexpected redraw count during smoothing: ${JSON.stringify(settled)}`);

  await page.evaluate(()=>window.eval("compassFollowEnabled=true;compassFollowTargetRotationDeg=90;requestCompassFollowAnimation();"));
  await page.locator("#fitBtn").click();
  const homeState=await page.evaluate(()=>window.eval(`({enabled:compassFollowEnabled,target:compassFollowTargetRotationDeg,frame:compassFollowAnimationFrame,armed:compassFollowDefaultArmed})`));
  if(homeState.enabled||homeState.target!==null||homeState.frame!==0||homeState.armed)throw new Error(`Home did not cancel automatic rotation: ${JSON.stringify(homeState)}`);

  console.log(`smooth compass follow checks passed (mid=${middle.remaining.toFixed(2)}deg, final=${settled.remaining.toFixed(3)}deg, draws=${settled.draws})`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
