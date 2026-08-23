const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const source=fs.readFileSync("index.html","utf8");
const required=[
  'content="Ez Viewer"',
  'id="viewerLabel"',
  '>Ez Viewer</div>',
  '<div class="panelTitle">Ez Viewer</div>',
  'const subject="Ez Viewer 不具合・改善案"',
  'const profileAppName=encodeSfcText("Ez Viewer")',
  'id="mapOverlayInfoStack"',
  'id="mapAttributionPanel"',
  'function updateMapAttributionLayout()',
  'function registryAssertAutoTargetSize(target,zone)',
  'function registryPlanAutoTargetChunks(target,zone)',
  'function registryPrioritizedFeatureCollectorLight(targetCount)',
  'function registryShpTargetIndexLight(content,targetBoundsList)',
  'const chunkPlan=registryPlanAutoTargetChunks(target,zone);',
  'const latPad=Math.max(.0015,(maxLat-minLat)*.12);',
  'const REGISTRY_MOBILE_FEATURE_LIMIT=12000;',
  'await reader.cancel()',
];
for(const token of required)if(!source.includes(token))throw new Error(`missing implementation: ${token}`);
for(const oldName of ["Ezビューア","SFCスマホビューアー","SFCスマホビューア","SFCビューアー","SFCビューア","SFC Smartphone Viewer"]){
  if(source.includes(oldName))throw new Error(`旧名称が残っています: ${oldName}`);
}

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
  await page.waitForFunction(()=>typeof window.eval("registryAssertAutoTargetSize")==="function",null,{timeout:10000});
  const result=await page.evaluate(()=>window.eval(`(async()=>{
    photoCredit.classList.add("show");
    registryMapCredit.style.display="block";
    hazardMapCredit.style.display="block";
    controlPointCredit.style.display="block";
    controlPointLegend.style.display="block";
    updateMapAttributionLayout();
    const panelRect=mapAttributionPanel.getBoundingClientRect();
    const legendRect=controlPointLegend.getBoundingClientRect();
    const linkPositions=[photoCredit,registryMapCredit,hazardMapCredit,controlPointCredit].map(link=>getComputedStyle(link).position);
    const original=registryPlaneTargetBoundsLight;
    const originalGeoBoundsFromPlane=registryGeoBoundsFromPlaneLight;
    let wideRejected=false,smallAccepted=false;
    registryPlaneTargetBoundsLight=target=>target.__plane;
    try{registryAssertAutoTargetSize({__plane:{minX:0,minY:0,maxX:2500,maxY:1000}},4);}catch(error){wideRejected=String(error.message).includes("表示範囲が広すぎます");}
    try{registryAssertAutoTargetSize({__plane:{minX:0,minY:0,maxX:500,maxY:400}},4);smallAccepted=true;}catch(_error){}
    registryGeoBoundsFromPlaneLight=plane=>({minLon:plane.minX,minLat:plane.minY,maxLon:plane.maxX,maxLat:plane.maxY,center:{lon:(plane.minX+plane.maxX)/2,lat:(plane.minY+plane.maxY)/2}});
    const splitPlan=registryPlanAutoTargetChunks({__plane:{minX:0,minY:0,maxX:2500,maxY:1000}},4);
    const limitedPlan=registryPlanAutoTargetChunks({__plane:{minX:0,minY:0,maxX:100000,maxY:100000}},4);
    let chunksSafe=splitPlan.targets.length>1&&!splitPlan.limited;
    for(const planeChunk of splitPlan.planeTargets){try{registryAssertAutoTargetSize({__plane:planeChunk},4);}catch(_error){chunksSafe=false;}}
    registryPlaneTargetBoundsLight=original;
    registryGeoBoundsFromPlaneLight=originalGeoBoundsFromPlane;
    const collector=registryPrioritizedFeatureCollectorLight(2);
    const feature=index=>({type:"Feature",geometry:{type:"Point",coordinates:[index,index]},properties:{index}});
    for(let index=0;index<REGISTRY_MOBILE_FEATURE_LIMIT;index++)collector.add(1,feature(index));
    collector.add(0,feature(-1));
    const prioritized=collector.result();
    const geoJson=await registryReadGeoJsonArea(new Response(JSON.stringify({type:"FeatureCollection",features:[
      {type:"Feature",geometry:{type:"Point",coordinates:[11,11]},properties:{id:"far"}},
      {type:"Feature",geometry:{type:"Point",coordinates:[1,1]},properties:{id:"center"}}
    ]})),[
      {minLon:0,minLat:0,maxLon:2,maxLat:2},
      {minLon:10,minLat:10,maxLon:12,maxLat:12}
    ]);
    const shpContent=new Uint8Array(36),shpView=new DataView(shpContent.buffer);
    shpView.setInt32(0,5,true);shpView.setFloat64(4,10.5,true);shpView.setFloat64(12,10.5,true);shpView.setFloat64(20,11.5,true);shpView.setFloat64(28,11.5,true);
    const shpTargetIndex=registryShpTargetIndexLight(shpContent,[
      {minX:0,minY:0,maxX:2,maxY:2},
      {minX:10,minY:10,maxX:12,maxY:12}
    ]);
    return {
      title:document.title,
      panelShown:mapAttributionPanel.classList.contains("show"),
      panelWithinViewport:panelRect.left>=0&&panelRect.right<=innerWidth,
      legendAbovePanel:legendRect.bottom<=panelRect.top+1,
      linkPositions,
      wideRejected,
      smallAccepted,
      splitCount:splitPlan.targets.length,
      chunksSafe,
      limitedCount:limitedPlan.targets.length,
      limitedTotal:limitedPlan.totalCount,
      limited:limitedPlan.limited,
      prioritizedCount:prioritized.length,
      prioritizedFirst:prioritized[0]?.properties?.index,
      prioritizedTruncated:!!prioritized._registryTruncated,
      completedTargets:prioritized._registryCompletedTargetIndexes,
      geoOrder:geoJson.features.map(item=>item.properties.id),
      geoCompleted:geoJson._registryCompletedTargetIndexes,
      shpTargetIndex,
    };
  })()`));
  if(result.title!=="Ez Viewer | Ezアイズ Survey Tools")throw new Error(`名称が不正です: ${result.title}`);
  if(!result.panelShown||!result.panelWithinViewport||!result.legendAbovePanel||result.linkPositions.some(value=>value!=="static"))throw new Error(`出典表示が整理されていません: ${JSON.stringify(result)}`);
  if(!result.wideRejected||!result.smallAccepted)throw new Error(`取得前範囲判定が不正です: ${JSON.stringify(result)}`);
  if(result.splitCount!==6||!result.chunksSafe||result.limitedCount!==36||result.limitedTotal<=result.limitedCount||!result.limited)throw new Error(`広域自動分割が不正です: ${JSON.stringify(result)}`);
  if(result.prioritizedCount!==12000||result.prioritizedFirst!==-1||!result.prioritizedTruncated||result.completedTargets.includes(1))throw new Error(`中央優先の端末上限処理が不正です: ${JSON.stringify(result)}`);
  if(result.geoOrder.join(",")!=="center,far"||result.geoCompleted.join(",")!=="0,1")throw new Error(`分割GeoJSON取得が不正です: ${JSON.stringify(result)}`);
  if(result.shpTargetIndex!==1)throw new Error(`分割SHP範囲判定が不正です: ${JSON.stringify(result)}`);
  console.log("map attribution, app name and registry preflight checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
