// Synthetic data only. No device location, customer drawings, or external services.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=__dirname;
const source="/*SXF\n#40 = layer_feature('audit','1')\nSXF*/\n/*SXF\n#50 = line_feature('1','1','1','1','0','0','10000','0')\nSXF*/";
const sim='A01,1,P1,100,100,10,\nA01,2,P2,110,100,10,\nA01,3,P3,110,110,10,\nD00,1,PARCEL,1,\nB01,1,P1,\nB01,2,P2,\nB01,3,P3,\nD99,\n';
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(fs.readFileSync(file));
});
let browser,base,entryUrl,failures=0;
async function settle(page){
  await page.waitForFunction(()=>!recoveryDbFlushBusy&&!recoveryDbPendingRecord&&(!window.recoveryDbPendingByKey||!recoveryDbPendingByKey.size));
}
async function run(name,fn,mobile){
  const platform=mobile==='iphone'?'iPhone-like':mobile?'Android-like':'Desktop';
  const page=await browser.newPage(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:mobile==='iphone'?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Linux; Android 12; Synthetic) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'}:{viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/^https?:\/\//,route=>route.request().url().startsWith(base)?route.continue():route.abort());
  try{
    await page.goto(entryUrl,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof loadSimaFile==='function');
    await fn(page);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${platform}: ${name}`);
  }catch(error){failures++;console.error(`FAIL ${platform}: ${name}\n${error.stack}`);}
  finally{await page.close();}
}
async function register(page,withDrawing){
  return page.evaluate(async({source,withDrawing})=>{
    if(withDrawing)await handleLoadedSource(source,'base.sfc',null,{restoreRecovery:false});
    else enterGpsOnlyBlankMode();
    gpsEnabled=true;gpsDetailOpen=true;
    gpsPosition={lat:34,lon:134,zone:4,x:100,y:100,sfcX:100,sfcY:100,altitude:42.010,accuracy:.01,timestamp:Date.now()};
    getCurrentDroggerGeoidHeight=()=>40;setDroggerOwnerMode(true);playDroggerRegisterBeep=()=>{};
    document.getElementById('droggerPointName').value='P1';registerCurrentDroggerCoordinate();
    return getDroggerCoordinateRecords().length;
  },{source,withDrawing});
}
async function exportState(page){
  return page.evaluate(async()=>{
    const before=JSON.stringify(getDroggerCoordinateRecords());
    const ann=buildSfcAnnotations(prepareSfcExportBase());
    const output=await buildSfcExportBlobAndNameAsync();
    if(!output.ok)return {ok:false,reason:output.reason};
    const records=parseSxfFeatureRecords(getFlatSxfTextIncludingGenerated(output.text));
    const generated=parseSxfFeatureRecords(getFlatSxfText(ann.lineText));
    const counts=ann.expectedFeatureCounts;
    const textRemoved=output.text.replace(/\/\*SXF\r?\n#\d+ = text_string_feature\([^]*?\r?\nSXF\*\//,'');
    const circleRemoved=output.text.replace(/\/\*SXF\r?\n#\d+ = circle_feature\([^]*?\r?\nSXF\*\//,'');
    // Other CADs ignore our comment markers: parse actual SXF without the
    // viewer-only metadata suppression to verify the written geometry itself.
    const rawText=output.text.replace(/\/\*\s*---\s*sfcviewer_generated_(?:begin|end)\s*---\s*\*\//g,'');
    const raw=parseSfcText(rawText,'export.sfc');
    const labels=records.filter(r=>r.name==='text_string_feature').map(r=>({text:unquoteSxfValue(r.args[3]),height:Number(unquoteSxfValue(r.args[6]))}));
    const meta=parseMemoMetaPayload(output.text);
    return {ok:true,counts,labels,geometryCount:generated.filter(r=>['circle_feature','polyline_feature'].includes(r.name)).length,
      unchanged:before===JSON.stringify(getDroggerCoordinateRecords()),rawGeometry:hasDrawingGeometry(raw),paperScale:raw._drawingToPaperScale,
      missingTextRejected:!validateGeneratedMemoSfc(textRemoved,counts).ok,missingCircleRejected:!validateGeneratedMemoSfc(circleRemoved,counts).ok,
      metadataElevation:meta?.strokes?.find(s=>s.droggerRecord)?.droggerRecord?.elevation};
  });
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}/`;
  entryUrl=process.env.EZ_VIEWER_TEST_URL||base;
  if(process.env.EZ_VIEWER_TEST_URL)base=new URL('.',entryUrl).href;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  for(const mobile of [false,true,'iphone']){
    await run('A01 invalid SFZ preserves images, source and saved work',async page=>{
      const result=await page.evaluate(async source=>{
        await handleLoadedSource(source,'base.sfc',null,{restoreRecovery:false});
        const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;
        aerialCadImages=[normalizeAerialCadImageEntry({id:'synthetic-aerial',layerName:'synthetic-image',jpegDataUrl:canvas.toDataURL('image/jpeg'),bounds:{minX:0,maxX:10,minY:0,maxY:10}})];
        saveRecoverySnapshot({immediate:true});
        const before=JSON.stringify({source:loadedSfcText,images:aerialCadImages}),messages=[];
        showToast=text=>messages.push(text);
        const zip=await createZipFromFiles([{name:'invalid.sfc',blob:new Blob(['not an SFC drawing'])}]);
        await handleLoadedSfzFile(new File([zip],'invalid.sfz'));
        return {unchanged:before===JSON.stringify({source:loadedSfcText,images:aerialCadImages}),savedImages:JSON.parse(localStorage.getItem(getRecoveryStorageKey())).aerialCadImages.length,messages};
      },source);
      assert.equal(result.unchanged,true);assert.equal(result.savedImages,1);
      assert(!result.messages.some(message=>message.startsWith('SFZを開きました')));
    },mobile);
    await run('A01 failed SFZ image read does not commit incoming drawing',async page=>{
      const result=await page.evaluate(async source=>{
        await handleLoadedSource(source,'old.sfc',null,{restoreRecovery:false});
        inkStrokes=[{type:'freehand',color:'#123456',points:[{x:1,y:1},{x:2,y:2}]}];markMemoChanged();
        const before=JSON.stringify({source:loadedSfcText,name:data.source_name,ink:inkStrokes});
        extractAerialCadImagesFromSfz=async()=>{throw new Error('synthetic broken image stream');};
        const zip=await createZipFromFiles([{name:'new.sfc',blob:new Blob([source])}]);
        let rejected=false;
        try{await handleLoadedSfzFile(new File([zip],'broken.sfz'));}catch(error){rejected=true;}
        return {rejected,unchanged:before===JSON.stringify({source:loadedSfcText,name:data.source_name,ink:inkStrokes})};
      },source);
      assert.deepEqual(result,{rejected:true,unchanged:true});
    },mobile);
    await run('A01 valid SFZ stages images in INCOMING drawing frame',async page=>{
      const result=await page.evaluate(async source=>{
        const definitions="/*SXF\n#10 = pre_defined_colour_feature('black')\nSXF*/\n/*SXF\n#20 = pre_defined_font_feature('continuous')\nSXF*/\n/*SXF\n#30 = width_feature('0.130000')\nSXF*/\n";
        const sheet=definitions+source+"\n/*SXF\n#60 = sfig_org_feature('SYNTHETIC','2')\nSXF*/\n/*SXF\n#70 = sfig_locate_feature('0','SYNTHETIC','0','0','0','1','1')\nSXF*/\n/*SXF\n#80 = drawing_sheet_feature('','0','1','297','210')\nSXF*/";
        await handleLoadedSource(sheet,'base.sfc',null,{restoreRecovery:false});
        const bounds={minX:0,maxX:10,minY:0,maxY:10};
        const imageSource=addAerialImageReferencesToSfc(sheet,[{jpegFileName:'1.jpg',bounds,layerName:'synthetic-aerial'}]);
        const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;
        const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
        const zip=await createZipFromFiles([{name:'valid.sfc',blob:new Blob([latin1StringToBytes(imageSource)])},{name:'1.jpg',blob:jpeg}]);
        activeCoordinateMeshTransform={kind:'affine',xNorth:{a:2,b:0,offset:100},yEast:{a:0,b:2,offset:200}};
        gpsTemporaryCoordinateZone=3;
        await handleLoadedSfzFile(new File([zip],'valid.sfz'));
        return {name:data.source_name,count:aerialCadImages.length,bounds:aerialCadImages[0]?.bounds};
      },source);
      assert.equal(result.name,'valid.sfc');assert.equal(result.count,1);
      for(const [key,value] of Object.entries({minX:0,maxX:10,minY:0,maxY:10}))assert(Math.abs(result.bounds[key]-value)<1e-6);
    },mobile);
    await run('A02/A04 Drogger final SFC validates geometry AND text; values unchanged',async page=>{
      assert.equal(await register(page,true),1);
      const result=await exportState(page);
      assert.equal(result.ok,true,result.reason);assert.equal(result.geometryCount,3);
      assert.equal(result.counts.text_string_feature,2);
      assert(result.labels.some(label=>label.text==='P1'));assert(result.labels.some(label=>label.text==='2.01'));
      assert.equal(result.missingTextRejected,true);assert.equal(result.missingCircleRejected,true);
      assert.equal(result.rawGeometry,true);assert.equal(result.unchanged,true);
      assert(Math.abs(result.metadataElevation-2.010)<1e-10);
    },mobile);
    await run('A03 GPS-only registered work enables save/share and exports at 1/500',async page=>{
      const empty=await page.evaluate(()=>{enterGpsOnlyBlankMode();setSaveMenuOpen(true);return document.getElementById('saveMenuSaveAsBtn').disabled;});
      assert.equal(empty,true);
      assert.equal(await register(page,false),1);
      const buttons=await page.evaluate(()=>{setSaveMenuOpen(true);return ['saveMenuOverwriteBtn','saveMenuSaveAsBtn','saveMenuAndroidShareBtn'].map(id=>document.getElementById(id).disabled);});
      assert.deepEqual(buttons,[false,false,false]);
      const result=await exportState(page);assert.equal(result.ok,true,result.reason);
      assert.equal(result.rawGeometry,true);assert.equal(result.unchanged,true);
      assert.equal(result.paperScale,.002);
      assert(result.labels.every(label=>label.height===900));
      if(mobile===true){
        const shared=await page.evaluate(async()=>{await prepareAndroidSfcZipShare();return !!pendingAndroidZipShare?.blob?.size;});
        assert.equal(shared,true);
      }
      const roundTrip=await page.evaluate(async()=>{
        const output=await buildSfcExportBlobAndNameAsync();
        const before=getDroggerCoordinateRecords();
        await handleLoadedSource(output.text,'gps-work.sfc',null,{restoreRecovery:false});
        const next=await buildSfcExportBlobAndNameAsync();
        const records=next.ok?parseSxfFeatureRecords(getFlatSxfTextIncludingGenerated(next.text)):[];
        return {ok:next.ok,unchanged:JSON.stringify(before)===JSON.stringify(getDroggerCoordinateRecords()),
          units:getDroggerWorldUnitsPerPaperMm(),heights:records.filter(r=>r.name==='text_string_feature').map(r=>Number(unquoteSxfValue(r.args[6]))),
          radii:records.filter(r=>r.name==='circle_feature').map(r=>Number(unquoteSxfValue(r.args[6])))};
      });
      assert.equal(roundTrip.ok,true);assert.equal(roundTrip.unchanged,true);
      assert.equal(roundTrip.units,500);assert.deepEqual(roundTrip.heights,[900,900]);assert.deepEqual(roundTrip.radii,[200]);
    },mobile);
    await run('A02 registry CAD parcel labels survive FINAL SFC export',async page=>{
      const result=await page.evaluate(async source=>{
        await handleLoadedSource(source,'base.sfc',null,{restoreRecovery:false});
        registryMapState=registryEmptyState();registryMapState.loaded=true;
        registryMapState.parcels=[{id:'synthetic-parcel',rings:[[{x:1000,y:1000},{x:9000,y:1000},{x:9000,y:9000},{x:1000,y:9000},{x:1000,y:1000}]],centroid:{x:5000,y:5000},metadata:{lotNumber:'123-4'}}];
        registryMapState.looseLines=[{points:[{x:0,y:5000},{x:10000,y:5000}]}];registryMapState.points=[{x:2000,y:2000}];
        registryMapDisplayEnabled=true;registryLayerVisibility={parcel:true,boundary:true,point:true,label:true};
        terrainCadPolygon=[{x:500,y:500},{x:9500,y:500},{x:9500,y:9500},{x:500,y:9500}];polygonSelectionPurpose='registry';
        await finishRegistryCadSelection();
        const out=await buildSfcExportBlobAndNameAsync();
        return {ok:out.ok,reason:out.reason,texts:out.ok?parseSxfFeatureRecords(getFlatSxfTextIncludingGenerated(out.text)).filter(r=>r.name==='text_string_feature').map(r=>unquoteSxfValue(r.args[3])):[]};
      },source);
      assert.equal(result.ok,true,result.reason);assert(result.texts.includes('123-4'));
    },mobile);
    await run('A02 degenerate geometry still fails final validation',async page=>{
      const result=await page.evaluate(async source=>{
        await handleLoadedSource(source,'base.sfc',null,{restoreRecovery:false});
        inkStrokes=[{type:'freehand',color:'#123456',points:[{x:1,y:1},{x:1,y:1}]}];
        return (await buildSfcExportBlobAndNameAsync()).ok;
      },source);
      assert.equal(result,false);
    },mobile);
    await run('A05 photo import and position editing use drawing zone, including distant GPS',async page=>{
      const result=await page.evaluate(async source=>{
        await handleLoadedSource(source,'photo-test.sfc',null,{restoreRecovery:false});
        saveDrawingCoordinateSetting('4');
        readPhotoExif=async()=>({lat:34.396,lon:132.459,direction:0,capturedAt:''});
        const used=[];latLonToJgd2024XY=(lat,lon,zone)=>{used.push(zone);return {x:4000,y:8000};};
        jgd2024XYToLatLon=(x,y,zone)=>{used.push(zone);return {lat:34.396,lon:132.459};};
        ensurePhotoDemElevations=async()=>{};
        activeCoordinateMeshTransform={kind:'affine',xNorth:{a:2,b:0,offset:100},yEast:{a:0,b:2,offset:200}};
        gpsTemporaryCoordinateZone=3;
        await importGeotaggedPhotos([new File(['synthetic'],'synthetic.jpg',{type:'image/jpeg'})]);
        const item=photoAnnotations[0],before=[item.xNorth,item.yEast];
        applyPhotoAdjustedWorldPosition(item,item.worldX,item.worldY);
        return {used,stored:item.coordinateZone,before,after:[item.xNorth,item.yEast],gpsZone:gpsTemporaryCoordinateZone};
      },source);
      assert.deepEqual(result.used,[4,4]);assert.equal(result.stored,4);assert.equal(result.gpsZone,3);
      assert.deepEqual(result.after,result.before);
    },mobile);
    await run('A06 latest SIMA import wins; clear and SFC load cancel pending imports',async page=>{
      const result=await page.evaluate(async({source,sim})=>{
        let release;
        const first=loadSimaFile({name:'first.sim',arrayBuffer:()=>new Promise(resolve=>release=resolve)});
        await loadSimaFile(new File([sim],'second.sim'));
        release(new TextEncoder().encode(sim).buffer);await first;
        const latest=simaMapState.sourceName;
        const pending=loadSimaFile({name:'late.sim',arrayBuffer:()=>new Promise(resolve=>release=resolve)});
        await handleLoadedSource(source,'new.sfc',null,{restoreRecovery:false});
        release(new TextEncoder().encode(sim).buffer);await pending;
        const cleared=!simaMapState.loaded;
        const pendingClear=loadSimaFile({name:'late-clear.sim',arrayBuffer:()=>new Promise(resolve=>release=resolve)});
        clearSimaData();release(new TextEncoder().encode(sim).buffer);await pendingClear;
        return {latest,cleared,explicitClear:!simaMapState.loaded};
      },{source,sim});
      assert.deepEqual(result,{latest:'second.sim',cleared:true,explicitClear:true});
    },mobile);
    await run('A07 SFC+SIMA+edits+display settings recover together; no repeated source in snapshots',async page=>{
      const before=await page.evaluate(async({source,sim})=>{
        await handleLoadedSource(source,'base.sfc',null,{restoreRecovery:false});
        await loadSimaFile(new File([sim],'overlay.sim'));
        simaLayerColors.boundary='#123456';simaPointLabelSize=23;simaDisplayEnabled=false;
        inkStrokes.push({type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:100000,y:100000},{x:110000,y:110000}]});
        markMemoChanged();const first=buildRecoveryPayload();saveRecoverySnapshot({immediate:true});
        const second=buildRecoveryPayload();
        return {sameSourceKey:first.simaSourceKey===second.simaSourceKey,noSourceInJson:!JSON.stringify(second).includes('A01,1'),key:first.simaSourceKey};
      },{source,sim});
      assert.equal(before.sameSourceKey,true);assert.equal(before.noSourceInJson,true);assert(before.key);
      await settle(page);await page.reload();await page.waitForFunction(()=>!document.getElementById('startupRecoveryBtn').disabled);
      const after=await page.evaluate(async()=>({restored:await restoreLatestRecoveryWork(),hasSfc:hasLoadedDrawing(),sima:simaMapState.loaded,points:simaMapState.points.length,ink:inkStrokes.length,visible:simaDisplayEnabled,color:simaLayerColors.boundary,size:simaPointLabelSize}));
      assert.deepEqual(after,{restored:true,hasSfc:true,sima:true,points:3,ink:1,visible:false,color:'#123456',size:23});
      await settle(page);await page.reload();
      await page.evaluate(async source=>{await handleLoadedSource(source,'base.sfc',null);},source);
      await page.waitForFunction(()=>simaMapState.loaded&&inkStrokes.length===1);
      const restoredKey=await page.evaluate(()=>buildRecoveryPayload().simaSourceKey);
      assert.equal(restoredKey,before.key);
    },mobile);
    await run('A07 SIMA settings autosave; source stored only once; different SFC stays clear',async page=>{
      const result=await page.evaluate(async({source,sim})=>{
        await handleLoadedSource(source,'first.sfc',null,{restoreRecovery:false});
        const put=IDBObjectStore.prototype.put;let sourceWrites=0;
        IDBObjectStore.prototype.put=function(record,...args){if(record?.kind==='sima-source')sourceWrites++;return put.call(this,record,...args);};
        await loadSimaFile(new File([sim],'overlay.sim'));markMemoChanged();
        await flushRecoveryIndexedDbSave();
        while(recoveryDbFlushBusy)await new Promise(resolve=>setTimeout(resolve,10));
        for(let i=0;i<5;i++)saveRecoverySnapshot({immediate:true});
        while(recoveryDbFlushBusy||recoveryDbPendingRecord)await new Promise(resolve=>setTimeout(resolve,10));
        simaLayerColors.boundary='#abcdef';simaPointLabelSize=24;saveSimaDisplaySettings();
        const dirty=recoverySnapshotDirty;
        await handleLoadedSource(source,'other.sfc',null,{restoreRecovery:false});
        const otherClear=!simaMapState.loaded;
        await handleLoadedSource(source,'first.sfc',null);
        IDBObjectStore.prototype.put=put;
        return {dirty,otherClear,color:simaLayerColors.boundary,size:simaPointLabelSize,points:simaMapState.points.length,sourceWrites};
      },{source,sim});
      assert.deepEqual(result,{dirty:true,otherClear:true,color:'#abcdef',size:24,points:3,sourceWrites:1});
    },mobile);
    await run('A08 immediate layer toggle + file switch preserves outgoing visibility and colors',async page=>{
      const result=await page.evaluate(async source=>{
        await handleLoadedSource(source,'first.sfc',null,{restoreRecovery:false});saveRecoverySnapshot({immediate:true});
        layerColorOverrides['1']='#123456';markMemoChanged();
        document.getElementById('layersAllOff').click();
        await handleSelectedDrawingFile(new File([source],'second.sfc'));
        await handleSelectedDrawingFile(new File([source],'first.sfc'));
        return {visible:layerVisibility['1'],color:layerColorOverrides['1']};
      },source);
      assert.deepEqual(result,{visible:false,color:'#123456'});
    },mobile);
    await run('A08 queued saves from different workspaces are not overwritten',async page=>{
      const keys=await page.evaluate(async()=>{
        recoveryDbFlushBusy=true;
        for(const key of ['synthetic:a','synthetic:b','synthetic:c'])queueRecoveryIndexedDbSave({key,updatedAt:1,json:'{}',fingerprint:key});
        recoveryDbFlushBusy=false;await flushRecoveryIndexedDbSave();
        const db=await openRecoveryDb();
        return (await recoveryDbRequest(db.transaction(RECOVERY_DB_SNAPSHOT_STORE,'readonly').objectStore(RECOVERY_DB_SNAPSHOT_STORE).getAllKeys())).sort();
      });
      assert.deepEqual(keys,['synthetic:a','synthetic:b','synthetic:c']);
    },mobile);
  }
})().catch(error=>{failures++;console.error(error.stack);}).finally(async()=>{
  if(browser)await browser.close();server.close();process.exitCode=failures?1:0;
});
