const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="textFollowBtn"',
  'id="layerFollowHint"',
  'function setTextFollowSelectMode(active)',
  'function getTextFollowScreenAnchor(text)',
  'function isTextRenderVisible(text,visibleBounds)',
  'rotationRad:follow?0:',
  'textFollowLayers: [...textFollowLayers]'
])if(!source.includes(token))throw new Error(`missing text-follow implementation: ${token}`);
if(source.includes('id="textBtn"'))throw new Error("legacy global text ON/OFF button still exists");

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
    mock.defs=key=>key;window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("getTextRenderLayout")==="function",null,{timeout:10000});

  const initial=await page.evaluate(()=>window.eval(`(()=>{
    document.getElementById("startupModal").style.display="none";
    const polygon=[[0,0],[100,0],[100,100],[0,100],[0,0]];
    const text={x:50,y:50,h:5,w:14,sp:0,angle:37,align1:5,align2:1,text:"922-1",layer:2,color:2,font_name:"ＭＳ ゴシック",_sxfFeatureId:10};
    data=prepareRenderMetadata({lines:[],polys:[[polygon,1,1,.13,1]],splines:[],texts:[text],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{1:"境界",2:"地番"}},1000);
    loadedSfcText="test";currentLoadedKind="sfc";showText=true;layerVisibility={1:true,2:true};
    textFollowLayers=new Set();textFollowSelectMode=false;rotationDeg=30;view={scale:1,tx:100,ty:300};
    renderLayerList();
    const layout=getTextRenderLayout(text);
    return {rotation:rotationDeg,view:{...view},rotationRad:layout.rotationRad,follow:[...textFollowLayers]};
  })()`));
  if(initial.follow.length||Math.abs(initial.rotationRad)>=Math.PI*2)throw new Error(`invalid initial text-follow state: ${JSON.stringify(initial)}`);

  await page.evaluate(()=>window.eval(`layerPanel.style.display="flex";setTextFollowSelectMode(true)`));
  const mode=await page.evaluate(()=>(
    {label:document.getElementById("textFollowBtn").textContent,pressed:document.getElementById("textFollowBtn").getAttribute("aria-pressed"),hint:getComputedStyle(document.getElementById("layerFollowHint")).display}
  ));
  if(mode.label!=="完了"||mode.pressed!=="true"||mode.hint==="none")throw new Error(`selection mode UI failed: ${JSON.stringify(mode)}`);
  await page.locator(".layerItem",{hasText:"地番"}).locator(".layerItemName").click();

  const followed=await page.evaluate(()=>window.eval(`(()=>{
    const text=data.texts[0];
    const before={rotation:rotationDeg,view:{...view}};
    const horizontal=getTextRenderLayout(text);
    view={scale:5,tx:-400,ty:400};rotationDeg=0;
    const original=worldToScreen(text.x,text.y);
    const moved=getTextRenderLayout(text);
    draw();
    const after={rotation:rotationDeg,view:{...view}};
    return {selected:[...textFollowLayers],horizontalRotation:horizontal.rotationRad,original,moved:[moved.sx,moved.sy],before,after,recovery:buildRecoveryPayload().textFollowLayers};
  })()`));
  if(JSON.stringify(followed.selected)!==JSON.stringify(["2"]))throw new Error(`layer multi-select failed: ${JSON.stringify(followed)}`);
  if(Math.abs(followed.horizontalRotation)>1e-9)throw new Error(`followed text is not screen-horizontal: ${followed.horizontalRotation}`);
  if(!(followed.original[0]<0&&followed.moved[0]>=18&&followed.moved[0]<=1182&&followed.moved[1]>=18&&followed.moved[1]<=802)){
    throw new Error(`visible polygon label did not follow viewport: ${JSON.stringify(followed)}`);
  }
  if(followed.after.rotation!==0||followed.after.view.scale!==5||followed.after.view.tx!==-400||followed.after.view.ty!==400){
    throw new Error(`text-follow changed pan/rotation state: ${JSON.stringify(followed.after)}`);
  }
  if(JSON.stringify(followed.recovery)!==JSON.stringify(["2"]))throw new Error(`text-follow recovery payload missing: ${JSON.stringify(followed.recovery)}`);

  await page.evaluate(()=>window.eval(`toggleTextFollowLayer(2);setTextFollowSelectMode(false)`));
  const restored=await page.evaluate(()=>window.eval(`(()=>{const layout=getTextRenderLayout(data.texts[0]);return {selected:[...textFollowLayers],rotationRad:layout.rotationRad,anchor:[layout.sx,layout.sy],original:worldToScreen(data.texts[0].x,data.texts[0].y),button:document.getElementById("textFollowBtn").textContent};})()`));
  if(restored.selected.length||restored.button!=="文字追従")throw new Error(`text-follow did not return to normal mode: ${JSON.stringify(restored)}`);
  if(Math.abs(restored.rotationRad-(-37*Math.PI/180))>1e-9||Math.hypot(restored.anchor[0]-restored.original[0],restored.anchor[1]-restored.original[1])>1e-9){
    throw new Error(`normal text rendering was not restored: ${JSON.stringify(restored)}`);
  }
  await page.setViewportSize({width:390,height:844});
  const mobileUi=await page.evaluate(()=>window.eval(`(()=>{
    layerPanel.style.display="flex";setTextFollowSelectMode(true);
    const panel=layerPanel.getBoundingClientRect(),button=document.getElementById("textFollowBtn").getBoundingClientRect();
    const row=[...document.querySelectorAll(".layerItem")].find(item=>item.textContent.includes("地番"));
    const check=row&&row.querySelector(".layerTextFollowCheck")?.getBoundingClientRect();
    return {panel:{left:panel.left,right:panel.right,width:panel.width},button:{left:button.left,right:button.right,width:button.width},check:check?{left:check.left,right:check.right,width:check.width}:null,hint:getComputedStyle(document.getElementById("layerFollowHint")).display};
  })()`));
  if(mobileUi.panel.left<-.5||mobileUi.panel.right>390.5||!mobileUi.check||mobileUi.button.right>390.5||mobileUi.check.right>390.5||mobileUi.hint==="none"){
    throw new Error(`mobile text-follow layer UI overflowed: ${JSON.stringify(mobileUi)}`);
  }
  if(pageErrors.length)throw new Error(`page errors: ${pageErrors.join(" | ")}`);
  console.log("OK: PC/mobile layer multi-select text follow, horizontal display, viewport relocation, normal-mode restoration, and pan/rotation isolation");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
