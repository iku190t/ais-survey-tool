const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const source=fs.readFileSync("index.html","utf8");
const required=[
  "const TOUCH_PAN_ACTIVATION_PX=16;",
  "setTouchPanPreview(",
  "finishTouchPanPreview(true);",
  "const text=findEditableTextAtScreen(pending.screenX,pending.screenY);",
  "textLayerModalIsOpen()",
  "canvas.addEventListener(\"pointerdown\"",
  "e.preventDefault();\n    startTextLongPress",
  "},540);",
];
for(const token of required)if(!source.includes(token))throw new Error(`missing mobile touch implementation: ${token}`);

const root=__dirname;
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
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.addInitScript(()=>{
    const mock=(_from,_to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=key=>key;
    window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("startTextLongPress")==="function",null,{timeout:10000});
  const result=await page.evaluate(()=>window.eval(`(async()=>{
    data.lines=[[0,0,10,10,1,1,1]];
    measureMode=false;profileMode=false;profileLineDrag=null;terrainCadSelectionMode=false;inkEnabled=false;
    window.__mobileLongPress=null;
    openCoordinateInspectModal=(x,y)=>{window.__mobileLongPress={x,y};};
    const started=startTextLongPress(120,180,"touch");
    const timerStarted=!!textLongPressTimer;
    await new Promise(resolve=>setTimeout(resolve,590));
    const longPress=window.__mobileLongPress;

    view.tx=12;view.ty=34;
    setTouchPanPreview(47,29);
    const preview={tx:view.tx,ty:view.ty,transform:canvas.style.transform,active:touchPanPreviewActive};
    finishTouchPanPreview(true);
    const committed={tx:view.tx,ty:view.ty,transform:canvas.style.transform,active:touchPanPreviewActive};
    return {started,timerStarted,longPress,preview,committed};
  })()`));
  if(!result.started||!result.timerStarted||!result.longPress)throw new Error(`mobile long press did not open coordinate inspect: ${JSON.stringify(result)}`);
  if(result.preview.tx!==12||result.preview.ty!==34||!result.preview.active||!result.preview.transform.includes("47px"))throw new Error(`touch pan preview is not lightweight: ${JSON.stringify(result.preview)}`);
  if(result.committed.tx!==59||result.committed.ty!==63||result.committed.active||result.committed.transform!=="")throw new Error(`touch pan preview did not commit correctly: ${JSON.stringify(result.committed)}`);

  const cdp=await page.context().newCDPSession(page);
  await page.evaluate(()=>window.eval(`(()=>{
    clearTextLongPressTimer();textLongPressTriggered=false;textLongPressPointerId=null;
    touchPanCandidate=null;touchPanMoved=false;lastOneFingerTap=null;
    document.getElementById("startupModal").style.display="none";
    window.__mobileLongPress=null;
  })()`));
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:48,y:690,id:1,radiusX:3,radiusY:3,force:1}]});
  await page.waitForTimeout(590);
  const actualLongPress=await page.evaluate(()=>window.__mobileLongPress);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  if(!actualLongPress)throw new Error("actual canvas touch did not trigger mobile long press");

  await page.evaluate(()=>window.eval(`(()=>{
    clearTextLongPressTimer();textLongPressTriggered=false;textLongPressPointerId=null;
    touchPanCandidate=null;touchPanMoved=false;lastOneFingerTap=null;
    document.getElementById("textLayerModal").style.display="flex";
    window.__continuousTextSelection=null;
    findEditableTextAtScreen=()=>({_sxfFeatureId:901,layer:1,x:0,y:0,text:"次の文字"});
    openTextLayerModal=text=>{window.__continuousTextSelection=text;selectedTextForLayerChange=text;};
  })()`));
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:48,y:690,id:2,radiusX:3,radiusY:3,force:1}]});
  await page.waitForTimeout(60);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await page.waitForTimeout(80);
  const continuousSelection=await page.evaluate(()=>window.__continuousTextSelection);
  if(!continuousSelection||continuousSelection._sxfFeatureId!==901)throw new Error("text layer popup did not allow one-tap selection of another CAD text");
  console.log("mobile long press and lightweight pan checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
