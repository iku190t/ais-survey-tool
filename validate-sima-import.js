const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");
const sima=require("./sima-import.js");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="simaMapOpenBtn"',
  'id="simaMapPanel"',
  'data-sima-layer="parcelLabel"',
  'data-sima-layer="pointLabel"',
  'function loadSimaFile(file)',
  'function drawSimaOverlay()',
  'drawSimaHorizontalLabel(parcel.name',
  'window.EzSimaImport?.visibleLabelPoint',
  'drawSimaOverlay();',
  'layerColorPaletteTarget.type==="sima"'
])if(!source.includes(token))throw new Error(`missing SIMA implementation: ${token}`);

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
  "D99,"
].join("\r\n");
const parsed=sima.parse(sample);
if(parsed.points.length!==3||parsed.parcels.length!==1)throw new Error(`parse count failed: ${JSON.stringify(parsed)}`);
if(parsed.points[2].name!=="P,3"||parsed.parcels[0].name!=="135-1"||parsed.parcels[0].points.length!==3)throw new Error("quoted fields or parcel references failed");
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
    await loadSimaFile(new File([sampleText],"field.sim",{type:"text/plain"}));
    const loaded={points:simaMapState.points.length,parcels:simaMapState.parcels.length,enabled:simaDisplayEnabled,source:simaMapState.sourceName};
    const w=canvas.clientWidth,h=canvas.clientHeight;
    rotationDeg=37;view.scale=.001;view.tx=w/2;view.ty=h/2;
    const ring=[{x:-500000,y:-500000},{x:500000,y:-500000},{x:500000,y:500000},{x:-500000,y:500000}];
    simaMapState={loaded:true,sourceName:"test.sim",warnings:[],points:ring.map((p,index)=>({...p,id:String(index+1),name:`P${index+1}`})),parcels:[{id:"1",name:"135-1",type:"1",points:ring,bbox:registryRingBounds(ring)}]};
    simaDisplayEnabled=true;
    const original=CanvasRenderingContext2D.prototype.fillText;
    const records=[];
    CanvasRenderingContext2D.prototype.fillText=function(text,x,y){
      if(text==="135-1"||/^P\d$/.test(text)){const matrix=this.getTransform();records.push({text,x,y,a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d});}
      return original.apply(this,arguments);
    };
    draw();
    CanvasRenderingContext2D.prototype.fillText=original;
    return {loaded,records,width:w,height:h,buttonActive:document.getElementById("simaMapOpenBtn").classList.contains("active"),parcelSize:simaParcelLabelSize,pointSize:simaPointLabelSize};
  },sample);
  const parcel=result.records.find(record=>record.text==="135-1");
  if(!parcel)throw new Error(`parcel label was not drawn: ${JSON.stringify(result)}`);
  if(Math.abs(parcel.b)>1e-8||Math.abs(parcel.c)>1e-8)throw new Error(`SIMA label inherited drawing rotation: ${JSON.stringify(parcel)}`);
  if(parcel.x<0||parcel.x>result.width||parcel.y<0||parcel.y>result.height)throw new Error(`parcel label did not follow visible area: ${JSON.stringify(parcel)}`);
  if(!result.buttonActive||result.parcelSize!==14||result.pointSize!==11)throw new Error(`SIMA UI defaults failed: ${JSON.stringify(result)}`);
  if(result.loaded.points!==3||result.loaded.parcels!==1||!result.loaded.enabled||result.loaded.source!=="field.sim")throw new Error(`browser file import failed: ${JSON.stringify(result.loaded)}`);
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("SIMA parser, panel, visible-area label placement, and screen-horizontal rotation validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
