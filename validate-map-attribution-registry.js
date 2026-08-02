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
  const result=await page.evaluate(()=>window.eval(`(()=>{
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
    let wideRejected=false,smallAccepted=false;
    registryPlaneTargetBoundsLight=target=>target.__plane;
    try{registryAssertAutoTargetSize({__plane:{minX:0,minY:0,maxX:2500,maxY:1000}},4);}catch(error){wideRejected=String(error.message).includes("表示範囲が広すぎます");}
    try{registryAssertAutoTargetSize({__plane:{minX:0,minY:0,maxX:500,maxY:400}},4);smallAccepted=true;}catch(_error){}
    registryPlaneTargetBoundsLight=original;
    return {
      title:document.title,
      panelShown:mapAttributionPanel.classList.contains("show"),
      panelWithinViewport:panelRect.left>=0&&panelRect.right<=innerWidth,
      legendAbovePanel:legendRect.bottom<=panelRect.top+1,
      linkPositions,
      wideRejected,
      smallAccepted,
    };
  })()`));
  if(result.title!=="Ez Viewer | Ezアイズ Survey Tools")throw new Error(`名称が不正です: ${result.title}`);
  if(!result.panelShown||!result.panelWithinViewport||!result.legendAbovePanel||result.linkPositions.some(value=>value!=="static"))throw new Error(`出典表示が整理されていません: ${JSON.stringify(result)}`);
  if(!result.wideRejected||!result.smallAccepted)throw new Error(`取得前範囲判定が不正です: ${JSON.stringify(result)}`);
  console.log("map attribution, app name and registry preflight checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
