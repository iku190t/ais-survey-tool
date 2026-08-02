const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="registryMapAppendBtn"',
  'function registryDrawingTargetBounds(zone)',
  'function registryMergeMapStates(base,incoming,targetBounds,resourceUrl="")',
  'fetch(resource.url,{cache:"force-cache"})',
  'if(!firstInterior&&!secondInterior)continue',
  'desktopInkPencilCursor',
  'event.clipboardData.setData("text/plain",plainText)'
])if(!source.includes(token))throw new Error(`missing implementation: ${token}`);

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
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on("pageerror",error=>errors.push(String(error)));
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});

  const result=await page.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    const parcel=(lot,minx,miny,maxx,maxy)=>({
      properties:{地番:lot},metadata:{lotNumber:lot},bbox:{minx,miny,maxx,maxy},
      centroid:{x:(minx+maxx)/2,y:(miny+maxy)/2},rings:[[{x:minx,y:miny},{x:maxx,y:miny},{x:maxx,y:maxy}]],points:[]
    });
    const base=registryEmptyState();
    base.loaded=true;base.zone=4;base.coordinateMode="緯度経度";
    base.parcels=[parcel("1",0,0,100,100)];
    base.points=[{x:0,y:0}];base.looseLines=[{points:[{x:0,y:0},{x:100,y:0}]}];
    const incoming=registryEmptyState();
    incoming.loaded=true;incoming.zone=4;incoming.coordinateMode="緯度経度";
    incoming.parcels=[parcel("1",0,0,100,100),parcel("2",100,0,200,100)];
    incoming.points=[{x:0,y:0},{x:200,y:0}];
    incoming.looseLines=[{points:[{x:0,y:0},{x:100,y:0}]},{points:[{x:100,y:0},{x:200,y:0}]}];
    const acquired={minLon:134,minLat:34,maxLon:134.01,maxLat:34.01,center:{lon:134.005,lat:34.005}};
    const merged=registryMergeMapStates(base,incoming,acquired,"https://example.test/a.zip");

    data.lines=[];data.polys=[];data.splines=[];data._lineRenderRuns=[];data._polyRenderRuns=[];data._splineRenderRuns=[];
    layerVisibility={"1":true};view.scale=10;view.tx=400;view.ty=300;rotationDeg=0;
    const hitFor=lines=>{
      data.lines=lines;data._lineRenderRuns=[];
      const screen=worldToScreen(0,0);
      return findNearestVisibleIntersection(screen[0],screen[1],24);
    };
    const plus=hitFor([[-10,0,10,0,1],[0,-10,0,10,1]]);
    const tee=hitFor([[-10,0,10,0,1],[0,0,0,10,1]]);
    const corner=hitFor([[-10,0,0,0,1],[0,0,0,10,1]]);

    inkEnabled=true;inkEraser=false;inkTool="line";updateInkUI();
    const pencilOn=document.body.classList.contains("desktopInkPencilActive")&&canvas.classList.contains("desktopInkPencilCursor");
    inkEraser=true;updateInkUI();
    const pencilOff=!document.body.classList.contains("desktopInkPencilActive")&&!canvas.classList.contains("desktopInkPencilCursor");

    registryMapState=merged;updateRegistryMapUi();
    return {
      counts:[merged.parcels.length,merged.looseLines.length,merged.points.length],
      covered:registryTargetAlreadyAcquired({minLon:134.001,minLat:34.001,maxLon:134.009,maxLat:34.009},merged),
      outside:registryTargetAlreadyAcquired({minLon:135,minLat:35,maxLon:135.01,maxLat:35.01},merged),
      appendEnabled:!document.getElementById("registryMapAppendBtn").disabled,
      intersections:{plus:!!plus,tee:!!tee,corner:!!corner},
      pencilOn,pencilOff,
      selectable:getComputedStyle(document.getElementById("registryMapStatus")).userSelect
    };
  });
  if(JSON.stringify(result.counts)!==JSON.stringify([2,2,2]))throw new Error(`registry merge failed: ${JSON.stringify(result)}`);
  if(!result.covered||result.outside||!result.appendEnabled)throw new Error(`registry coverage/UI failed: ${JSON.stringify(result)}`);
  if(!result.intersections.plus||!result.intersections.tee||result.intersections.corner)throw new Error(`intersection modes failed: ${JSON.stringify(result.intersections)}`);
  if(!result.pencilOn||!result.pencilOff)throw new Error(`pencil cursor failed: ${JSON.stringify(result)}`);
  if(result.selectable!=="text")throw new Error(`panel text is not selectable: ${result.selectable}`);
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("Registry append, T-intersection, pencil cursor and selectable text validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
