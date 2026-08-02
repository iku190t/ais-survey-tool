const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const required=[
  ["Excel出力",'id="photoExcelBtn" type="button">Excel出力</button>'],
  ["一覧表の選択",'id="photoExcelListChoiceBtn" type="button">一覧表を出力</button>'],
  ["写真帳の選択",'id="photoExcelAlbumChoiceBtn" type="button">写真帳を出力</button>'],
  ["位置調整",'id="photoPositionAdjustBtn" type="button" aria-pressed="false">位置調整</button>'],
  ["原EXIF位置の保持","originalXNorth"],
  ["原EXIF方向の保持","originalDirection"],
  ["移動処理","applyPhotoAdjustedWorldPosition(item,worldX,worldY)"],
  ["DEM再取得","resolvePhotoDemElevation(drag.item)"],
  ["8方向Excel","formatPhotoDirection8(item.direction)"],
  ["写真一覧ヘッダー固定",'#photoListTable thead th{position:sticky;top:0;'],
  ["写真位置の初期色は赤",'if(String(layer)===PHOTO_POSITION_LAYER_ID)return "#ff3030"'],
  ["Ez Viewerのリンク下線","text-decoration:underline"]
];
for(const [name,token] of required)if(!html.includes(token))throw new Error(`${name}がありません`);
for(const removed of ["photoBackMask","PHOTO_BACK_MASK_LAYER_ID","isPhotoBackMask","backMaskEnabled"]){
  if(html.includes(removed))throw new Error(`廃止した写真背面マスク処理が残っています: ${removed}`);
}

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
  const page=await browser.newPage({viewport:{width:1200,height:820}});
  const pageErrors=[];page.on("pageerror",error=>pageErrors.push(String(error)));
  await page.addInitScript(()=>{
    const defs=new Map();
    const mock=(from,to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=(key,value)=>{if(value!==undefined)defs.set(key,value);return defs.get(key)||key;};
    window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"commit",timeout:10000});
  await page.waitForSelector("#canvas",{timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("buildPhotoAnnotationExportStrokes")==="function",null,{timeout:10000});
  const result=await page.evaluate(()=>window.eval(`(()=>{
    loadedSfcText="test";
    data={lines:[],polys:[],splines:[],texts:[],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{},source_name:"test.sfc",_drawingToPaperScale:1};
    rotationDeg=0;view={scale:2,tx:430,ty:360};
    photoAnnotations=[{number:1,fileName:"P1.jpg",lat:34,lon:134,direction:0,capturedAt:"2026:08:01 10:00:00",xNorth:0,yEast:0,demElevation:10,demSource:"DEM1A",demElevationChecked:true,worldX:0,worldY:0,markerX:0,markerY:0,coordinateZone:4,originalLat:34,originalLon:134,originalDirection:0,originalXNorth:0,originalYEast:0,manualPositionAdjusted:false,manualDirectionAdjusted:false,listX:0,listY:-20,listLayoutVersion:2}];
    layerVisibility[PHOTO_POSITION_LAYER_ID]=true;deletedLayerNames.delete(PHOTO_POSITION_LAYER_NAME);
    const panel=document.getElementById("photoListPanel");panel.style.display="flex";
    document.getElementById("startupModal").style.display="none";
    renderPhotoListPanel();setPhotoPositionAdjustMode(true);
    const strokes=buildPhotoAnnotationExportStrokes();
    const ann=buildInkPolylineFeatureText("test");
    const records=parseSxfFeatureRecords(getFlatSxfText(ann.colorText+"\\n"+ann.layerText+"\\n"+ann.lineText));
    const positionSpec=getMemoLayerSpecById(PHOTO_POSITION_LAYER_ID);
    const layerCode=parseLayerFeatureDefsFlat(getFlatSxfText(ann.layerText)).findIndex(def=>def.rawName===positionSpec.rawName)+1;
    const positionRecords=records.filter(record=>Number(unquoteSxfValue(record.args[0]))===layerCode);
    const baseColor=getCurrentLayerColor(PHOTO_POSITION_LAYER_ID);
    setLayerColorOverride(PHOTO_POSITION_LAYER_ID,"#0070c0");
    const overrideColor=buildPhotoAnnotationExportStrokes().find(stroke=>stroke.photoLayerId===PHOTO_POSITION_LAYER_ID)?.color||"";
    delete layerColorOverrides[PHOTO_POSITION_LAYER_ID];
    const geometry=getPhotoMarkerScreenGeometry(photoAnnotations[0]);
    return {
      active:photoPositionAdjustIsActive(),hit:hitTestPhotoPositionAdjust(geometry.center[0],geometry.center[1])?.kind,
      baseColor,overrideColor,
      circleCount:positionRecords.filter(record=>record.name==="circle_feature").length,
      textCount:positionRecords.filter(record=>record.name==="text_string_feature").length,
      redCodes:[...new Set(positionRecords.filter(record=>["circle_feature","polyline_feature","text_string_feature"].includes(record.name)).map(record=>unquoteSxfValue(record.args[1])))],
      hasFill:records.some(record=>record.name==="fill_area_style_colour_feature"||record.name==="externally_defined_hatch_feature"),
      meta:parseMemoMetaPayload(buildMemoMetaComment())
    };
  })()`));
  if(!result.active||result.hit!=="move")throw new Error(`写真位置調整を開始できません: ${JSON.stringify(result)}`);
  if(result.baseColor.toLowerCase()!=="#ff3030"||result.overrideColor.toLowerCase()!=="#0070c0")throw new Error(`写真位置の色がレイヤー設定と連動しません: ${JSON.stringify(result)}`);
  if(result.circleCount!==1||result.textCount<1||result.redCodes.some(code=>code!=="2"))throw new Error(`写真位置の赤色SFC出力が不正です: ${JSON.stringify(result)}`);
  if(result.hasFill||Object.prototype.hasOwnProperty.call(result.meta||{},"photoBackMaskEnabled"))throw new Error(`廃止したマスク情報がSFC出力へ残っています: ${JSON.stringify(result)}`);
  if(pageErrors.length)throw new Error(`ページエラー: ${pageErrors.join(" | ")}`);
  console.log("photo position adjustment checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
