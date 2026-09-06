const assert=require('node:assert/strict');
const {createHarness,profiles,openBase,settle}=require('./tests/audit-harness.js');
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
test('S01 invalid/cancelled inputs preserve existing source and edits',async page=>{
 await openBase(page);
 const r=await page.evaluate(async()=>{
  inkStrokes=[{type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:10,y:20},{x:30,y:40}]}];markMemoChanged();
  const before=JSON.stringify({source:loadedSfcText,name:data.source_name,ink:inkStrokes});let checked=0;
  for(const content of ['', 'garbage', '/*SXF\n#1 = unknown_feature()\nSXF*/','<html>not SFC</html>','\u0000\u0000']){
   await handleLoadedSource(content,'invalid.sfc',null);if(before!==JSON.stringify({source:loadedSfcText,name:data.source_name,ink:inkStrokes}))throw Error('invalid source replaced work');checked++;
  }
  for(const file of [null,new File(['bad'],'bad.txt'),new File(['bad'],'bad.sim')]){await handleSelectedDrawingFile(file);checked++;}
  return {checked,unchanged:before===JSON.stringify({source:loadedSfcText,name:data.source_name,ink:inkStrokes})};
 });assert.equal(r.unchanged,true);return r;
});
test('S02 last selected SFC wins when the earlier file read is slow',async page=>{
 await openBase(page);
 const r=await page.evaluate(async()=>{
  const original=readFileAsLatin1Text;let release;readFileAsLatin1Text=file=>file.name==='slow.sfc'?new Promise(r=>release=r):Promise.resolve(auditSource);
  const old=handleSelectedDrawingFile(new File([auditSource],'slow.sfc'));
  await handleSelectedDrawingFile(new File([auditSource],'new.sfc'));
  release(auditSource);await old;readFileAsLatin1Text=original;
  return window.auditDetails={finalName:data.source_name,expected:'new.sfc'};
 });assert.equal(r.finalName,r.expected);return r;
});
test('S03 slow SFZ image staging cannot replace a later SFC',async page=>{
 await openBase(page);
 const r=await page.evaluate(async()=>{
  let release;const entered=new Promise(resolve=>{extractAerialCadImagesFromSfz=async()=>{resolve();return new Promise(r=>release=r);};});
  const old=handleLoadedSource(auditSource,'old-archive.sfc',null,{restoreRecovery:false,sfzArchive:{zipBuffer:new ArrayBuffer(0),entries:[]}});
  await entered;await handleLoadedSource(auditSource,'new.sfc',null,{restoreRecovery:false});release([]);await old;
  return window.auditDetails={finalName:data.source_name,expected:'new.sfc'};
 });assert.equal(r.finalName,r.expected);return r;
});
test('S04 slow sample download cannot replace a later user file',async page=>{
 const r=await page.evaluate(async()=>{
  let release;const original=fetch;const entered=new Promise(resolve=>{fetch=(url,...args)=>String(url).includes('sample.sfc')?new Promise(r=>{release=r;resolve();}):original(url,...args);});
  const old=openBundledSampleDrawing();await entered;await handleLoadedSource(auditSource,'selected.sfc',null,{restoreRecovery:false});
  release(new Response(new TextEncoder().encode(auditSource)));await old;fetch=original;
  return window.auditDetails={finalName:data.source_name,expected:'selected.sfc'};
 });assert.equal(r.finalName,r.expected);return r;
});
test('S05 pending photo import cannot attach to another drawing',async page=>{
 await openBase(page,'photo-source.sfc');
 const r=await page.evaluate(async()=>{
  let release;const entered=new Promise(resolve=>{readPhotoExif=()=>{resolve();return new Promise(r=>release=r);};});
  latLonToJgd2024XY=()=>({x:100,y:100});ensurePhotoDemElevations=async()=>{};
  const old=importGeotaggedPhotos([new File(['synthetic'],'old-photo.jpg',{type:'image/jpeg'})],{replaceExisting:true});
  await entered;await handleLoadedSource(auditSource,'unrelated.sfc',null,{restoreRecovery:false});
  release({lat:35,lon:135,direction:0,capturedAt:''});await old;
  return window.auditDetails={finalName:data.source_name,photos:photoAnnotations.map(p=>p.fileName)};
 });assert.deepEqual(r.photos,[]);assert.equal(r.finalName,'unrelated.sfc');return r;
});
test('S06 latest replacement photo drop wins over a slow earlier drop',async page=>{
 await openBase(page);
 const r=await page.evaluate(async()=>{
  let release;const info={lat:35,lon:135,direction:0,capturedAt:''};
  const entered=new Promise(resolve=>{readPhotoExif=file=>file.name==='old.jpg'?new Promise(r=>{release=r;resolve();}):Promise.resolve(info);});
  latLonToJgd2024XY=()=>({x:100,y:100});ensurePhotoDemElevations=async()=>{};
  const old=importGeotaggedPhotos([new File(['synthetic'],'old.jpg',{type:'image/jpeg'})],{replaceExisting:true});await entered;
  await importGeotaggedPhotos([new File(['synthetic'],'new.jpg',{type:'image/jpeg'})],{replaceExisting:true});release(info);await old;
  return window.auditDetails={photos:photoAnnotations.map(p=>p.fileName)};
 });assert.deepEqual(r.photos,['new.jpg']);return r;
});
test('S07 sequential photo replacement and invalid EXIF preserve correct data',async page=>{
 await openBase(page);
 const r=await page.evaluate(async()=>{
  readPhotoExif=file=>file.name==='bad.jpg'?Promise.reject(Error('synthetic missing EXIF')):Promise.resolve({lat:35,lon:135,direction:0,capturedAt:''});
  latLonToJgd2024XY=()=>({x:100,y:100});ensurePhotoDemElevations=async()=>{};
  const f=name=>new File(['synthetic'],name,{type:'image/jpeg'});
  await importGeotaggedPhotos([f('old.jpg')],{replaceExisting:true});await importGeotaggedPhotos([f('new2.jpg'),f('new1.jpg')],{replaceExisting:true});
  const before=photoAnnotations.map(p=>p.fileName);await importGeotaggedPhotos([f('bad.jpg')],{replaceExisting:true});
  return {before,after:photoAnnotations.map(p=>p.fileName),numbers:photoAnnotations.map(p=>p.number)};
 });assert.deepEqual(r.before,['new1.jpg','new2.jpg']);assert.deepEqual(r.after,r.before);assert.deepEqual(r.numbers,[1,2]);return r;
});
test('S08 same source with different filenames isolates work recovery',async page=>{
 await openBase(page,'first.sfc');
 const r=await page.evaluate(async()=>{
  inkStrokes=[{type:'freehand',color:'#123456',points:[{x:10,y:20},{x:30,y:40}]}];markMemoChanged();
  const firstKey=getRecoveryStorageKey();await handleLoadedSource(auditSource,'second.sfc',null);const secondCount=inkStrokes.length;
  await handleLoadedSource(auditSource,'first.sfc',null);return {firstKey,restoredKey:getRecoveryStorageKey(),secondCount,restoredCount:inkStrokes.length};
 });assert.equal(r.firstKey,r.restoredKey);assert.equal(r.secondCount,0);assert.equal(r.restoredCount,1);return r;
});
test('S09 localStorage quota failure still restores the IndexedDB copy',async page=>{
 await openBase(page);
 await page.evaluate(()=>{
  const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(String(key).startsWith(RECOVERY_STORAGE_PREFIX))throw new DOMException('synthetic quota','QuotaExceededError');return original.call(this,key,value);};
  inkStrokes=[{type:'freehand',color:'#123456',points:[{x:111,y:222},{x:333,y:444}]}];markMemoChanged();
 });await settle(page);await page.reload();await page.waitForFunction(()=>!document.getElementById('startupRecoveryBtn').disabled);
 const r=await page.evaluate(async()=>({restored:await restoreLatestRecoveryWork(),points:inkStrokes[0]?.points}));
 assert.equal(r.restored,true);assert.deepEqual(r.points,[{x:111,y:222},{x:333,y:444}]);return r;
});
test('S10 transient IndexedDB failure retains dirty state or retries latest snapshot',async page=>{
 await openBase(page);await page.evaluate(()=>{inkStrokes=[{type:'freehand',points:[{x:1,y:1},{x:2,y:2}]}];markMemoChanged();});await settle(page);
 const r=await page.evaluate(async()=>{
  const original=IDBDatabase.prototype.transaction;let failures=0;
  IDBDatabase.prototype.transaction=function(stores,mode,...args){if(mode==='readwrite'&&Array.from(typeof stores==='string'?[stores]:stores).includes(RECOVERY_DB_SNAPSHOT_STORE)&&failures++===0)throw new DOMException('synthetic transient storage failure','UnknownError');return original.call(this,stores,mode,...args);};
  inkStrokes.push({type:'freehand',points:[{x:3,y:3},{x:4,y:4}]});markMemoChanged();
  await new Promise(r=>setTimeout(r,800));IDBDatabase.prototype.transaction=original;
  const db=await openRecoveryDb(),record=await recoveryDbRequest(db.transaction(RECOVERY_DB_SNAPSHOT_STORE,'readonly').objectStore(RECOVERY_DB_SNAPSHOT_STORE).get(getRecoveryStorageKey()));
  return window.auditDetails={memory:inkStrokes.length,indexedDb:JSON.parse(record.json).inkStrokes.length,localStorage:JSON.parse(localStorage.getItem(getRecoveryStorageKey())).inkStrokes.length,dirty:recoverySnapshotDirty,pending:!!recoveryDbPendingRecord||!!recoveryDbPendingByKey.size};
 });assert(r.indexedDb===r.memory||r.dirty||r.pending,'latest snapshot silently left only in localStorage with no retry');return r;
});
test('S11 startup recovery uses newer localStorage when IndexedDB write failed',async page=>{
 await openBase(page);await page.evaluate(()=>{inkStrokes=[{type:'freehand',points:[{x:1,y:1},{x:2,y:2}]}];markMemoChanged();});await settle(page);
 await page.evaluate(async()=>{
  const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...args){if(mode==='readwrite'&&Array.from(typeof stores==='string'?[stores]:stores).includes(RECOVERY_DB_SNAPSHOT_STORE))throw Error('synthetic storage outage');return original.call(this,stores,mode,...args);};
  inkStrokes.push({type:'freehand',points:[{x:3,y:3},{x:4,y:4}]});markMemoChanged();await new Promise(r=>setTimeout(r,150));
 });await page.reload();await page.waitForFunction(()=>!document.getElementById('startupRecoveryBtn').disabled);
 const r=await page.evaluate(async()=>{const restored=await restoreLatestRecoveryWork();return window.auditDetails={restored,restoredCount:inkStrokes.length,expected:2};});
 assert.equal(r.restoredCount,2);return r;
});
test('S12 malformed current snapshot can fall back to a valid saved history',async page=>{
 await openBase(page);await page.evaluate(()=>{inkStrokes=[{type:'freehand',points:[{x:1,y:1},{x:2,y:2}]}];markMemoChanged();});await settle(page);
 const evidence=await page.evaluate(async()=>{
  const key=getRecoveryStorageKey(),db=await openRecoveryDb();
  const history=await recoveryDbRequest(db.transaction(RECOVERY_DB_HISTORY_STORE,'readonly').objectStore(RECOVERY_DB_HISTORY_STORE).index('key').getAll(IDBKeyRange.only(key)));
  const tx=db.transaction(RECOVERY_DB_SNAPSHOT_STORE,'readwrite'),done=recoveryDbTransactionDone(tx);tx.objectStore(RECOVERY_DB_SNAPSHOT_STORE).put({key,updatedAt:Date.now(),fingerprint:computeRecoveryFingerprint(),json:'{corrupted'});await done;
  localStorage.removeItem(key);return {historyRecords:history.length};
 });await page.reload();await page.evaluate(async()=>{await refreshStartupRecoveryButton();});
 const r=await page.evaluate(()=>({enabled:!document.getElementById('startupRecoveryBtn').disabled}));r.historyRecords=evidence.historyRecords;
 await page.evaluate(r=>window.auditDetails=r,r);assert(r.historyRecords>0);assert.equal(r.enabled,true);return r;
});
test('S13 repeated SFC export/reload does not duplicate or drift annotations',async page=>{
 await openBase(page);
 const r=await page.evaluate(async()=>{
  inkStrokes=[{type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:123.456,y:-789.012},{x:234.567,y:-890.123}]}];markMemoChanged();const expected=JSON.stringify(inkStrokes[0].points),counts=[];
  for(let i=0;i<6;i++){const out=await buildSfcExportBlobAndNameAsync();if(!out.ok)throw Error(out.reason);await handleLoadedSource(out.text,'roundtrip.sfc',null,{restoreRecovery:false});counts.push(inkStrokes.length);if(JSON.stringify(inkStrokes[0].points)!==expected)throw Error('coordinate drift');}
  return {counts,coordinatesUnchanged:true};
 });assert(r.counts.every(n=>n===1));return r;
});
test('S14 SIMA load failure preserves the previous valid overlay',async page=>{
 await openBase(page);const r=await page.evaluate(async()=>{
  await loadSimaFile(new File([auditSim],'good.sim'));const before=JSON.stringify(simaMapState.points);
  for(const value of ['','garbage','A01,1,P1,NaN,0,','D00,1,PARCEL,1,\nB01,1,P1,\nD99,'])await loadSimaFile(new File([value],'invalid.sim'));
  return {name:simaMapState.sourceName,unchanged:before===JSON.stringify(simaMapState.points)};
 });assert.equal(r.name,'good.sim');assert.equal(r.unchanged,true);return r;
});
test('S15 SIMA-only edits and settings restore without SFC',async page=>{
 await page.evaluate(async()=>{await loadSimaFile(new File([auditSim],'standalone.sim'));simaLayerColors.boundary='#123456';simaPointLabelSize=22;simaParcelLabelSize=27;inkStrokes=[{type:'freehand',color:'#123456',points:[{x:100000,y:100000},{x:110000,y:110000}]}];markMemoChanged();});
 await settle(page);await page.reload();await page.waitForFunction(()=>!document.getElementById('startupRecoveryBtn').disabled);
 const r=await page.evaluate(async()=>({ok:await restoreLatestRecoveryWork(),sfc:!!loadedSfcText,points:simaMapState.points.length,ink:inkStrokes.length,size:simaPointLabelSize,parcel:simaParcelLabelSize,color:simaLayerColors.boundary}));
 assert.deepEqual(r,{ok:true,sfc:false,points:4,ink:1,size:22,parcel:27,color:'#123456'});return r;
});
test('S16 missing SIMA recovery source must not clear an active drawing',async page=>{
 await openBase(page);await page.evaluate(async()=>{await loadSimaFile(new File([auditSim],'overlay.sim'));markMemoChanged();});await settle(page);
 const r=await page.evaluate(async()=>{
  const key=buildRecoveryPayload().simaSourceKey,db=await openRecoveryDb(),tx=db.transaction(RECOVERY_DB_BASE_STORE,'readwrite'),done=recoveryDbTransactionDone(tx);tx.objectStore(RECOVERY_DB_BASE_STORE).delete(key);await done;recoverySimaSourceCache.clear();
  document.getElementById('startupRecoveryBtn').disabled=false;const before=JSON.stringify({source:loadedSfcText,points:simaMapState.points});const ok=await restoreLatestRecoveryWork();
  return {ok,unchanged:before===JSON.stringify({source:loadedSfcText,points:simaMapState.points})};
 });assert.deepEqual(r,{ok:false,unchanged:true});return r;
});
(async()=>{const h=await createHarness('ez-comprehensive-state-20260906');try{for(const profile of profiles)for(const [name,fn] of cases)await h.run(name,fn,profile);}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
