const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync(__dirname+'/index.html','utf8');

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

const commands=['openIconBtn','gpsBtn','measureBtn','profileBtn','drawBtn','textSearchOpenBtn','helpBtn','layerFab','bgBtn','gpsDetailFab','supportBtn'];
const surfaces=['file','measure','profile','draw','search','help','layer','background','gpsDetail','support'];
const keep={openIconBtn:'file',measureBtn:'measure',profileBtn:'profile',drawBtn:'draw',textSearchOpenBtn:'search',helpBtn:'help',layerFab:'layer',bgBtn:'background',gpsDetailFab:'gpsDetail',supportBtn:'support'};
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
  'name:"等高線_主曲線"',
  'name:"等高線_計曲線"',
  'splitTerrainCadPolyline(points,500)',
  'isTerrainContour: !!s.isTerrainContour',
  'const typeCode = MEMO_FILE_TYPE_CODE;'
  ,'showToast("CAD化しました",1800)'
  ,'recordEditAction({type:"ink-add",strokes:list,revivedLayerNames,label})'
  ,'type:"layer-delete"'
  ,'className="layerItemDelete"'
  ,'function stripDeletedLayersFromSfc'
  ,'stripDeletedLayersFromSfc(stripEmbeddedAnnotations'
];
for(const token of required)if(!html.includes(token))throw new Error(`missing implementation: ${token}`);
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
if(!sfcParser.includes('n>=1&&n<=layerDefs.length)return n'))throw new Error('SFC reader must treat layer references as table codes before feature IDs');
if(!html.includes('if(Number.isInteger(n)&&n>=1&&n<=16)return sxfBaseColorFromIndex(n)'))throw new Error('SFC reader must preserve fixed predefined colour codes');
if(!html.includes('const widthState=getSxfWidthDefinitionState(widthDefs)'))throw new Error('memo restoration must resolve SXF width codes');
for(const obsolete of ['傾斜角を4段階で色分け','を5段階で色分け（','表示範囲を自動更新','細かいDEMで計算・矢印は見やすく間引いて表示']){
  if(html.includes(obsolete))throw new Error(`obsolete terrain description remains: ${obsolete}`);
}
if(!html.includes('const typeCode = MEMO_FILE_TYPE_CODE;'))throw new Error('generated annotations must always use continuous linetype code 1');
if(html.includes('segStyle?.typeRef || MEMO_FILE_TYPE_CODE'))throw new Error('generated annotations must not inherit a source linetype');
if(!html.includes('const zeroStyleManagementGeometry=rawLayer===0&&rawColor===0&&rawWidth===0'))throw new Error('SFC zero-style management geometry must not affect drawing bounds');
console.log(`OK: ${scripts.length} inline scripts; ${scales.length*2*levels.length} circle-scale cases; ${commands.length**2} toolbar transitions`);
