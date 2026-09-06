const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {root,createHarness,profiles,openBase,outputDir}=require('./tests/audit-harness.js');
const sima=require(path.join(root,'sima-import.js'));require(path.join(root,'terrain-advanced.js'));
const ownerContext={window:{}};vm.createContext(ownerContext);vm.runInContext(fs.readFileSync(path.join(root,'drogger-owner-mode.js'),'utf8'),ownerContext);
const owner=ownerContext.window.DroggerOwnerMode;
const results=[];function record(name,fn){const started=Date.now();try{const details=fn();results.push({name,status:'PASS',ms:Date.now()-started,details});}catch(e){results.push({name,status:'FAIL',ms:Date.now()-started,error:e.stack});}console.log(JSON.stringify(results.at(-1)));}
let seed=20260906;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
record('D01 SIMA CSV quoting, line endings, BOM and numeric-coordinate oracle',()=>{
 let count=0;
 const quote=s=>'"'+s.replaceAll('"','""')+'"';
 for(const eol of ['\n','\r\n'])for(const bom of ['', '\ufeff'])for(let i=0;i<100;i++){
  const name=i%2?'P,"'+i+'"':'測点'+i,x=(random()*600000-300000).toFixed(3),y=(random()*600000-300000).toFixed(3),z=(random()*1000-100).toFixed(3);
  const parsed=sima.parse(bom+['A00,',`A01,1,${quote(name)},${x},${y},${z},`,'A99,'].join(eol));assert.equal(parsed.points.length,1);assert.equal(parsed.points[0].name,name);assert.equal(parsed.points[0].xNorth,+x);assert.equal(parsed.points[0].yEast,+y);assert.equal(parsed.points[0].z,+z);count++;
 }return {seed:20260906,count};
});
record('D02 malformed SIMA coordinates are rejected without corrupting valid points',()=>{
 const invalid=['','NaN','Infinity','-Infinity','1e999','hello','--1','1,2'];let count=0;
 for(const bad of invalid){const p=sima.parse(`A01,1,GOOD,0,0,\nA01,2,BAD,"${bad}",5,\n`);assert.equal(p.points.length,1);assert(p.warnings.length);count++;}return {count};
});
record('D03 clipped SIMA parcel label remains inside its original concave polygon',()=>{
 let labels=0;const failures=[];
 for(let i=0;i<1000;i++){
  const cx=random()*600-100,cy=random()*600-100,n=6+Math.floor(random()*24),ring=[];
  for(let j=0;j<n;j++){const angle=j/n*Math.PI*2,r=20+random()*230;ring.push({x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r});}
  const p=sima.visibleLabelPoint(ring,400,400,12);if(!p)continue;labels++;
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<12-1e-8||p.y<12-1e-8||p.x>388+1e-8||p.y>388+1e-8||!sima.pointInPolygon(p,ring))failures.push({i,p,ring});
 }
 if(failures.length){fs.writeFileSync(path.join(outputDir,'ez-concave-label-failures-20260906.json'),JSON.stringify(failures,null,2));throw Error(`${failures.length} labels outside original parcel; ${labels} visible labels`);}return {polygons:1000,labels,failures:0};
});
record('D04 elevation truncation and next-point numbering preserve values',()=>{
 let elevationCases=0,numberingCases=0;
 for(let mm=-100000;mm<=100000;mm++){
  const sign=mm<0&&Math.abs(mm)>=10?'-':'',abs=Math.abs(mm),expected=sign+Math.floor(abs/1000)+'.'+String(Math.floor(abs%1000/10)).padStart(2,'0');assert.equal(owner.drawingElevationText(mm/1000),expected);elevationCases++;
 }
 for(const prefix of ['P','ST-','点'])for(let n=0;n<100;n++){const current=prefix+String(n).padStart(3,'0'),used=[{name:prefix+String(n+1).padStart(3,'0')}];assert.equal(owner.incrementPointName(current,used),prefix+String(n+2).padStart(3,'0'));numberingCases++;}
 return {elevationCases,numberingCases};
});
record('D05 CSV quoting and formula-like point names do not change numeric coordinates',()=>{
 let count=0;for(const name of ['P1','P,1','P"1','P\n1','=1+1','+P1','-P1','@P1']){
  const csv=owner.buildCsv([{name,x:-123.456,y:-789.012,elevation:2.010,antennaAltitude:4.010,antennaHeight:2,accuracy:.01,zone:4,lat:35,lon:135,fixMode:'FIXED'}]);
  assert(csv.includes(',-123.456,-789.012,2.010,'));assert(!csv.includes(",'\-123.456"));if(/^[=+\-@]/.test(name))assert(csv.includes("'"+name));count++;
 }return {count};
});
function gridOf(kind,size=21){const points=[];for(let row=0;row<size;row++)for(let col=0;col<size;col++){
 const elevation=kind==='flat'?100:kind==='negative'?-50+row*.3+col*.2:kind==='holes'?(row%4===0&&col%3===0?NaN:100+Math.sin(row)*2+Math.cos(col)*2):kind==='missing'?NaN:100+row*10-col*5;
 points.push({row,col,sx:col*3,sy:row*3,worldX:col*1000,worldY:row*1000,plane:{xNorth:row,yEast:col},elevation,source:'SYNTHETIC'});
 }return {rows:size,cols:size,points,width:size*3,height:size*3,gridPurpose:'surface'};}
(async()=>{
 for(const kind of ['flat','negative','holes','missing','steep'])for(const mode of EzTerrainAdvanced.modes){const started=Date.now(),name=`D06 terrain ${mode}/${kind}`;try{
  const grid=gridOf(kind),before=grid.points.map(p=>p.elevation);const out=await EzTerrainAdvanced.prepare(mode,grid);assert(out&&out.raster.pixels.length===grid.points.length*4);assert.deepEqual(grid.points.map(p=>p.elevation),before);assert(EzTerrainAdvanced.legend(mode,out));
  results.push({name,status:'PASS',ms:Date.now()-started,details:{cells:grid.points.length,threshold:Number.isFinite(out.threshold)?out.threshold:null}});
 }catch(e){results.push({name,status:'FAIL',ms:Date.now()-started,error:e.stack});}}
 for(const mode of EzTerrainAdvanced.modes){try{assert.equal(await EzTerrainAdvanced.prepare(mode,gridOf('flat'),{isCancelled:()=>true}),null);results.push({name:`D07 terrain cancelled ${mode}`,status:'PASS'});}catch(e){results.push({name:`D07 terrain cancelled ${mode}`,status:'FAIL',error:e.stack});}}
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
 fs.writeFileSync(path.join(outputDir,'ez-comprehensive-data-unit-20260906-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({unitTotal:results.length,unitPass:results.filter(r=>r.status==='PASS').length,unitFail:results.filter(r=>r.status==='FAIL').length}));
 const h=await createHarness('ez-comprehensive-data-runtime-20260906');try{
  for(const profile of [profiles[0],profiles[2],profiles[5]]){
   await h.run('D08 invalid selected SFC does not displace valid recent history',async page=>{await openBase(page);const r=await page.evaluate(async()=>{await handleSelectedDrawingFile(new File([auditSource],'good.sfc'));await handleSelectedDrawingFile(new File(['bad content'],'bad.sfc'));return window.auditDetails={active:data.source_name,recent:readRecentDrawingMeta().map(r=>r.name)};});assert.equal(r.active,'good.sfc');assert(!r.recent.includes('bad.sfc'));return r;},profile);
   await h.run('D09 export stays one coherent snapshot while an edit completes',async page=>{await openBase(page);const r=await page.evaluate(async()=>{
    addInkStrokeOperation({type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:2000,y:3000},{x:2100,y:3100}]});
    const original=waitForUiPaint;let paints=0,release;const paused=new Promise(resolve=>{waitForUiPaint=()=>{paints++;if(paints===3){resolve();return new Promise(r=>release=r);}return original();};});
    const pending=buildSfcExportBlobAndNameAsync();await paused;addInkStrokeOperation({type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:4000,y:5000},{x:4100,y:5100}]});release();const out=await pending;waitForUiPaint=original;
    const raw=out.ok?parseSxfFeatureRecords(getFlatSxfTextIncludingGenerated(out.text)):[],meta=out.ok?parseMemoMetaPayload(out.text):null;
    return window.auditDetails={ok:out.ok,geometry:raw.filter(r=>r.name==='polyline_feature').length,metadata:meta?.strokes?.length};
   });assert(r.ok&&r.geometry===r.metadata);return r;},profile);
   await h.run('D10 failed share does not claim success; user cancellation stays cancellation',async page=>{const r=await page.evaluate(async()=>{
    const outcomes=[];isEzViewerPrivateAndroidApp=()=>false;navigator.canShare=()=>true;
    for(const mode of ['success','cancel','denied','unsupported']){let calls=0;navigator.share=async()=>{calls++;if(mode!=='success')throw new DOMException('synthetic share result',mode==='cancel'?'AbortError':mode==='denied'?'NotAllowedError':'TypeError');};outcomes.push({mode,result:await shareBlobFile(new Blob(['synthetic'],{type:'application/zip'}),'test.zip'),calls});}return outcomes;
   });assert.deepEqual(r.map(v=>v.result),[true,'cancelled',false,false]);assert.equal(r[1].calls,1);assert.equal(r[2].calls,1);return r;},profile);
   await h.run('D11 RTK status stays visible in minimized owner popup for every state',async page=>{await openBase(page);const r=await page.evaluate(()=>{
    isEzViewerPrivateAndroidApp=()=>true;gpsEnabled=true;gpsDetailOpen=true;gpsPosition={lat:35,lon:135,zone:6,x:100,y:100,sfcX:100,sfcY:100,accuracy:.012,altitude:45,timestamp:Date.now()};setDroggerOwnerMode(true);droggerOwnerMinimized=true;const rows=[];
    for(const mode of ['FIXED','FLOAT','SINGLE','DGPS','INVALID','STALE','NO_DATA']){droggerNativeStatus={bridge:true,fixMode:mode,fixQuality:mode==='FIXED'?4:5,ageMs:20,updatedAt:Date.now()};updateGpsUi();rows.push({mode,text:document.getElementById('gpsText').textContent,actions:getComputedStyle(document.getElementById('droggerOwnerActions')).display});}return rows;
   });for(const row of r){assert(row.text.includes('RTK状態'));assert(row.text.includes('水平誤差'));assert.notEqual(row.actions,'none');}return r;},profile);
  }
 }finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
