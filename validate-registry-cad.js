const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="registryMapCadBtn"',
  'function buildRegistryCadStrokes(polygon)',
  'function finishRegistryCadSelection()',
  'registryMapDisplayEnabled=false',
  'name:"法務局_筆ポリゴン"',
  'name:"法務局_筆界線"',
  'name:"法務局_筆界点"',
  'name:"法務局_地番文字"',
  'polygonSelectionPurpose==="registry"'
])if(!source.includes(token))throw new Error(`法務局地図CAD化の実装が不足しています: ${token}`);

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
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const pageErrors=[];page.on("pageerror",error=>pageErrors.push(String(error)));
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  const result=await page.evaluate(async()=>{
    document.getElementById("startupModal").style.display="none";
    const sample=await (await fetch("sample.sfc")).text();
    loadedSfcText=sample;
    data.lines=[[0,0,100,100,1,1,1]];
    data._drawingToPaperScale=1;
    inkStrokes=[];inkOperationHistory=[];inkRedoHistory=[];
    registryMapState=registryEmptyState();
    registryMapState.loaded=true;
    registryMapState.parcels=[{
      id:"parcel-1",
      rings:[[{x:10,y:10},{x:90,y:10},{x:90,y:90},{x:10,y:90},{x:10,y:10}]],
      centroid:{x:50,y:50},
      metadata:{lotNumber:"123-4"}
    }];
    registryMapState.looseLines=[{points:[{x:0,y:50},{x:100,y:50}]}];
    registryMapState.points=[{x:20,y:20}];
    registryMapDisplayEnabled=true;
    registryLayerVisibility={parcel:true,boundary:true,point:true,label:true};
    const polygon=[{x:5,y:5},{x:95,y:5},{x:95,y:95},{x:5,y:95}];
    const preview=buildRegistryCadStrokes(polygon);
    const kinds=preview.reduce((out,stroke)=>{out[stroke.registryMapKind]=(out[stroke.registryMapKind]||0)+1;return out;},{});
    terrainCadPolygon=polygon;
    polygonSelectionPurpose="registry";
    await finishRegistryCadSelection();
    const exported=buildInkPolylineFeatureText(sample);
    const meta=parseMemoMetaPayload(buildMemoMetaComment());
    return {
      kinds,
      loaded:registryMapState.loaded,
      parcelCount:registryMapState.parcels.length,
      display:registryMapDisplayEnabled,
      strokeCount:inkStrokes.length,
      featureText:exported.lineText,
      layerText:exported.layerText,
      metaKinds:(meta?.strokes||[]).map(stroke=>stroke.registryMapKind).filter(Boolean),
      panel:getComputedStyle(document.getElementById("registryMapPanel")).display
    };
  });
  for(const kind of ["parcel","boundary","point","label"]){
    if(!result.kinds[kind])throw new Error(`CAD化結果に${kind}がありません: ${JSON.stringify(result.kinds)}`);
    if(!result.metaKinds.includes(kind))throw new Error(`保存メタデータに${kind}がありません: ${JSON.stringify(result.metaKinds)}`);
  }
  if(!result.loaded||result.parcelCount!==1||result.display)throw new Error(`CAD化後の取得データ保持・背景OFFが不正です: ${JSON.stringify(result)}`);
  if(result.strokeCount<6||!result.featureText.includes("polyline_feature")||!result.featureText.includes("text_string_feature"))throw new Error("法務局図形・地番文字をSFCへ書き出せません");
  if(!result.panel||result.panel==="none")throw new Error("CAD化後に法務局地図画面へ戻りません");
  if(pageErrors.length)throw new Error(`ページエラー: ${pageErrors.join(" | ")}`);
  console.log("Registry map persistence, range CAD layers and SFC export validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();server.close();
});
