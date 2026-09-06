// Delayed browser/storage operations using synthetic fixtures only.
const assert=require('node:assert/strict');
const {createHarness,profiles,openBase,settle}=require('./tests/audit-harness.js');
(async()=>{
 const h=await createHarness('ez-workspace-races');
 try{for(const profile of [profiles[0],profiles[2],profiles[5]]){
  await h.run('R01 late save completion does not rename or rebind a newly loaded drawing',async page=>{
   await openBase(page,'old.sfc');
   const result=await page.evaluate(async()=>{
    let release;const entered=new Promise(resolve=>{writeBlobToHandle=async()=>{resolve();return new Promise(r=>release=r);};});
    const oldHandle={name:'old.sfc',createWritable:async()=>{throw Error('not used');}};lastSaveHandle=oldHandle;
    const saving=saveSfcOverwrite();await entered;
    await handleLoadedSource(auditSource,'new.sfc',null,{restoreRecovery:false});release();await saving;
    return window.auditDetails={name:data.source_name,handleBound:!!currentOpenHandle};
   });assert.deepEqual(result,{name:'new.sfc',handleBound:false});return result;
  },profile);
  await h.run('R02 source switching during export rejects stale output',async page=>{
   await openBase(page);
   const result=await page.evaluate(async()=>{
    const original=waitForUiPaint;let calls=0,release;
    const entered=new Promise(resolve=>{waitForUiPaint=()=>++calls===3?new Promise(r=>{release=r;resolve();}):original();});
    const saving=buildSfcExportBlobAndNameAsync();await entered;
    await handleLoadedSource(auditSource,'new.sfc',null,{restoreRecovery:false});release();const out=await saving;
    return window.auditDetails={ok:out.ok,name:data.source_name};
   });assert.deepEqual(result,{ok:false,name:'new.sfc'});return result;
  },profile);
  for(const mode of ['desktop-overwrite','desktop-save-as','desktop-sfz'])await h.run(`R05 ${mode} completion keeps the new workspace untouched`,async page=>{
   await openBase(page,'old.sfc');
   const result=await page.evaluate(async mode=>{
    let release;const entered=new Promise(resolve=>{writeBlobToHandle=async()=>{resolve();return new Promise(r=>release=r);};});
    const handle={name:mode==='desktop-sfz'?'old.sfz':'old.sfc',createWritable:async()=>{throw Error('not used');}};
    currentOpenHandle=handle;lastSaveHandle=handle;window.showSaveFilePicker=async()=>handle;
    if(mode==='desktop-sfz'){getExportableAerialCadImages=()=>[{}];buildAerialSfzExport=async()=>({ok:true,blob:new Blob(['synthetic']),sfcFileName:'old.sfc',imageCount:1});}
    const saving=saveSfcAsDesktop({overwrite:mode==='desktop-overwrite'});await entered;
    await handleLoadedSource(auditSource,'new.sfc',null,{restoreRecovery:false});release();await saving;
    return window.auditDetails={name:data.source_name,handleBound:!!currentOpenHandle,lastBound:!!lastSaveHandle};
   },mode);assert.deepEqual(result,{name:'new.sfc',handleBound:false,lastBound:false});return result;
  },profile);
  await h.run('R06 an edit between source preparation and annotations asks for retry',async page=>{
   await openBase(page);
   const result=await page.evaluate(async()=>{
    const original=waitForUiPaint;let calls=0,release;
    const entered=new Promise(resolve=>{waitForUiPaint=()=>++calls===2?new Promise(r=>{release=r;resolve();}):original();});
    const saving=buildSfcExportBlobAndNameAsync();await entered;
    inkStrokes.push({type:'freehand',points:[{x:1,y:1},{x:2,y:2}]});markMemoChanged();release();const out=await saving;
    return window.auditDetails={ok:out.ok,strokes:inkStrokes.length};
   });assert.deepEqual(result,{ok:false,strokes:1});return result;
  },profile);
  await h.run('R07 valid GPS/model coordinates outside the source extent remain exact',async page=>{
   await openBase(page);
   const result=await page.evaluate(async()=>{
    const points=[{x:-200000000,y:100000000},{x:200000000,y:-100000000}];
    inkStrokes=[{type:'freehand',color:'#123456',worldWidthMm:.13,points}];
    const out=await buildSfcExportBlobAndNameAsync();
    return window.auditDetails={ok:out.ok,points:out.ok?parseMemoMetaPayload(out.text).strokes[0].points:null};
   });assert.equal(result.ok,true);assert.deepEqual(result.points,[{x:-200000000,y:100000000},{x:200000000,y:-100000000}]);return result;
  },profile);
  await h.run('R03 a newer IndexedDB copy wins over an older valid local copy',async page=>{
   await openBase(page);await page.evaluate(()=>{inkStrokes=[{type:'freehand',points:[{x:1,y:1},{x:2,y:2}]}];markMemoChanged();});await settle(page);
   await page.evaluate(async()=>{
    const key=getRecoveryStorageKey(),old=localStorage.getItem(key);await new Promise(r=>setTimeout(r,5));
    inkStrokes.push({type:'freehand',points:[{x:3,y:3},{x:4,y:4}]});markMemoChanged();window.auditOldCopy=old;
   });await settle(page);
   const result=await page.evaluate(async()=>{
    localStorage.setItem(getRecoveryStorageKey(),auditOldCopy);
    await handleLoadedSource(auditSource,'base.sfc',null);
    return window.auditDetails={count:inkStrokes.length};
   });assert.equal(result.count,2);return result;
  },profile);
  await h.run('R04 a failed outgoing save and newer queued save retain every drawing',async page=>{
   await openBase(page,'first.sfc');await settle(page);
   const result=await page.evaluate(async()=>{
    const original=IDBDatabase.prototype.transaction;let outage=true;
    IDBDatabase.prototype.transaction=function(stores,mode,...args){if(outage&&mode==='readwrite'&&Array.from(typeof stores==='string'?[stores]:stores).includes(RECOVERY_DB_SNAPSHOT_STORE))throw Error('synthetic outage');return original.call(this,stores,mode,...args);};
    inkStrokes=[{type:'freehand',points:[{x:1,y:1},{x:2,y:2}]}];markMemoChanged();const firstKey=getRecoveryStorageKey();
    await new Promise(r=>setTimeout(r,30));inkStrokes.push({type:'freehand',points:[{x:3,y:3},{x:4,y:4}]});markMemoChanged();
    await handleLoadedSource(auditSource,'second.sfc',null,{restoreRecovery:false});inkStrokes=[{type:'freehand',points:[{x:5,y:5},{x:6,y:6}]}];markMemoChanged();const secondKey=getRecoveryStorageKey();
    outage=false;IDBDatabase.prototype.transaction=original;await flushRecoveryIndexedDbSave();
    while(recoveryDbFlushBusy||recoveryDbPendingRecord||recoveryDbPendingByKey.size)await new Promise(r=>setTimeout(r,30));
    const db=await openRecoveryDb(),counts=[];
    for(const key of [firstKey,secondKey]){const r=await recoveryDbRequest(db.transaction(RECOVERY_DB_SNAPSHOT_STORE,'readonly').objectStore(RECOVERY_DB_SNAPSHOT_STORE).get(key));counts.push(JSON.parse(r.json).inkStrokes.length);}
    return window.auditDetails={counts};
   });assert.deepEqual(result.counts,[2,1]);return result;
  },profile);
 }}finally{await h.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
