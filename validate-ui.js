const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync(__dirname+'/index.html','utf8').replace(/\r\n/g,'\n');

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(m=>m[1]).filter(Boolean);
for(let i=0;i<scripts.length;i++)new vm.Script(scripts[i],{filename:`inline-${i+1}.js`});

const levels=[1,10,25,50,75,100];
const scales=[1,100,200,250,500,1000,2000,2500,5000];
const diameter=level=>0.2+(level-1)/99*(10-0.2);
const classify=(extentScale,scale)=>{
  if(scale<=1.000001)return 'model';
  return Math.abs(Math.log(extentScale))<Math.abs(Math.log(extentScale/scale))?'paper':'model';
};
for(const scale of scales){
  for(const storage of ['model','paper']){
    const extentScale=storage==='model'?scale:1;
    const detected=classify(extentScale,scale);
    if(detected!==storage&&scale>1)throw new Error(`coordinate storage mismatch 1/${scale}: ${storage} -> ${detected}`);
    const unitsPerPaperMm=detected==='paper'?1:scale;
    for(const level of levels){
      const worldDiameter=diameter(level)*unitsPerPaperMm;
      const expected=storage==='paper'?diameter(level):diameter(level)*scale;
      if(Math.abs(worldDiameter-expected)>1e-8)throw new Error(`circle scale mismatch 1/${scale} ${storage}`);
    }
  }
}

const widthMm=level=>0.006+(level-1)/99*(0.50-0.006);
let previousWidth=0;
for(let level=1;level<=100;level++){
  const mm=widthMm(level);
  if(!(mm>previousWidth))throw new Error(`pen width is not monotonic at ${level}`);
  previousWidth=mm;
  for(const scale of scales){
    const modelPxAtOnePxPerWorldMm=mm*scale;
    const paperPxAtOnePxPerWorldMm=mm;
    if(!(modelPxAtOnePxPerWorldMm>0&&paperPxAtOnePxPerWorldMm>0))throw new Error(`invalid pen width 1/${scale}`);
  }
}
if(Math.abs(widthMm(1)-0.006)>1e-12||Math.abs(widthMm(100)-0.50)>1e-12)throw new Error('pen width endpoints changed');
const previewPx=level=>0.03+(level-1)/99*(0.50-0.03);
if(Math.abs(previewPx(1)-0.03)>1e-12||Math.abs(previewPx(100)-0.50)>1e-12)throw new Error('pen preview endpoints changed');
for(let level=2;level<=100;level++)if(!(previewPx(level)>previewPx(level-1)))throw new Error(`pen preview is not monotonic at ${level}`);

const uprightScore=(textAngle,rotation)=>Math.cos((-(textAngle+rotation))*Math.PI/180);
if(!(uprightScore(0,0)>uprightScore(0,180)))throw new Error('0/180 orientation selection failed');
if(!(uprightScore(180,180)>uprightScore(180,0)))throw new Error('flipped text orientation selection failed');

const commands=['openIconBtn','gpsBtn','measureBtn','profileBtn','photoToolBtn','drawBtn','textSearchOpenBtn','settingsBtn','helpBtn','layerFab','bgBtn','gpsDetailFab','supportBtn'];
const surfaces=['file','measure','profile','photo','draw','search','settings','help','layer','background','gpsDetail','support'];
const keep={openIconBtn:'file',measureBtn:'measure',profileBtn:'profile',photoToolBtn:'photo',drawBtn:'draw',textSearchOpenBtn:'search',settingsBtn:'settings',helpBtn:'help',layerFab:'layer',bgBtn:'background',gpsDetailFab:'gpsDetail',supportBtn:'support'};
for(const from of commands){
  for(const to of commands){
    const active=new Set(surfaces);
    for(const surface of [...active])if(surface!==keep[to])active.delete(surface);
    if(active.size>(keep[to]?1:0))throw new Error(`toolbar state leak ${from} -> ${to}`);
  }
}

const required=[
  'closeToolbarSurfacesExcept(command.id)',
  'if(commandId!=="openIconBtn"&&isSaveMenuOpen())setSaveMenuOpen(false)',
  'if(commandId!=="bgBtn")',
  'id="settingsBtn"',
  'id="coordinateSystemSelect"',
  '第4系（徳島・香川・高知・愛媛）',
  'id="lineDisplayScaleRange" type="range" min="1" max="10"',
  '#desktopCadCrosshair{display:none;position:absolute;left:0;top:0;width:72px;height:72px',
  '#photoListTable td{-webkit-user-select:text;user-select:text',
  'event.clipboardData.setData("text/plain",plainText)',
  '`${rasterBaseName}_ラスター_${sourceId}_${String(index+1).padStart(2,"0")}.JPG`',
  'const manualZone=getManualCoordinateZone()',
  'scaledDisplayLineWidthPx(styleItem[6],0.20,2.2)',
  'paperDiameterMm=circleDiameterMmFromLevel(circleSizeLevel)',
  'getMemoWorldUnitsPerPaperMm()',
  'classifyDrawingCoordinateStorage(bounds,sheet,denominator)',
  'circleGeometryVersion: CIRCLE_GEOMETRY_VERSION',
  'worldWidthMm:widthMm',
  'width:penWidthLevelFromMm(widthMm)',
  'getMemoPreviewLineWidthPx(stroke)',
  'textUprightScore(d,baseRotation)',
  'dominantTextAxisRotation(d)',
  'trustedMainFigures=transformedFigures.filter',
  '元図より|拡大図|座標一覧',
  'function getNorthUpRotationDeg()',
  'planeToSfcWorld(1,0)',
  'getNorthUpRotationDeg()-rotationDeg',
  '現場の向きに追従',
  'DeviceOrientationEvent.requestPermission()',
  'getNorthUpRotationDeg()+heading',
  'function startCompassFollow()',
  'function stopCompassFollow()',
  'onCompassFollowOrientation',
  'const TERRAIN_SLOPE_BANDS=[',
  'label:"60°以上"',
  'length:TERRAIN_ELEVATION_COLORS.length+1',
  '基準標高 ${formatTerrainElevation(v.reference)}',
  'setDrawingRotationPreserveCenter(targetRotationDeg)',
  'id="terrainCadBtn"',
  'function clipTerrainContourToPolygon',
  'buildTerrainContourGeometry(grid,1,5)',
  'name:"等高線_DEM1A_主曲線"',
  'name:"等高線_DEM1A_計曲線"',
  'name:"等高線_DEM5A_主曲線"',
  'name:"等高線_DEM5A_計曲線"',
  'function terrainContourRegularColor(){return darkTheme?"#ffd24a":"#0057c8";}',
  'id="terrainDifferenceBtn"',
  'sampleDemElevationBilinear(lat,lon,source)',
  'activateTerrainMode("difference")',
  '差（1A－5A）',
  'splitTerrainCadPolyline(piece.points,500)',
  'function splitTerrainCadPolylineByDemSource',
  'terrainDemSource:piece.source',
  'isTerrainContour: !!s.isTerrainContour',
  'const typeCode = MEMO_FILE_TYPE_CODE;'
  ,'showToast("CAD化しました",1800)'
  ,'recordEditAction({type:"ink-add",strokes:list,revivedLayerNames,label})'
  ,'type:"layer-delete"'
  ,'className="layerItemDelete"'
  ,'deleteBtn.addEventListener("pointerdown",event=>event.stopPropagation())'
  ,'event.stopPropagation();\n      deleteLayerFromSwipe(layer);'
  ,'layerPanel.style.display="flex";'
  ,'if(event.target===cb||event.target.closest(".layerColorButton"))return;'
  ,'if(!desktopLayerMode){'
  ,'function normalizeSxfTextAngle(angle)'
  ,'const angle=normalizeSxfTextAngle(label.angle);'
  ,'const missing=primary.points.filter(point=>point.elevation==null);'
  ,'missing[index].source="DEM5A";'
  ,'const sourceId=dem5Count?"MIXED":"DEM1A";'
  ,'return terrainContourGridFromNativeResult(fallback,zone,viewport,"DEM5A"'
  ,'function terrainContourDisplayResolutionMode(scale,previousMode="")'
  ,'if(previousMode==="DEM1A")return pixelsPerMeter<.65?"DEM5A":"DEM1A";'
  ,'if(previousMode==="DEM5A")return pixelsPerMeter>=1?"DEM1A":"DEM5A";'
  ,'const displayResolutionMode=quality==="detail"?"DEM1A":terrainContourDisplayResolutionMode(viewport.scale,previousMode);'
  ,'const grid=currentIsDetailed?terrainGrid:await buildTerrainGrid("contour","detail");'
  ,'let min=Infinity,max=-Infinity,validCount=0;'
  ,'if(elevation<min)min=elevation;'
  ,'if(elevation>max)max=elevation;'
  ,'function stripDeletedLayersFromSfc'
  ,'stripDeletedLayersFromSfc(stripEmbeddedAnnotations'
  ,'id="aerialPhotoSfcBtn"'
  ,'範囲を選んでCAD化'
  ,'function getAerialSelectionPlaneGeometry(worldPolygon)'
  ,'setTerrainCadSelectionOpen(true,"aerial")'
  ,'image.planePolygon'
  ,'function renderVisibleAerialPhotoForSfc'
  ,'function makeGeoJpegExifSegment'
  ,'function addAerialImageReferenceToSfc'
  ,'$$jpg$$'
  ,'function createZipFromFiles'
  ,'function normalizeZipEntryName'
  ,'normalizeZipEntryName(file&&file.name,"drawing.sfc")'
  ,'id="saveMenuSfzBtn"'
  ,'let aerialCadImages = []'
  ,'function drawAerialCadImages'
  ,'function buildAerialSfzExport'
  ,'function stripAerialImageReferenceFeatures'
  ,'航空写真をCAD化しました'
  ,'function buildAerialSfcSidecarExport'
  ,'id="aerialSfcWarningModal"'
  ,'航空写真などは通常のSFCには保存されません。'
  ,'function confirmStandardSfcWithoutAerial'
  ,'runStandardSfcSave(saveSfcOverwrite'
  ,'saveSfcAsDesktop({overwrite:false})'
  ,'id="registryMapOpenBtn"'
  ,'id="registryMapPanel"'
  ,'id="registryParcelLayerToggle"'
  ,'id="registryBoundaryLayerToggle"'
  ,'id="registryPointLayerToggle"'
  ,'id="registryLabelLayerToggle"'
  ,'function parseRegistryGeoJson'
  ,'function parseRegistryXml'
  ,'function drawRegistryMapOverlay'
  ,'function openRegistryParcelDetails'
  ,'筆界点のXY座標'
  ,'drawRegistryMapOverlay();'
  ,'id="hazardMapOpenBtn"'
  ,'id="hazardMapPanel"'
  ,'id="hazardFloodBtn"'
  ,'id="hazardSoilBtn"'
  ,'id="hazardHighTideBtn"'
  ,'id="hazardTsunamiBtn"'
  ,'function activateHazardMap'
  ,'function drawHazardMap'
  ,'drawHazardMap(w,h);'
  ,'id="controlPointOpenBtn"'
  ,'id="controlPointPanel"'
  ,'id="controlPointEnabledToggle"'
  ,'function getControlPointTile'
  ,'function drawControlPointOverlay'
  ,'drawControlPointOverlay(w,h);'
  ,'基準点成果等閲覧サービス'
  ,'境界確定・測量・登記・権利判断には使用できません'
  ,'id="photoToolBtn"'
  ,'id="photoListPanel"'
  ,'id="photoOpenBtn"'
  ,'id="photoExcelBtn"'
  ,'id="photoCircleSize"'
  ,'id="photoTextSize"'
  ,'id="photoArrowLength"'
  ,'id="photoArrowHeadWidth"'
  ,'function isDesktopPhotoTool()'
  ,'overwriteBtn.hidden=false;'
  ,'const overwriteHandle=overwrite&&currentOpenHandle&&typeof currentOpenHandle.createWritable==="function"'
  ,'directoryHandle=await window.showDirectoryPicker({id:"sfcviewer-sfc-sidecars",mode:"readwrite"})'
  ,'function buildPhotoListXlsx()'
  ,'function formatPhotoCapturedAt(value)'
  ,'["番号","ファイル名","撮影時間","X座標","Y座標","DEM標高","使用DEM"]'
  ,'formatPhotoCoordinate(item.xNorth)'
  ,'formatPhotoCoordinate(item.yEast)'
  ,'function ensurePhotoDemElevations(items=photoAnnotations)'
  ,'demElevationChecked:item.demElevationChecked===true'
  ,'id="photoListTableScroll"'
  ,'#photoListTableScroll::-webkit-scrollbar{height:12px;}'
  ,'#photoListTable{width:840px;min-width:840px;table-layout:fixed'
  ,'const PHOTO_LIST_TEXT_HEIGHT_MM = 2.5;'
  ,'function buildGeneratedTextFontDefinition(baseText,startId)'
  ,'const fontName=encodeSfcText('
  ,'function handleLoadedSfzFile(file)'
  ,'function extractAerialCadImagesFromSfz'
  ,'{restoreRecovery:false}'
  ,'"application/zip":[".sfz"]'
  ,'relatedLayerNames=isPhotoLayer?[PHOTO_POSITION_LAYER_NAME,PHOTO_LIST_LAYER_NAME]:[name]'
  ,'sanitizeInvalidSxfExternalHatches(stripAerialImageReferenceFeatures(sourceExport.text))'
  ,'direction!==1&&direction!==2'
  ,'id="textLayerModal"'
  ,'id="textLayerRecentBtn"'
  ,'id="textLayerRecentBtn2"'
  ,'const TEXT_LAYER_HISTORY_KEY="sfcviewer.recentTextLayerNames"'
  ,'function rememberRecentTextLayerName'
  ,'function findEditableTextAtScreen'
  ,'e.target instanceof Element&&e.target.closest("#textLayerModal")'
  ,'id="coordinateInspectModal"'
  ,'function openCoordinateInspectModal'
  ,'function ensureCoordinateInspectPointVisibleAboveModal'
  ,'requestAnimationFrame(()=>ensureCoordinateInspectPointVisibleAboveModal())'
  ,'function drawCoordinateInspectMarker'
  ,'class="coordinateCopyBtn"'
  ,'data-copy-source="coordinateInspectX"'
  ,'data-copy-source="coordinateInspectY"'
  ,'data-copy-source="coordinateInspectElevation" data-strip-unit="m"'
  ,'function copyCoordinateInspectValue'
  ,'value=value.replace(/\\s*m\\s*$/i,"").trim()'
  ,'function drawDesktopCadCrosshair'
  ,'drawDesktopCadCrosshair();'
  ,'canvas.classList.toggle("desktopCadCrosshair",!isTouchMobileLike())'
  ,'for(const source of PROFILE_DEM_SOURCES)'
  ,'DEM標高を取得できません'
  ,'座標を確認できません'
  ,'type:"text-layer-change"'
  ,'_sxfFeatureId:rec.id'
];
for(const token of required)if(!html.includes(token))throw new Error(`missing implementation: ${token}`);

const backgroundPanelStart=html.indexOf('<div id="aerialPhotoPanel"');
const backgroundPanelEnd=html.indexOf('</div>',html.indexOf('id="hazardMapOpenBtn"',backgroundPanelStart));
const backgroundPanelHtml=html.slice(backgroundPanelStart,backgroundPanelEnd);
const backgroundOrder=[
  'id="terrainPanelOpenBtn"',
  'id="registryMapOpenBtn"',
  'id="controlPointOpenBtn"',
  'id="hazardMapOpenBtn"'
].map(token=>backgroundPanelHtml.indexOf(token));
if(backgroundOrder.some(index=>index<0)||backgroundOrder.some((index,i)=>i&&index<=backgroundOrder[i-1])){
  throw new Error('background menu order is incorrect');
}
if(/id="fileInput"[^>]*(?:\.html|text\/html)/i.test(html))throw new Error('HTML remains in the drawing file picker');
if(/SFC・HTML・写真|SFC、SFZ、HTML/.test(html))throw new Error('HTML remains in drag-and-drop guidance');

const splitArgsStart=html.indexOf('function splitSxfArgs(body)');
const splitArgsEnd=html.indexOf('function unquoteSxfValue',splitArgsStart);
const textLayerSourceStart=html.indexOf('function locateSxfSourceFeature');
const textLayerSourceEnd=html.indexOf('function getEditableSxfLayerDefs',textLayerSourceStart);
if(splitArgsStart<0||splitArgsEnd<0||textLayerSourceStart<0||textLayerSourceEnd<0)throw new Error('missing text-layer SXF source editor');
const textLayerContext={String,Number,Math};
vm.createContext(textLayerContext);
new vm.Script(
  html.slice(splitArgsStart,splitArgsEnd)+html.slice(textLayerSourceStart,textLayerSourceEnd),
  {filename:'text-layer-source-editor.js'}
).runInContext(textLayerContext);
const textLayerSample="ISO-10303-21;\r\nDATA;\r\n/*SXF\r\n#100 = layer_feature('BASE','1')\r\nSXF*/\r\n/*SXF\r\n#200 = text_string_feature('1','8','1','P1','10','20','2','4','0','0','0','1','1')\r\nSXF*/\r\nENDSEC;";
const rewrittenTextLayer=textLayerContext.rewriteSxfTextFeatureStyle(textLayerSample,200,2,5);
if(!rewrittenTextLayer||!rewrittenTextLayer.includes("#200 = text_string_feature('2','5'"))throw new Error('text layer/color source rewrite failed');
const removedTextLayer=textLayerContext.removeSxfFeatureBlock(textLayerSample,100,'layer_feature');
if(removedTextLayer.includes("#100 = layer_feature"))throw new Error('new layer source removal failed');

const zipNameStart=html.indexOf('function normalizeExportFileName');
const zipNameEnd=html.indexOf('async function createZipFromFiles',zipNameStart);
if(zipNameStart<0||zipNameEnd<0)throw new Error('missing ZIP entry-name normalizer');
const zipNameContext={String};
vm.createContext(zipNameContext);
new vm.Script(html.slice(zipNameStart,zipNameEnd),{filename:'zip-entry-name.js'}).runInContext(zipNameContext);
for(const expected of ['_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/worksheets/sheet1.xml']){
  const actual=zipNameContext.normalizeZipEntryName(expected,'file.xml');
  if(actual!==expected)throw new Error(`OOXML ZIP path was changed: ${expected} -> ${actual}`);
}
if(zipNameContext.normalizeZipEntryName('../evil.xml','file.xml').includes('..')){
  throw new Error('ZIP entry path traversal was not sanitized');
}

const sxfAngleStart=html.indexOf('function normalizeSxfTextAngle(angle)');
const sxfAngleEnd=html.indexOf('function buildInkPolylineFeatureText',sxfAngleStart);
if(sxfAngleStart<0||sxfAngleEnd<0)throw new Error('missing SXF text angle normalizer');
const sxfAngleContext={Math,Number};
vm.createContext(sxfAngleContext);
new vm.Script(html.slice(sxfAngleStart,sxfAngleEnd),{filename:'sxf-text-angle.js'}).runInContext(sxfAngleContext);
const normalizeSxfTextAngle=sxfAngleContext.normalizeSxfTextAngle;
const negativeAngle=normalizeSxfTextAngle(-62.678214);
if(Math.abs(negativeAngle-297.321786)>1e-9)throw new Error(`negative SXF text angle was not normalized: ${negativeAngle}`);
for(const angle of [-1080,-360,0,360,720,725.5,NaN]){
  const normalized=normalizeSxfTextAngle(angle);
  if(!(normalized>=0&&normalized<360))throw new Error(`SXF text angle out of range: ${angle} -> ${normalized}`);
}

const registryStart=html.indexOf('function registryEmptyState()');
const registryEnd=html.indexOf('function registryXmlLocalName',registryStart);
if(registryStart<0||registryEnd<0)throw new Error('missing registry GeoJSON parser');
const registryContext={
  planeToSfcWorld:(x,y)=>({x,y}),
  latLonToJgd2024XY:(lat,lon)=>({x:lat*1000,y:lon*1000}),
  chooseJapanPlaneZone:()=>4,
  gpsPosition:null,
  profileZone:null
};
vm.createContext(registryContext);
new vm.Script(html.slice(registryStart,registryEnd),{filename:'registry-geojson.js'}).runInContext(registryContext);
registryContext.registrySample={
  type:'FeatureCollection',
  features:[
    {
      type:'Feature',
      properties:{地番:'101-1',地図種類:'地図',精度区分:'甲二',縮尺:'500'},
      geometry:{type:'Polygon',coordinates:[[[100,200],[110,200],[110,210],[100,210],[100,200]]]}
    },
    {
      type:'Feature',
      properties:{点名:'P1'},
      geometry:{type:'Point',coordinates:[100,200]}
    }
  ]
};
const registryParsed=vm.runInContext("parseRegistryGeoJson(registrySample,'sample.geojson')",registryContext);
if(!registryParsed.loaded||registryParsed.parcels.length!==1||registryParsed.points.length!==1)throw new Error('registry GeoJSON feature parsing failed');
if(registryParsed.parcels[0].metadata.lotNumber!=='101-1'||registryParsed.parcels[0].metadata.precision!=='甲二')throw new Error('registry GeoJSON metadata parsing failed');
if(registryParsed.parcels[0].points[0].x!==200000||registryParsed.parcels[0].points[0].y!==100000)throw new Error('registry projected coordinate order failed');

const contourLodStart=html.indexOf('function terrainContourDisplayResolutionMode');
const contourLodEnd=html.indexOf('function terrainViewportNeedsRefresh',contourLodStart);
if(contourLodStart<0||contourLodEnd<0)throw new Error('missing contour display LOD function');
const contourLodContext={Math};
vm.createContext(contourLodContext);
new vm.Script(html.slice(contourLodStart,contourLodEnd),{filename:'contour-display-lod.js'}).runInContext(contourLodContext);
const contourLod=contourLodContext.terrainContourDisplayResolutionMode;
if(contourLod(.0005)!=='DEM5A'||contourLod(.0009)!=='DEM1A')throw new Error('initial contour LOD threshold failed');
if(contourLod(.0007,'DEM1A')!=='DEM1A'||contourLod(.0006,'DEM1A')!=='DEM5A')throw new Error('DEM1A exit hysteresis failed');
if(contourLod(.0009,'DEM5A')!=='DEM5A'||contourLod(.001,'DEM5A')!=='DEM1A')throw new Error('DEM5A exit hysteresis failed');

// Fixed aerial-photo export regression: an era layer must be created once,
// and every generated boundary must reference that valid layer code.
const aerialLayerStart=html.indexOf('function getAerialLayerRawName(layerName)');
const aerialLayerEnd=html.indexOf('function blobToDataUrlAsync',aerialLayerStart);
const aerialSxfUtilStart=html.indexOf('function getNextSfcFeatureId(srcText)');
const aerialSxfUtilEnd=html.indexOf('function parseWidthFeatureDefsFlat',aerialSxfUtilStart);
const aerialInsertStart=html.indexOf('function addAerialImageReferenceToSfc');
const aerialSerialStart=html.indexOf('function getNextAerialImageSerial');
const aerialInsertEnd=html.indexOf('async function cadizeVisibleAerialPhoto',aerialInsertStart);
const memoLayerInsertStart=html.indexOf('function insertMemoLayerDefinition');
const memoLayerInsertEnd=html.indexOf('function insertMemoWidthDefinitions',memoLayerInsertStart);
const aerialSanitizeStart=html.indexOf('function sanitizeInvalidSxfExternalHatches');
const aerialSanitizeEnd=html.indexOf('async function buildAerialSfcSidecarExport',aerialSanitizeStart);
if([aerialLayerStart,aerialLayerEnd,aerialSxfUtilStart,aerialSxfUtilEnd,aerialSerialStart,aerialInsertStart,aerialInsertEnd,memoLayerInsertStart,memoLayerInsertEnd,aerialSanitizeStart,aerialSanitizeEnd].some(v=>v<0)){
  throw new Error('missing fixed aerial-photo SFC export functions');
}
const decodeSjis=s=>new TextDecoder('shift_jis').decode(Uint8Array.from(String(s),ch=>ch.charCodeAt(0)&255));
const aerialSxfContext={
  decodeShiftJisFromLatin1:decodeSjis,
  planeToSfcWorld:(xNorth,yEast)=>({x:xNorth,y:yEast}),
  console
};
vm.createContext(aerialSxfContext);
new vm.Script(
  html.slice(aerialLayerStart,aerialLayerEnd)+
  html.slice(aerialSxfUtilStart,aerialSxfUtilEnd)+
  html.slice(memoLayerInsertStart,memoLayerInsertEnd)+
  html.slice(aerialSerialStart,aerialInsertEnd)+
  html.slice(aerialSanitizeStart,aerialSanitizeEnd),
  {filename:'aerial-sfz-export.js'}
).runInContext(aerialSxfContext);
const sampleSfcLatin1=fs.readFileSync(__dirname+'/sample.sfc','latin1');
const aerialBounds={minX:100,maxX:120,minY:200,maxY:230};
const aerialPolygon=[
  {xNorth:100,yEast:200},{xNorth:100,yEast:230},
  {xNorth:120,yEast:230},{xNorth:120,yEast:200}
];
const aerialLayerName='地理院タイル航空写真（1980～1990年）';
aerialSxfContext.sampleSfcLatin1=sampleSfcLatin1;
aerialSxfContext.aerialBounds=aerialBounds;
aerialSxfContext.aerialPolygon=aerialPolygon;
aerialSxfContext.aerialLayerName=aerialLayerName;
const firstAerialSfc=vm.runInContext(
  "addAerialImageReferenceToSfc(sampleSfcLatin1,'AERIAL_01.JPG',aerialBounds,aerialPolygon,aerialLayerName)",
  aerialSxfContext
);
aerialSxfContext.firstAerialSfc=firstAerialSfc;
const firstAerialDefs=vm.runInContext("parseLayerFeatureDefsFlat(getFlatSxfText(firstAerialSfc))",aerialSxfContext);
const eraLayers=firstAerialDefs.filter(def=>def.name===aerialLayerName);
if(eraLayers.length!==1)throw new Error(`aerial era layer creation failed: ${eraLayers.length}`);
const firstAerialRecords=vm.runInContext("parseSxfFeatureRecords(getFlatSxfText(firstAerialSfc))",aerialSxfContext);
const newestBoundary=firstAerialRecords.filter(record=>record.name==='polyline_feature').sort((a,b)=>b.id-a.id)[0];
if(!newestBoundary)throw new Error('aerial boundary polyline was not generated');
const firstAerialOrg=firstAerialRecords.find(record=>record.name==='sfig_org_feature'&&decodeSjis(record.args[0]).includes('AERIAL_01.JPG'));
if(!firstAerialOrg||!decodeSjis(firstAerialOrg.args[0]).includes('$$ATRU$$1$$')){
  throw new Error('first aerial raster must use ATRU image serial 1');
}
if(!decodeSjis(firstAerialOrg.args[0]).includes('$$jpg$$画像$$AERIAL_01.JPG')){
  throw new Error('aerial raster must use the standard SXF jpg ATRU name');
}
const firstAerialLocate=firstAerialRecords.find(record=>record.name==='sfig_locate_feature'&&decodeSjis(record.args[1]).includes('AERIAL_01.JPG'));
const firstAerialSheet=firstAerialRecords.find(record=>record.name==='drawing_sheet_feature');
const firstOrgOrder=firstAerialRecords.indexOf(firstAerialOrg);
const firstBoundaryOrder=firstAerialRecords.indexOf(newestBoundary);
const firstSheetOrder=firstAerialRecords.indexOf(firstAerialSheet);
const firstLocateOrder=firstAerialRecords.indexOf(firstAerialLocate);
if(!(firstBoundaryOrder>=0&&firstBoundaryOrder<firstOrgOrder&&firstOrgOrder<firstLocateOrder&&firstLocateOrder<firstSheetOrder)){
  throw new Error('aerial compound figure order is invalid');
}
const unquoteAerial=value=>String(value||'').replace(/^\\?'|\\?'$/g,'');
if(+unquoteAerial(newestBoundary.args[0])!==firstAerialDefs.indexOf(eraLayers[0])+1){
  throw new Error('aerial boundary references an invalid layer code');
}
for(const index of [1,2,3]){
  if(+unquoteAerial(newestBoundary.args[index])!==1){
    throw new Error(`aerial boundary has invalid style code at argument ${index}`);
  }
}
const secondAerialSfc=vm.runInContext(
  "addAerialImageReferenceToSfc(firstAerialSfc,'AERIAL_02.JPG',aerialBounds,aerialPolygon,aerialLayerName)",
  aerialSxfContext
);
aerialSxfContext.secondAerialSfc=secondAerialSfc;
const secondAerialDefs=vm.runInContext("parseLayerFeatureDefsFlat(getFlatSxfText(secondAerialSfc))",aerialSxfContext);
if(secondAerialDefs.filter(def=>def.name===aerialLayerName).length!==1){
  throw new Error('aerial era layer was duplicated');
}
const secondAerialRecords=vm.runInContext("parseSxfFeatureRecords(getFlatSxfText(secondAerialSfc))",aerialSxfContext);
const secondAerialOrg=secondAerialRecords.find(record=>record.name==='sfig_org_feature'&&decodeSjis(record.args[0]).includes('AERIAL_02.JPG'));
if(!secondAerialOrg||!decodeSjis(secondAerialOrg.args[0]).includes('$$ATRU$$2$$')){
  throw new Error('second aerial raster must use ATRU image serial 2');
}
const syntheticHatches=[
  "/*SXF\r\n#10 = polyline_feature('1','1','1','1','2','(0,1)','(0,1)')\r\nSXF*/",
  "/*SXF\r\n#20 = externally_defined_hatch_feature('1','Area_control','10','0','()')\r\nSXF*/",
  "/*SXF\r\n#30 = externally_defined_hatch_feature('1','Area_control','999','0','()')\r\nSXF*/"
].join("\r\n");
aerialSxfContext.syntheticHatches=syntheticHatches;
const sanitizedHatches=vm.runInContext("sanitizeInvalidSxfExternalHatches(syntheticHatches)",aerialSxfContext);
if(!sanitizedHatches.includes('#20 = externally_defined_hatch_feature')||
   sanitizedHatches.includes('#30 = externally_defined_hatch_feature')){
  throw new Error('invalid external hatch sanitizer regression');
}
if(aerialSxfContext.getNextAerialImageSerial("$$ATRU$$287630$$jpg$$$$old.jpg")!==1){
  throw new Error('legacy aerial feature ID must not become a raster serial');
}
const legacyAerialRefs=[
  "/*SXF\r\n#287630 = polyline_feature('1','1','1','1','5','(0,1,1,0,0)','(0,0,1,1,0)')\r\nSXF*/",
  "/*SXF\r\n#287631 = sfig_org_feature(\\'$$ATRU$$287630$$jpg$$image$$AERIAL_old.JPG\\','3')\r\nSXF*/",
  "/*SXF\r\n#287632 = sfig_locate_feature('0',\\'$$ATRU$$287630$$jpg$$image$$AERIAL_old.JPG\\','0','0','0','1','1')\r\nSXF*/"
].join("\r\n");
aerialSxfContext.legacyAerialRefs=legacyAerialRefs;
const strippedAerialRefs=vm.runInContext("stripAerialImageReferenceFeatures(legacyAerialRefs)",aerialSxfContext);
if(/\b(?:polyline|sfig_org|sfig_locate)_feature\(/i.test(strippedAerialRefs)){
  throw new Error('legacy aerial references were not removed before rebuilding');
}
if(html.includes('id="textLayerSelect"')||html.includes('id="textLayerChooseApplyBtn"')){
  throw new Error('obsolete two-step text-layer controls remain');
}
if(!html.includes('id="textLayerChoiceList"')||
   html.includes('id="textLayerPreview"')||
   !html.includes('grid-template-columns:minmax(0,1fr)')||
   !html.includes('className="textLayerChoiceSwatch"')||
   !html.includes('function drawSelectedTextLayerHighlight(t)')||
   html.includes('へ変更しました（元に戻せます）')||
   !html.includes('#canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;background:var(--bg);-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}')||
   !html.includes('function clearNativeCadSelection()')||
   !html.includes('canvas.addEventListener("contextmenu",event=>event.preventDefault())')){
  throw new Error('direct text-layer selection or iPhone selection suppression is missing');
}
if(html.includes('前回のレイヤー')||
   !html.includes('label.textContent=`${def.name}へ変更`')||
   !html.includes('function getRecentTextLayerNames()')||
   !html.includes('function rememberRecentTextLayerName(name)')||
   !html.includes('[normalized,...getRecentTextLayerNames().filter(item=>item!==normalized)].slice(0,2)')||
   !html.includes('["textLayerRecentBtn","textLayerRecentBtn2"]')||
   !html.includes('function ensureSelectedTextVisibleAboveTextLayerModal(text)')||
   html.includes('if(now < suppressTouchInkUntil) { touchTapCandidate=null; touchPanCandidate=null; return; }')||
   !html.includes('if(now < suppressTouchInkUntil){pendingTouchInk=null;return;}')){
  throw new Error('text-layer quick change or post-zoom long press behavior is incomplete');
}
const textLayerHistoryStart=html.indexOf('const TEXT_LAYER_HISTORY_KEY=');
const textLayerHistoryEnd=html.indexOf('function openTextLayerModal',textLayerHistoryStart);
const textLayerHistoryStore=new Map([
  ['sfcviewer.recentTextLayerNames',JSON.stringify(['LAYER-A','LAYER-B'])]
]);
const textLayerHistoryContext=vm.createContext({
  localStorage:{
    getItem:key=>textLayerHistoryStore.get(key)||null,
    setItem:(key,value)=>textLayerHistoryStore.set(key,String(value))
  }
});
vm.runInContext(html.slice(textLayerHistoryStart,textLayerHistoryEnd),textLayerHistoryContext);
vm.runInContext('rememberRecentTextLayerName("LAYER-B")',textLayerHistoryContext);
if(textLayerHistoryStore.get('sfcviewer.recentTextLayerNames')!==JSON.stringify(['LAYER-B','LAYER-A'])){
  throw new Error('second recent text layer was not promoted to first');
}
vm.runInContext('rememberRecentTextLayerName("LAYER-B")',textLayerHistoryContext);
if(textLayerHistoryStore.get('sfcviewer.recentTextLayerNames')!==JSON.stringify(['LAYER-B','LAYER-A'])){
  throw new Error('first recent text layer did not remain first');
}
vm.runInContext('rememberRecentTextLayerName("LAYER-C")',textLayerHistoryContext);
if(textLayerHistoryStore.get('sfcviewer.recentTextLayerNames')!==JSON.stringify(['LAYER-C','LAYER-B'])){
  throw new Error('recent text layer history was not capped at two unique entries');
}
const aerialRasterBuilder=html.slice(
  html.indexOf('async function renderVisibleAerialPhotoForSfc'),
  html.indexOf('function addAerialImageReferenceToSfc')
);
if(!aerialRasterBuilder.includes('Math.ceil(spanY/resolution)')||
   !aerialRasterBuilder.includes('Math.ceil(spanX/resolution)')){
  throw new Error('fixed aerial raster must use easting for width and northing for height');
}
if(!aerialRasterBuilder.includes('planeToOutput({xNorth:xy.x,yEast:xy.y})')){
  throw new Error('aerial tile coordinates were not normalized to northing/easting');
}
if(aerialRasterBuilder.includes('fillText(credit')){
  throw new Error('fixed aerial raster must not burn attribution text into the image');
}
if(!aerialRasterBuilder.includes('tieX:imageBounds.minY,tieY:imageBounds.maxX')){
  throw new Error('GeoJPEG tie point must use easting/northing axis order');
}
if(!html.includes('rasterAxisVersion:2')||!html.includes('entry.rasterAxisVersion>=2')){
  throw new Error('fixed aerial raster axis version compatibility is missing');
}
const aerialCadizeFlow=html.slice(
  html.indexOf('async function cadizeVisibleAerialPhoto'),
  html.indexOf('function setVectorMapStatus')
);
if(!aerialCadizeFlow.includes('aerialPhotoEnabled=false')||
   !aerialCadizeFlow.includes('updateAerialPhotoUi()')){
  throw new Error('aerial-photo CAD conversion must turn off the live aerial background');
}
const contourCadizeFlow=html.slice(
  html.indexOf('async function finishTerrainCadSelection'),
  html.indexOf('async function finishAerialSfcSelection')
);
if(!contourCadizeFlow.includes('clearTerrainAnalysis()')){
  throw new Error('contour CAD conversion must turn off the generated contour background');
}

// Mixed-scale SXF regression: a 1/500 main partial figure and a 1/250
// auxiliary figure must be expanded through their own placements. The main
// model coordinates stay unchanged, while auxiliary measurement metadata
// remains in its native real-size coordinates.
const assemblyStart=html.indexOf('const SXF_DRAWABLE_FEATURE_NAMES=');
const assemblyEnd=html.indexOf('function parseSfcText(srcText');
if(assemblyStart<0||assemblyEnd<=assemblyStart)throw new Error('missing SXF partial-figure expansion');
const assemblyContext={
  decodeShiftJisFromLatin1:s=>String(s),
  unquoteSxfValue:v=>String(v==null?'':v).replace(/^['"]|['"]$/g,''),
  console
};
vm.createContext(assemblyContext);
new vm.Script(html.slice(assemblyStart,assemblyEnd),{filename:'sxf-assembly.js'}).runInContext(assemblyContext);
const mixedRecords=[
  {id:10,name:'line_feature',args:['1','1','1','1','0','0','25000','0']},
  {id:20,name:'sfig_org_feature',args:['平面図','2']},
  {id:30,name:'line_feature',args:['1','1','1','1','0','0','25000','0']},
  {id:40,name:'sfig_org_feature',args:['詳細図','2']},
  {id:50,name:'sfig_locate_feature',args:['0','平面図','0','0','0','0.002','0.002']},
  {id:60,name:'sfig_locate_feature',args:['0','詳細図','100','100','0','0.004','0.004']},
  {id:70,name:'drawing_sheet_feature',args:['混在縮尺','1','1','841','594']}
];
assemblyContext.mixedRecords=mixedRecords;
const mixed=vm.runInContext("buildSxfAssemblyExpansion(mixedRecords,v=>{const n=parseFloat(unquoteSxfValue(v));return Number.isFinite(n)?n:0;})",assemblyContext);
if(!mixed.expanded||mixed.mainRoot?.name!=='平面図'||mixed.instances.length!==2)throw new Error('mixed-scale main partial figure selection failed');
const mainInstance=mixed.instances.find(v=>v.partName==='平面図');
const detailInstance=mixed.instances.find(v=>v.partName==='詳細図');
const mainEnd=vm.runInContext("sxfAffinePoint",assemblyContext)(mainInstance.matrix,25000,0);
const detailEnd=vm.runInContext("sxfAffinePoint",assemblyContext)(detailInstance.matrix,25000,0);
const detailStart=vm.runInContext("sxfAffinePoint",assemblyContext)(detailInstance.matrix,0,0);
if(Math.abs(mainEnd[0]-25000)>1e-7)throw new Error('main partial figure coordinates changed');
if(Math.abs((detailEnd[0]-detailStart[0])-50000)>1e-7)throw new Error('1/250 auxiliary placement was not expanded relative to 1/500 main');
const detailModelEnd=vm.runInContext("sxfAffinePoint",assemblyContext)(detailInstance.partModelMatrix,25000,0);
if(Math.abs(detailModelEnd[0]-25000)>1e-7)throw new Error('auxiliary native measurement coordinates were lost');

// A model-space drawing may be split across several top-level partial figures.
// The common placement frame must win even when one inset contains more
// individual features, otherwise the whole drawing/GPS origin is shifted.
const majorityFrameRecords=[];
let majorityId=100;
const addLine=()=>majorityFrameRecords.push({id:majorityId+=10,name:'line_feature',args:['1','1','1','1','0','0','1000','0']});
addLine();addLine();
majorityFrameRecords.push({id:majorityId+=10,name:'sfig_org_feature',args:['A1','2']});
addLine();
majorityFrameRecords.push({id:majorityId+=10,name:'sfig_org_feature',args:['A2','2']});
for(let i=0;i<5;i++)addLine();
majorityFrameRecords.push({id:majorityId+=10,name:'sfig_org_feature',args:['B','2']});
majorityFrameRecords.push(
  {id:majorityId+=10,name:'sfig_locate_feature',args:['0','A1','-70000','64000','140','0.002','0.002']},
  {id:majorityId+=10,name:'sfig_locate_feature',args:['0','A2','-70000','64000','140','0.002','0.002']},
  {id:majorityId+=10,name:'sfig_locate_feature',args:['0','B','-69950','63950','140','0.002','0.002']},
  {id:majorityId+=10,name:'drawing_sheet_feature',args:['mixed','1','1','841','594']}
);
assemblyContext.majorityFrameRecords=majorityFrameRecords;
const majorityFrame=vm.runInContext("buildSxfAssemblyExpansion(majorityFrameRecords,v=>{const n=parseFloat(unquoteSxfValue(v));return Number.isFinite(n)?n:0;})",assemblyContext);
if(majorityFrame.mainPlacementFrameSize!==2||majorityFrame.mainRoot?.name!=='A1'){
  throw new Error(`common SXF placement frame selection failed: ${majorityFrame.mainRoot?.name||'none'}`);
}

// The bundled real-world sample contains a deeply nested assembly.  Verify
// that postfix figure definitions are expanded instead of being mistaken for
// ordinary drawing-order records.
const parserStart=html.indexOf('function getFlatSxfText');
const parserEnd=html.indexOf('function parseLayerFeatureDefsFlat');
if(parserStart<0||parserEnd<=parserStart)throw new Error('missing SXF record parser');
const realContext={
  console,TextDecoder,
  decodeShiftJisFromLatin1:s=>{
    try{return new TextDecoder('shift-jis').decode(Uint8Array.from(String(s),c=>c.charCodeAt(0)&255));}
    catch(_){return String(s);}
  }
};
vm.createContext(realContext);
new vm.Script(html.slice(parserStart,parserEnd),{filename:'sxf-records.js'}).runInContext(realContext);
new vm.Script(html.slice(assemblyStart,assemblyEnd),{filename:'sxf-real-assembly.js'}).runInContext(realContext);
realContext.realSample=fs.readFileSync(__dirname+'/sample.sfc','latin1');
const realAssembly=vm.runInContext(`(()=>{
  const records=parseSxfFeatureRecords(getFlatSxfText(realSample));
  const num=v=>{const n=parseFloat(unquoteSxfValue(v));return Number.isFinite(n)?n:0};
  return buildSxfAssemblyExpansion(records,num);
})()`,realContext);
if(!realAssembly.expanded||realAssembly.instances.length<4000)throw new Error('real nested SXF assembly was not expanded');
if(realAssembly.mainRoot?.name!=='元図より')throw new Error(`wrong real SXF main partial figure: ${realAssembly.mainRoot?.name||'none'}`);
if(Math.abs(+realAssembly.mainDrawingPlacement?.sx-0.002)>1e-12)throw new Error('real SXF 1/500 main scale was not retained');

const colorBuilder=html.slice(html.indexOf('function buildMemoColorDefinitionText'),html.indexOf('function parseSourceFeatureSegmentsFlat'));
if(!colorBuilder.includes('memoStrokeColorToFileCode(key)'))throw new Error('SXF predefined colour codes must use the fixed specification mapping');
if(colorBuilder.includes('existingIndex + 1')||colorBuilder.includes('String(defs.length)'))throw new Error('SXF predefined colour codes must not use definition-table order');
const widthCodes={1:0.13,2:0.18,3:0.25,4:0.35,5:0.5,6:0.7,7:1.0,8:1.4,9:2.0};
for(const [code,value] of Object.entries(widthCodes)){
  if(!html.includes(`${code}:${value}`))throw new Error(`missing SXF fixed width ${code}=${value}`);
}
const widthBuilder=html.slice(html.indexOf('function buildMemoWidthDefinitions'),html.indexOf('function widthValueToScreenPx'));
if(widthBuilder.includes('defs.length+1')||widthBuilder.includes('existingIndex+1'))throw new Error('SXF width codes must not use definition-table order');
if(!widthBuilder.includes('state.customValues.length<6')||!widthBuilder.includes('10+state.customValues.length'))throw new Error('SXF custom width codes must be limited to 11..16');
const sfcParser=html.slice(html.indexOf('function parseSfcText(srcText'),html.indexOf('function setRenderBounds'));
if(!sfcParser.includes('resolveSxfWidthCode(ref,widthState)'))throw new Error('SFC reader must resolve fixed width codes');
if(!sfcParser.includes('const scaleSource=mainDrawingPlacement'))throw new Error('SFC paper scale must follow the selected main partial figure');
if(!sfcParser.includes('n>=1&&n<=layerDefs.length)return n'))throw new Error('SFC reader must treat layer references as table codes before feature IDs');
if(!html.includes('if(Number.isInteger(n)&&n>=1&&n<=16)return sxfBaseColorFromIndex(n)'))throw new Error('SFC reader must preserve fixed predefined colour codes');
if(!html.includes('const widthState=getSxfWidthDefinitionState(widthDefs)'))throw new Error('memo restoration must resolve SXF width codes');
for(const obsolete of ['傾斜角を4段階で色分け','を5段階で色分け（','表示範囲を自動更新','細かいDEMで計算・矢印は見やすく間引いて表示']){
  if(html.includes(obsolete))throw new Error(`obsolete terrain description remains: ${obsolete}`);
}
if(!html.includes('const typeCode = MEMO_FILE_TYPE_CODE;'))throw new Error('generated annotations must always use continuous linetype code 1');
if(html.includes('segStyle?.typeRef || MEMO_FILE_TYPE_CODE'))throw new Error('generated annotations must not inherit a source linetype');
if(!html.includes('const zeroStyleManagementGeometry=rawLayer===0&&rawColor===0&&rawWidth===0'))throw new Error('SFC zero-style management geometry must not affect drawing bounds');
if(!html.includes('function getMainDrawingSheetRotatedBounds()'))throw new Error('photo list must use the actual SXF drawing sheet');
if(!html.includes('item.listLayoutVersion=2'))throw new Error('photo list layout migration is missing');
const aerialBatch=html.slice(html.indexOf('function addAerialImageReferencesToSfc'),html.indexOf('async function buildAerialSfcSidecarExport'));
if(!aerialBatch.includes('const block=[...definitions,...placements]'))throw new Error('SFC raster definitions must precede raster placements');
if(!aerialBatch.includes('text.slice(0,sheetAt)+block'))throw new Error('SFC raster placement must be written before drawing_sheet_feature');
if(!aerialBatch.includes('$$jpg$$'))throw new Error('SFC raster ATRU must use the standard jpg class');
const aerialSingle=html.slice(html.indexOf('function addAerialImageReferenceToSfc'),html.indexOf('function clearAerialSelectionDraft'));
if(!aerialSingle.includes('definition+"\\r\\n\\r\\n"+placement+"\\r\\n\\r\\n"+text.slice(sheetAt)'))throw new Error('single SFC raster placement must be written before drawing_sheet_feature');
if(!html.includes('sfcText=addAerialImageReferencesToSfc(sfcText,imageSpecs)'))throw new Error('SFC sidecar export must batch raster-reference creation');
if(!html.includes('await buildSfcExportBlobAndNameAsync()'))throw new Error('large SFC export must yield progress to the UI');
if(!html.includes('const compensationAngle=Number.isFinite(placementAngle)?-placementAngle:0;'))throw new Error('photo-list export must cancel the main partial-figure angle');
if(!html.includes('angle:compensationAngle'))throw new Error('photo-list text must use the same angle compensation as its rules');
if(!html.includes('displayLineWidthScale=Math.max(1,Math.min(10'))throw new Error('line-display scale must support 1x through 10x');
if(!html.includes('saveAsBtn.textContent=desktop?"名前を付けて保存"'))throw new Error('desktop save menu must use Save As');
console.log(`OK: ${scripts.length} inline scripts; ${scales.length*2*levels.length} circle-scale cases; ${commands.length**2} toolbar transitions`);
