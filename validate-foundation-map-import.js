const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="foundationMapPanel"',
  'id="foundationMapAcquireBtn"',
  'id="foundationMapImportBtn"',
  'const FOUNDATION_MAP_MAX_SOURCE_LEVEL=2500',
  'FOUNDATION_MAP_SERVICE_URL="https://service.gsi.go.jp/kiban/app/map/"',
  'name:"基盤2500_道路縁"',
  'foundationMapKind: s.foundationMapKind || null',
  'function handleFoundationMapFile(file)'
])if(!source.includes(token))throw new Error(`missing foundation-map integration: ${token}`);
if(source.includes("FOUNDATION_MAP_MAX_SOURCE_LEVEL=25000"))throw new Error("25000 fallback must not be enabled");

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
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on("pageerror",error=>errors.push(String(error)));
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  const result=await page.evaluate(()=>{
    const xml=`<Dataset xmlns:gml="http://www.opengis.net/gml/3.2">
      <RdEdg><fid>road-a</fid><orgGILvl>2500</orgGILvl><loc><gml:Curve><gml:posList>34 134 34.001 134.001</gml:posList></gml:Curve></loc></RdEdg>
      <BldL><fid>building-b</fid><orgGILvl>25000</orgGILvl><loc><gml:Curve><gml:posList>34 134 34.001 134.001</gml:posList></gml:Curve></loc></BldL>
    </Dataset>`;
    const parsed=FoundationMapGml.parseGmlText(xml,{
      maxSourceLevel:FOUNDATION_MAP_MAX_SOURCE_LEVEL,
      bounds:{minX:33,maxX:35,minY:133,maxY:135},
      toPlane:(lat,lon)=>({x:lat,y:lon}),toWorld:(x,y)=>({x:x*1000,y:y*1000})
    });
    data={lines:[[0,0,1,1,1,1,1]],polys:[],splines:[],texts:[],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{"1":"元図面"}};
    inkStrokes=[];deletedLayerNames=new Set();editUndoActions=[];redoStrokes=[];
    const strokes=parsed.strokes.map(stroke=>foundationMapStrokeFromParsed(stroke,"4:513404"));
    addInkStrokeOperation(strokes,"基盤地図情報2500");
    const layer=getMemoLayerSpecForStroke(strokes[0]);
    const layerDefs=buildMemoLayerDefinitions("",100,strokes);
    const meta=buildMemoMetaComment();
    const restored=restoreInkStrokesFromSourceText(meta);
    return {
      paths:parsed.strokes.length,skippedCoarse:parsed.stats.skippedCoarse,
      layerName:layer&&layer.name,layerText:layerDefs.layerText,
      restoredKind:restored[0]&&restored[0].foundationMapKind,
      restoredLevel:restored[0]&&restored[0].foundationSourceLevel
    };
  });
  if(result.paths!==1||result.skippedCoarse!==1||result.layerName!=="基盤2500_道路縁"||
    !result.layerText.includes("layer_feature")||result.restoredKind!=="road"||result.restoredLevel!==2500){
    throw new Error(`foundation map integration failed: ${JSON.stringify(result)}`);
  }
  if(errors.length)throw new Error(`page errors: ${errors.join(" | ")}`);
  console.log("Foundation map 2500 import and SFC persistence validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();server.close();
});
