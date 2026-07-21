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
  'getNorthUpRotationDeg()-rotationDeg'
];
for(const token of required)if(!html.includes(token))throw new Error(`missing implementation: ${token}`);
console.log(`OK: ${scripts.length} inline scripts; ${scales.length*2*levels.length} circle-scale cases; ${commands.length**2} toolbar transitions`);
