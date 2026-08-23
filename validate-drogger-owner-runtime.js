const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase();
  res.setHeader("Content-Type",ext===".js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:15000});
  await page.waitForFunction(()=>typeof window.DroggerOwnerMode==="object");
  await page.evaluate(()=>window.eval(`(()=>{
    data.lines=[[0,0,100000,100000,1,1,1]];
    data.layerNames={"1":"基準"};data.source_name="drogger-test.sfc";
    document.getElementById("startupModal").style.display="none";
    gpsEnabled=true;gpsDetailOpen=true;
    gpsPosition={lat:34.1,lon:134.5,zone:4,x:100.123,y:200.456,sfcX:200.456,sfcY:100.123,altitude:52.345,altitudeAccuracy:.025,accuracy:.015,timestamp:Date.now(),demAltitude:50,demSource:"DEM1A",demChecked:true};
    updateGpsUi();
  })()`));
  await page.locator("#gpsTitle").dispatchEvent("pointerdown",{pointerId:5,pointerType:"touch",clientX:80,clientY:80,button:0});
  await page.waitForTimeout(120);
  await page.locator("#gpsTitle").dispatchEvent("pointerup",{pointerId:5,pointerType:"touch",clientX:80,clientY:80,button:0});
  if(await page.evaluate(()=>window.eval("droggerOwnerModeActive")))throw new Error("short press opened hidden mode");
  await page.locator("#gpsTitle").dispatchEvent("pointerdown",{pointerId:6,pointerType:"touch",clientX:80,clientY:80,button:0});
  await page.locator("#gpsTitle").dispatchEvent("pointermove",{pointerId:6,pointerType:"touch",clientX:100,clientY:80,button:0});
  if(await page.evaluate(()=>window.eval("droggerOwnerLongPressState!==null")))throw new Error("moved long press was not cancelled");
  await page.locator("#gpsTitle").dispatchEvent("pointerdown",{pointerId:7,pointerType:"touch",clientX:80,clientY:80,button:0});
  await page.waitForTimeout(5100);
  await page.locator("#gpsTitle").dispatchEvent("pointerup",{pointerId:7,pointerType:"touch",clientX:80,clientY:80,button:0});
  const opened=await page.evaluate(()=>window.eval(`({active:droggerOwnerModeActive,display:getComputedStyle(document.getElementById("droggerOwnerControls")).display,text:document.getElementById("gpsText").textContent})`));
  if(!opened.active||opened.display==="none"||!opened.text.includes("Drogger高精度登録"))throw new Error(`hidden mode did not open: ${JSON.stringify(opened)}`);
  await page.locator("#droggerPointName").fill("K-1");
  await page.locator("#droggerAntennaHeight").fill("1.5");
  await page.locator("#droggerNameTextSize").fill("3");
  await page.locator("#droggerElevationTextSize").fill("2");
  await page.locator("#droggerRegisterBtn").click();
  const registered=await page.evaluate(()=>window.eval(`(()=>{
    const records=getDroggerCoordinateRecords();
    const meta=parseMemoMetaPayload(buildMemoMetaComment());
    return {count:inkStrokes.length,layers:inkStrokes.map(s=>s.droggerLayerId),records,meta:meta.strokes.map(s=>({layer:s.droggerLayerId,id:s.droggerPointId,record:s.droggerRecord?.name,text:s.photoTextLabel?.text}))};
  })()`));
  if(registered.count!==3||registered.records.length!==1||registered.records[0].name!=="K-1"||Math.abs(registered.records[0].elevation-50.845)>1e-9)throw new Error(`registration failed: ${JSON.stringify(registered)}`);
  if(new Set(registered.layers).size!==3||registered.meta.length!==3||registered.meta.some(item=>!item.id))throw new Error(`SFC metadata lost Drogger fields: ${JSON.stringify(registered.meta)}`);
  const csv=await page.evaluate(()=>window.eval("DroggerOwnerMode.buildCsv(getDroggerCoordinateRecords())"));
  if(!csv.includes("K-1")||!csv.includes("50.845"))throw new Error("runtime CSV is incomplete");
  await page.evaluate(()=>window.eval('deleteLayerByName("Drogger_点名")'));
  if(await page.evaluate(()=>window.eval("inkStrokes.length"))!==0)throw new Error("related Drogger layers were not deleted together");
  await page.evaluate(()=>window.eval("undoLastEdit()"));
  if(await page.evaluate(()=>window.eval("inkStrokes.length"))!==3)throw new Error("Drogger layer delete could not be undone");
  await page.locator("#gpsTitle").dispatchEvent("pointerdown",{pointerId:8,pointerType:"touch",clientX:80,clientY:80,button:0});
  await page.waitForTimeout(5100);
  await page.locator("#gpsTitle").dispatchEvent("pointerup",{pointerId:8,pointerType:"touch",clientX:80,clientY:80,button:0});
  if(await page.evaluate(()=>window.eval("droggerOwnerModeActive")))throw new Error("five-second hold did not close hidden mode");
  console.log("OK: Drogger 5-second hold UI, registration, metadata, grouped deletion and undo");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
