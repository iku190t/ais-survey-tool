const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
function makeSima(parcelCount=800,pointsPerParcel=8){
  const lines=["G00,03,性能試験,","A00,"];
  let pointId=1;
  for(let parcel=0;parcel<parcelCount;parcel++){
    const column=parcel%40,row=Math.floor(parcel/40),ids=[];
    for(let point=0;point<pointsPerParcel;point++){
      const angle=Math.PI*2*point/pointsPerParcel;
      const id=String(pointId++),x=-71000+row*16+Math.sin(angle)*6,y=32000+column*16+Math.cos(angle)*6;
      lines.push(`A01,${id},P${id},${x.toFixed(3)},${y.toFixed(3)},,`);ids.push(id);
    }
    lines.push(`D00,${parcel+1},${parcel+1},1,`);
    for(const id of ids)lines.push(`B01,${id},P${id},`);
    lines.push("D99,");
  }
  return lines.join("\r\n");
}

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
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:15000});
  const result=await page.evaluate(async sample=>{
    document.getElementById("startupModal").style.display="none";
    const started=performance.now();
    await loadSimaFile(new File([sample],"performance.sim",{type:"application/octet-stream"}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const loadMs=performance.now()-started;
    const measureOriginal=CanvasRenderingContext2D.prototype.measureText;
    let measureCount=0;
    CanvasRenderingContext2D.prototype.measureText=function(){measureCount++;return measureOriginal.apply(this,arguments);};
    const fullStarted=performance.now();draw();const fullDrawMs=performance.now()-fullStarted,fullMeasureCount=measureCount;
    simaLayerVisibility.parcelLabel=false;simaLayerVisibility.pointLabel=false;
    const geometryStarted=performance.now();draw();const geometryDrawMs=performance.now()-geometryStarted;
    simaLayerVisibility.parcelLabel=true;
    const parcelLabelStarted=performance.now();draw();const parcelLabelDrawMs=performance.now()-parcelLabelStarted;
    simaLayerVisibility.pointLabel=true;
    const bounds=getSimaBoundsWorld(),w=canvas.clientWidth||1,h=canvas.clientHeight||1;
    view.scale*=5;view.tx=w/2-bounds.cx*view.scale;view.ty=h/2+bounds.cy*view.scale;measureCount=0;
    const zoomStarted=performance.now();draw();const zoomDrawMs=performance.now()-zoomStarted,zoomMeasureCount=measureCount;
    CanvasRenderingContext2D.prototype.measureText=measureOriginal;
    const visible=getVisibleWorldBounds(30),query=querySimaSpatialIndex(simaMapState,visible);
    return {loadMs,fullDrawMs,geometryDrawMs,parcelLabelDrawMs,zoomDrawMs,fullMeasureCount,zoomMeasureCount,points:simaMapState.points.length,parcels:simaMapState.parcels.length,visiblePoints:query.points.length,visibleParcels:query.parcels.length};
  },makeSima());
  if(result.points!==6400||result.parcels!==800)throw new Error(`synthetic SIMA counts failed: ${JSON.stringify(result)}`);
  if(result.fullMeasureCount>result.parcels+500)throw new Error(`dense point labels were not reduced: ${JSON.stringify(result)}`);
  if(result.visiblePoints>=result.points||result.visibleParcels>=result.parcels)throw new Error(`spatial index did not reduce the zoomed drawing set: ${JSON.stringify(result)}`);
  if(result.loadMs>5000||result.fullDrawMs>2000||result.zoomDrawMs>1000)throw new Error(`SIMA performance safety limit exceeded: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
