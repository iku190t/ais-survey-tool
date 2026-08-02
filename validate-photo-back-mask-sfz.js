const fs=require("fs");
const http=require("http");
const path=require("path");
const JSZip=require("jszip");
const {chromium}=require("playwright");

const root=__dirname;
const samplePath=process.argv[2];
if(!samplePath||!fs.existsSync(samplePath))throw new Error("検証するSFZファイルを指定してください");

const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader("Content-Type",path.extname(file).toLowerCase()===".js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  const zip=await JSZip.loadAsync(fs.readFileSync(samplePath));
  const entry=Object.values(zip.files).find(item=>!/\/$/.test(item.name)&&/\.sfc$/i.test(item.name));
  if(!entry)throw new Error("SFZ内にSFCがありません");
  const sfc=(await entry.async("nodebuffer")).toString("latin1");
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:1200,height:820}});
  await page.addInitScript(()=>{
    const mock=(from,to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=key=>key;window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"commit",timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("handleLoadedSource")==="function",null,{timeout:10000});
  const result=await page.evaluate(async payload=>{
    const load=window.eval("handleLoadedSource");
    await load(payload.sfc,payload.name,null,{restoreRecovery:false});
    const originalRecords=parseSxfFeatureRecords(getFlatSxfText(payload.sfc));
    const originalDefs=parseLayerFeatureDefsFlat(getFlatSxfText(payload.sfc));
    const originalMaskCode=originalDefs.findIndex(def=>def.name===PHOTO_BACK_MASK_LAYER_NAME||def.rawName===getMemoLayerSpecById(PHOTO_BACK_MASK_LAYER_ID).rawName)+1;
    let usedSourceCircleFallback=false;
    if(!photoAnnotations.length){
      const circle=(data.circles||[]).find(value=>getLayerLabel(value[3])===PHOTO_POSITION_LAYER_NAME);
      if(!circle)return {ok:false,reason:"写真位置の円を確認できません"};
      const markerX=Number(circle[0]),markerY=Number(circle[1]);
      photoAnnotations=[{number:1,fileName:"sample.jpg",lat:0,lon:0,direction:0,capturedAt:"",xNorth:markerX,yEast:markerY,demElevation:null,demSource:"",demElevationChecked:true,worldX:markerX,worldY:markerY,markerX,markerY,coordinateZone:4,originalLat:0,originalLon:0,originalDirection:0,originalXNorth:markerX,originalYEast:markerY,manualPositionAdjusted:false,manualDirectionAdjusted:false,listX:markerX,listY:markerY-20,listLayoutVersion:2}];
      usedSourceCircleFallback=true;
    }
    ensureLayerVisibility();
    photoSettings={...photoSettings,backMaskEnabled:true};
    layerVisibility[PHOTO_BACK_MASK_LAYER_ID]=true;
    deletedLayerNames.delete(PHOTO_BACK_MASK_LAYER_NAME);
    const saved=buildSfcExportBlobAndName();
    if(!saved.ok)return {ok:false,reason:saved.reason};
    const ann=buildSfcAnnotations(stripEmbeddedAnnotations(payload.sfc));
    const flat=getFlatSxfTextIncludingGenerated(saved.text);
    const records=parseSxfFeatureRecords(flat);
    const defs=parseLayerFeatureDefsFlat(flat);
    const maskCode=defs.findIndex(def=>def.name===PHOTO_BACK_MASK_LAYER_NAME||def.rawName===getMemoLayerSpecById(PHOTO_BACK_MASK_LAYER_ID).rawName)+1;
    const externalHatches=records.filter(record=>record.name==="externally_defined_hatch_feature");
    const fills=externalHatches.filter(record=>Number(unquoteSxfValue(record.args[0]))===maskCode);
    const boundaries=records.filter(record=>record.name==="polyline_feature"&&Number(unquoteSxfValue(record.args[0]))===maskCode);
    const sanitizedRecords=parseSxfFeatureRecords(getFlatSxfTextIncludingGenerated(sanitizeInvalidSxfExternalHatches(saved.text)));
    const sanitizedFills=sanitizedRecords.filter(record=>record.name==="externally_defined_hatch_feature"&&Number(unquoteSxfValue(record.args[0]))===maskCode);
    let code=0;const compositeCodes=[];
    for(const record of records){if(SXF_ASSEMBLY_ORIGIN_NAMES.has(record.name)){code+=1;if(record.name==="composite_curve_org_feature")compositeCodes.push(code);}}
    return {
      ok:true,
      photoCount:photoAnnotations.length,
      usedSourceCircleFallback,
      originalMaskCode,
      originalMaskFillCount:originalRecords.filter(record=>(record.name==="fill_area_style_colour_feature"||record.name==="externally_defined_hatch_feature")&&Number(unquoteSxfValue(record.args[0]))===originalMaskCode).length,
      maskCode,
      externalHatchCount:externalHatches.length,
      sanitizedExternalHatchCount:sanitizedRecords.filter(record=>record.name==="externally_defined_hatch_feature").length,
      fillCount:fills.length,
      sanitizedFillCount:sanitizedFills.length,
      boundaryCount:boundaries.length,
      generatedFillArgs:records.filter(record=>record.name==="externally_defined_hatch_feature").slice(-3).map(record=>record.args.map(unquoteSxfValue)),
      generatedPrelude:parseSxfFeatureRecords(getFlatSxfText(ann.preludeText)).map(record=>({name:record.name,args:record.args.map(unquoteSxfValue)})),
      lastCompositeCodes:compositeCodes.slice(-5),
      validation:validateGeneratedMemoSfc(saved.text,ann.expectedFeatureCount||0)
    };
  },{sfc,name:path.basename(entry.name)});
  if(!result.ok)throw new Error(result.reason||"書出しに失敗しました");
  if(result.photoCount<1)throw new Error("添付SFZから写真位置を復元できません");
  if(result.maskCode<1||result.fillCount!==result.photoCount||result.sanitizedFillCount!==result.photoCount||result.sanitizedExternalHatchCount!==result.externalHatchCount||result.boundaryCount!==result.photoCount||result.generatedFillArgs.some(args=>args[1]!=="Area_control"))throw new Error(`背面マスクの書出し件数が不正です: ${JSON.stringify(result)}`);
  if(!result.validation?.ok)throw new Error(`SXF検証に失敗しました: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
