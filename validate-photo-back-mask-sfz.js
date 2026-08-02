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
  let sfc,entryName;
  if(/\.sfc$/i.test(samplePath)){
    sfc=fs.readFileSync(samplePath).toString("latin1");
    entryName=path.basename(samplePath);
  }else{
    const zip=await JSZip.loadAsync(fs.readFileSync(samplePath));
    const entry=Object.values(zip.files).find(item=>!/\/$/.test(item.name)&&/\.sfc$/i.test(item.name));
    if(!entry)throw new Error("SFZ内にSFCがありません");
    sfc=(await entry.async("nodebuffer")).toString("latin1");
    entryName=path.basename(entry.name);
  }
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
    const originalExternalHatches=originalRecords.filter(record=>record.name==="externally_defined_hatch_feature");
    const externalHatches=records.filter(record=>record.name==="externally_defined_hatch_feature");
    const fills=records.filter(record=>record.name==="fill_area_style_colour_feature"&&Number(unquoteSxfValue(record.args[0]))===maskCode);
    const generatedBlocks=[...saved.text.matchAll(/\/\*\s*---\s*sfcviewer_generated_begin\s*---\s*\*\/([\s\S]*?)\/\*\s*---\s*sfcviewer_generated_end\s*---\s*\*\//g)];
    const boundaryBlock=generatedBlocks.find(match=>/composite_curve_org_feature\s*\(/.test(match[1]));
    const fillBlock=generatedBlocks.find(match=>/fill_area_style_colour_feature\s*\(/.test(match[1]));
    const boundaryAndFillAdjacent=!!(boundaryBlock&&fillBlock&&boundaryBlock.index<fillBlock.index&&
      saved.text.slice(boundaryBlock.index+boundaryBlock[0].length,fillBlock.index).trim()==="");
    const generatedPrelude=parseSxfFeatureRecords(getFlatSxfText(ann.preludeText));
    const generatedRecords=parseSxfFeatureRecords(getFlatSxfText(ann.preludeText+'\n'+ann.lineText+'\n'+ann.rootPlacementText));
    const boundaries=generatedPrelude.filter(record=>record.name==="polyline_feature"&&record.args.slice(0,4).every(value=>Number(unquoteSxfValue(value))===0));
    const backgroundFigures=generatedRecords.filter(record=>record.name==="sfig_org_feature"&&/^\$\$ATRU\$\$\d+\$\$/.test(String(unquoteSxfValue(record.args[0])||"")));
    const backgroundNames=new Set(backgroundFigures.map(record=>String(unquoteSxfValue(record.args[0])||"")));
    const backgroundPlacements=generatedRecords.filter(record=>record.name==="sfig_locate_feature"&&backgroundNames.has(String(unquoteSxfValue(record.args[1])||"")));
    const userColours=parseUserDefinedColourFeatureDefsFlat(flat);
    let code=0;const compositeCodes=[];const compositesByCode=new Map();
    for(const record of records){
      if(record.name!=="composite_curve_org_feature")continue;
      code+=1;compositeCodes.push(code);compositesByCode.set(code,record);
    }
    const generatedFillBoundaries=fills.map(record=>{
      const outer=Number(unquoteSxfValue(record.args[2]));
      const composite=compositesByCode.get(outer);
      return {outer,resolved:!!composite,compositeArgs:composite?.args?.map(unquoteSxfValue)||[]};
    });
    await load(saved.text,"roundtrip.sfc",null,{restoreRecovery:false});
    ensureLayerVisibility();
    photoSettings={...photoSettings,backMaskEnabled:true};
    layerVisibility[PHOTO_BACK_MASK_LAYER_ID]=true;
    deletedLayerNames.delete(PHOTO_BACK_MASK_LAYER_NAME);
    const roundtrip=buildSfcExportBlobAndName();
    if(!roundtrip.ok)return {ok:false,reason:roundtrip.reason};
    const roundtripRecords=parseSxfFeatureRecords(getFlatSxfTextIncludingGenerated(roundtrip.text));
    const roundtripDefs=parseLayerFeatureDefsFlat(getFlatSxfTextIncludingGenerated(roundtrip.text));
    const roundtripMaskCode=roundtripDefs.findIndex(def=>def.name===PHOTO_BACK_MASK_LAYER_NAME||def.rawName===getMemoLayerSpecById(PHOTO_BACK_MASK_LAYER_ID).rawName)+1;
    return {
      ok:true,
      photoCount:photoAnnotations.length,
      usedSourceCircleFallback,
      originalMaskCode,
      originalMaskFillCount:originalRecords.filter(record=>(record.name==="fill_area_style_colour_feature"||record.name==="externally_defined_hatch_feature")&&Number(unquoteSxfValue(record.args[0]))===originalMaskCode).length,
      maskCode,
      originalExternalHatchCount:originalExternalHatches.length,
      externalHatchCount:externalHatches.length,
      generatedExternalMaskCount:generatedRecords.filter(record=>record.name==="externally_defined_hatch_feature").length,
      fillCount:fills.length,
      boundaryAndFillAdjacent,
      boundaryCount:boundaries.length,
      backgroundFigureCount:backgroundFigures.length,
      backgroundPlacementCount:backgroundPlacements.length,
      explicitBlackCount:userColours.filter(def=>def.r===0&&def.g===0&&def.b===0).length,
      roundtripMaskFillCount:roundtripRecords.filter(record=>record.name==="fill_area_style_colour_feature"&&Number(unquoteSxfValue(record.args[0]))===roundtripMaskCode).length,
      roundtripMaskAreaControlCount:roundtripRecords.filter(record=>record.name==="externally_defined_hatch_feature"&&Number(unquoteSxfValue(record.args[0]))===roundtripMaskCode&&String(unquoteSxfValue(record.args[1]))==="Area_control").length,
      roundtripValidation:validateGeneratedMemoSfc(roundtrip.text,buildSfcAnnotations(stripEmbeddedAnnotations(saved.text)).expectedFeatureCount||0),
      generatedFillArgs:fills.map(record=>record.args.map(unquoteSxfValue)),
      generatedFillBoundaries,
      generatedPrelude:generatedPrelude.map(record=>({name:record.name,args:record.args.map(unquoteSxfValue)})),
      lastCompositeCodes:compositeCodes.slice(-5),
      validation:validateGeneratedMemoSfc(saved.text,ann.expectedFeatureCount||0)
    };
  },{sfc,name:entryName});
  if(!result.ok)throw new Error(result.reason||"書出しに失敗しました");
  if(result.photoCount<1)throw new Error("添付SFZから写真位置を復元できません");
  if(result.maskCode<1||result.fillCount!==result.photoCount||result.boundaryCount!==result.photoCount||!result.boundaryAndFillAdjacent||result.generatedExternalMaskCount!==0||result.externalHatchCount!==result.originalExternalHatchCount||result.backgroundFigureCount!==0||result.backgroundPlacementCount!==0||result.explicitBlackCount<1||result.generatedFillBoundaries.some(item=>!item.resolved))throw new Error(`背面マスクの書出し件数が不正です: ${JSON.stringify(result)}`);
  if(result.roundtripMaskFillCount!==result.photoCount||result.roundtripMaskAreaControlCount!==0||!result.roundtripValidation?.ok)throw new Error(`再保存後の背面マスク構造が不正です: ${JSON.stringify(result)}`);
  if(!result.validation?.ok)throw new Error(`SXF検証に失敗しました: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
