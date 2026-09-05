const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=__dirname;
const server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));
});
let browser;
const sim='A01,1,P1,100,100,10,\nA01,2,P2,110,100,10,\nA01,3,P3,110,110,10,\nD00,1,PARCEL,1,\nB01,1,P1,\nB01,2,P2,\nB01,3,P3,\nD99,\n';
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const settle=()=>page.evaluate(async()=>{for(let i=0;i<100&&(recoveryDbFlushBusy||recoveryDbPendingRecord);i++)await new Promise(r=>setTimeout(r,20));});
  const restore=async()=>{
    await settle();await page.reload();
    await page.waitForFunction(()=>!document.getElementById('startupRecoveryBtn').disabled);
    assert.equal(await page.evaluate(()=>restoreLatestRecoveryWork()),true);
  };
  const gps=await page.evaluate(()=>{
    enterGpsOnlyBlankMode();gpsEnabled=true;gpsDetailOpen=true;
    gpsPosition={lat:34.1,lon:134.5,zone:4,x:-100.123,y:-200.456,sfcX:-200.456,sfcY:-100.123,altitude:50,accuracy:.015,timestamp:Date.now()};
    setDroggerOwnerMode(true);playDroggerRegisterBeep=()=>{};
    document.getElementById('droggerPointName').value='P1';registerCurrentDroggerCoordinate();
    const csv=DroggerOwnerMode.buildCsv(getDroggerCoordinateRecords());
    const attack=DroggerOwnerMode.buildCsv([{name:'=1+1',x:-1,y:-2}]);
    return {saved:saveRecoverySnapshot({immediate:true}),count:getDroggerCoordinateRecords().length,csv,attack};
  });
  assert.equal(gps.saved,true);assert.equal(gps.count,1);
  assert(!gps.csv.includes("'-100.123"));assert(gps.csv.includes('-100.123'));
  assert(gps.attack.includes("'=1+1"));
  await restore();
  assert.deepEqual(await page.evaluate(()=>({count:getDroggerCoordinateRecords().length,strokes:inkStrokes.length,blank:gpsOnlyBlankMode,scale:getDroggerWorldUnitsPerPaperMm()})),{count:1,strokes:5,blank:true,scale:500});
  await page.evaluate(async sim=>{
    clearLoadedState();resetSessionFromLoad();
    await loadSimaFile(new File([sim],'regression.sim'));
  },sim);
  await page.waitForTimeout(120);
  const sima=await page.evaluate(async()=>{
    const point=simaMapState.points[0],screen=worldToScreen(point.x,point.y);
    const snap={point:!!findNearestPoint(...screen),end:!!findNearestVisibleEndpoint(...screen),line:!!projectPointToNearestIndexedSegment(...screen)};
    simaDisplayEnabled=false;
    snap.hidden=!findNearestPoint(...screen)&&!findNearestVisibleEndpoint(...screen)&&!projectPointToNearestIndexedSegment(...screen);
    simaDisplayEnabled=true;
    inkStrokes.push({type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:100000,y:100000},{x:110000,y:110000}]});markMemoChanged();
    await loadSimaFile(new File(['not sima'],'bad.sim'));
    return {...snap,name:simaMapState.sourceName};
  });
  assert.deepEqual(sima,{point:true,end:true,line:true,hidden:true,name:'regression.sim'});
  await restore();
  assert.deepEqual(await page.evaluate(()=>({sima:hasLoadedSimaWorkspace(),name:simaMapState.sourceName,ink:inkStrokes.some(s=>s.color==='#123456')})),{sima:true,name:'regression.sim',ink:true});
  await page.evaluate(async()=>handleLoadedSource(await (await fetch('sample.sfc')).text(),'sample.sfc',null,{restoreRecovery:false}));
  const changed=await page.evaluate(async()=>{
    const original=loadedSfcText,key=getRecoveryStorageKey();
    const text=data.texts.find(t=>Number.isFinite(+t._sxfFeatureId));
    const layer=getEditableSxfLayerDefs().find(l=>l.code!==+text._sxfSourceLayerCode);
    selectedTextForLayerChange=text;
    applySelectedTextLayerChange(layer.code,layer.name,text._sxfSourceColorCode||text.color||1);
    const expected=data.texts.find(t=>t._sxfFeatureId===text._sxfFeatureId).layer;
    const newKey=getRecoveryStorageKey();saveRecoverySnapshot({immediate:true});
    await handleLoadedSource('not sfc','bad.sfc',null);
    return {id:text._sxfFeatureId,expected,changed:loadedSfcText!==original,keyChanged:key!==newKey,retained:data.source_name==='sample.sfc'};
  });
  assert(changed.changed&&changed.keyChanged&&changed.retained);
  await restore();
  assert.equal(await page.evaluate(id=>data.texts.find(t=>t._sxfFeatureId===id)?.layer,changed.id),changed.expected);
  // Legacy fingerprints must remain readable after the new full-source hash.
  assert(await page.evaluate(()=>{const payload=buildRecoveryPayload();payload.fingerprint=computeLegacyRecoveryFingerprint();return applyRecoveryPayload(payload);}));
  await page.evaluate(()=>{closePanelsExcept('none');document.getElementById('envNotice').style.display='block';updateWrapLayout();});
  assert(await page.evaluate(()=>document.getElementById('wrap').getBoundingClientRect().bottom<=innerHeight+1));
  await page.locator('#bgBtn').click({force:true});
  assert(await page.evaluate(()=>{const panel=document.getElementById('aerialPhotoPanel');panel.scrollTop=panel.scrollHeight;return document.getElementById('simaMapOpenBtn').getBoundingClientRect().bottom<=innerHeight+1;}));
  const zones=await page.evaluate(async()=>{
    ensureProj4Defs=()=>true;saveDrawingCoordinateSetting('4');gpsEnabled=true;gpsTemporaryCoordinateZone=6;profileZone=6;
    const resolved=await resolveProfileZone();await activateHazardMap('flood');return {resolved,hazard:hazardMapZone,manual:getManualCoordinateZone()};
  });
  assert.deepEqual(zones,{resolved:6,hazard:6,manual:4});
  assert.equal(await page.evaluate(async()=>{gpsEnabled=false;gpsTemporaryCoordinateZone=null;return resolveProfileZone();}),4);
  const arc="/*SXF\n#40 = layer_feature('audit','1')\nSXF*/\n/*SXF\n#50 = arc_feature('1','1','1','1','0','0','10000','1','0','90')\nSXF*/";
  await page.evaluate(async src=>handleLoadedSource(src,'arc.sfc',null,{restoreRecovery:false}),arc);
  assert.deepEqual(await page.evaluate(()=>({arcs:data.arcs.length,loaded:hasLoadedDrawing()})),{arcs:1,loaded:true});
  console.log('Audit regressions passed: GPS/SIMA recovery, text-layer recovery, CSV, failed imports, SIMA snap, landscape, GPS zone priority, arc workspace');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
