const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");
const sima=require("./sima-import.js");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="simaMapOpenBtn"',
  'id="simaToolbarBtn"',
  'id="simaFileSelectBtn"',
  'id="simaMapPanel"',
  'data-sima-layer="parcelLabel"',
  'data-sima-layer="pointLabel"',
  'function loadSimaFile(file)',
  'function drawSimaOverlay()',
  'function chooseSimaPointLabelPosition(',
  'drawSimaHorizontalLabel(parcel.name',
  'window.EzSimaImport?.visibleLabelPoint',
  'drawSimaOverlay();',
  'layerColorPaletteTarget.type==="sima"'
])if(!source.includes(token))throw new Error(`missing SIMA implementation: ${token}`);
const simaFileInputMarkup=source.match(/<input\s+id="simaFileInput"[^>]*>/)?.[0]||"";
if(!simaFileInputMarkup||!/application\/octet-stream/.test(simaFileInputMarkup)||!/\.sim/.test(simaFileInputMarkup))throw new Error("SIMA picker must mirror the SFC file-picker MIME fallback on iPhone");
if(source.indexOf('id="simaToolbarBtn"')>source.indexOf('id="measureBtn"'))throw new Error("desktop SIMA button must be between Hazard and Measure");

const sample=[
  "G00,03,テスト現場,",
  "A00,",
  "A01,1,P1,-71097.182,32180.743,1.250,",
  "A01,2,P2,-71092.916,32165.447,,",
  "A01,3,\"P,3\",-71083.530,32166.836,,",
  "A99,",
  "D00,103,135-1,1,",
  "B01,1,P1,",
  "B01,2,P2,",
  "B01,3,\"P,3\",",
  "D00,102,102,2,",
  "B01,1,P1,",
  "B01,2,P2,",
  "D99,"
].join("\r\n");
const parsed=sima.parse(sample);
if(parsed.points.length!==3||parsed.parcels.length!==2)throw new Error(`parse count failed: ${JSON.stringify(parsed)}`);
if(parsed.points[2].name!=="P,3"||parsed.parcels[0].name!=="135-1"||parsed.parcels[0].points.length!==3)throw new Error("quoted fields or parcel references failed");
if(parsed.parcels[1].name!=="102"||parsed.parcels[1].type!=="2")throw new Error("SIMA open-line classification failed");
const label=sima.visibleLabelPoint([{x:-100,y:20},{x:200,y:20},{x:200,y:180},{x:-100,y:180}],300,200,12);
if(!label||label.x<12||label.x>288||label.y<12||label.y>188)throw new Error(`visible label placement failed: ${JSON.stringify(label)}`);

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
  const errors=[];page.on("pageerror",error=>errors.push(String(error)));
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:15000});
  const result=await page.evaluate(async sampleText=>{
    document.getElementById("startupModal").style.display="none";
    document.getElementById("simaMapPanel").style.display="block";
    updateSimaMapUi();
    await loadSimaFile(new File([sampleText],"field.SIM",{type:"application/octet-stream"}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    fitToScreen();
    const simaHome={scale:view.scale,tx:view.tx,ty:view.ty};
    captureGpsSessionState();
    view={scale:.123,tx:7,ty:9};gpsEnabled=true;
    stopGps(false);
    const restoredSimaView={scale:view.scale,tx:view.tx,ty:view.ty};
    const loaded={points:simaMapState.points.length,parcels:simaMapState.parcels.length,enabled:simaDisplayEnabled,source:simaMapState.sourceName,status:document.getElementById("simaMapStatus").textContent,workspace:hasActiveWorkspace(),startup:document.getElementById("startupModal").style.display,simaHome,restoredSimaView};
    const w=canvas.clientWidth,h=canvas.clientHeight;
    rotationDeg=37;view.scale=.001;view.tx=w/2;view.ty=h/2;
    const ring=[{x:-500000,y:-500000},{x:500000,y:-500000},{x:500000,y:500000},{x:-500000,y:500000}];
    simaMapState={loaded:true,sourceName:"test.sim",warnings:[],points:ring.map((p,index)=>({...p,id:String(index+1),name:`P${index+1}`})),parcels:[{id:"1",name:"135-1",type:"1",points:ring,bbox:registryRingBounds(ring)},{id:"102",name:"102",type:"2",points:ring.slice(0,2),bbox:registryRingBounds(ring.slice(0,2))}]};
    simaDisplayEnabled=true;
    const original=CanvasRenderingContext2D.prototype.fillText;
    const records=[];
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y){
      if(text==="135-1"||text==="102"||/^P\d$/.test(text)){const matrix=this.getTransform();records.push({text,x,y,a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d});}
      return original.apply(this,arguments);
    };
    draw();
    rotationDeg=116;draw();
    CanvasRenderingContext2D.prototype.fillText=original;
    const collisionIndex=createSimaLabelCollisionIndex();
    const crossingLine={type:"segment",x1:20,y1:100,x2:370,y2:100,bounds:{minX:18,minY:98,maxX:372,maxY:102}};
    collisionIndex.add(crossingLine);
    collisionIndex.add({type:"point",x:195,y:100,radius:3,bounds:{minX:190,minY:95,maxX:200,maxY:105}});
    const pointLabelPlacement=chooseSimaPointLabelPosition({x:195,y:100},"P100",11,collisionIndex,w,h);
    const pointLabelAvoidsLine=!simaRectTouchesSegment(pointLabelPlacement.rect,crossingLine);
    return {loaded,records,width:w,height:h,pointLabelPlacement,pointLabelAvoidsLine,buttonActive:document.getElementById("simaMapOpenBtn").classList.contains("active"),parcelSize:simaParcelLabelSize,pointSize:simaPointLabelSize};
  },sample);
  const parcel=result.records.find(record=>record.text==="135-1");
  if(!parcel)throw new Error(`parcel label was not drawn: ${JSON.stringify(result)}`);
  if(Math.abs(parcel.b)>1e-8||Math.abs(parcel.c)>1e-8)throw new Error(`SIMA label inherited drawing rotation: ${JSON.stringify(parcel)}`);
  if(parcel.x<0||parcel.x>result.width||parcel.y<0||parcel.y>result.height)throw new Error(`parcel label did not follow visible area: ${JSON.stringify(parcel)}`);
  if(result.records.some(record=>record.text==="102"))throw new Error(`open-line name was incorrectly drawn as a parcel label: ${JSON.stringify(result.records)}`);
  if(result.records.some(record=>Math.abs(record.b)>1e-8||Math.abs(record.c)>1e-8))throw new Error(`SIMA labels did not stay screen-horizontal across redraws: ${JSON.stringify(result.records)}`);
  if(!result.pointLabelAvoidsLine||Math.abs(result.pointLabelPlacement.screen.y-100)<1)throw new Error(`SIMA point label was not moved away from its boundary line: ${JSON.stringify(result.pointLabelPlacement)}`);
  if(!result.buttonActive||result.parcelSize!==14||result.pointSize!==11)throw new Error(`SIMA UI defaults failed: ${JSON.stringify(result)}`);
  if(result.loaded.points!==3||result.loaded.parcels!==2||!result.loaded.enabled||result.loaded.source!=="field.SIM"||!result.loaded.workspace||result.loaded.startup!=="none"||!/画地 1件/.test(result.loaded.status))throw new Error(`browser .SIM file import failed: ${JSON.stringify(result.loaded)}`);
  for(const key of ["scale","tx","ty"])if(Math.abs(result.loaded.simaHome[key]-result.loaded.restoredSimaView[key])>1e-9)throw new Error(`GPS stop did not return to the SIMA view: ${JSON.stringify(result.loaded)}`);
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("SIMA type-2 exclusion, direct file picker, workspace fit, screen-horizontal rotation, and point-label collision avoidance validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
