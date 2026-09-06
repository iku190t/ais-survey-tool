const assert=require('node:assert/strict'),path=require('node:path');
const {createHarness,profiles,openBase,settle}=require('./tests/audit-harness.js');
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
test('U01 actual toolbar event transitions leave at most one command surface',async page=>{
 await openBase(page);const r=await page.evaluate(async()=>{
  const commandPanels={measureBtn:['measureBox','measureModePanel'],drawBtn:['drawPanel'],textSearchOpenBtn:['textSearchPanel'],settingsBtn:['settingsPanel'],layerFab:['layerPanel'],bgBtn:['aerialPhotoPanel'],helpBtn:['helpModal'],terrainToolbarBtn:['terrainPanel'],registryToolbarBtn:['registryMapPanel'],controlPointToolbarBtn:['controlPointPanel'],hazardToolbarBtn:['hazardMapPanel'],simaToolbarBtn:['simaMapPanel']};
  const visible=id=>{const e=document.getElementById(id);return !!e&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';};
  const commands=Object.keys(commandPanels).filter(visible),violations=[];let transitions=0;
  for(const from of commands)for(const to of commands){
   document.getElementById(from).click();await new Promise(requestAnimationFrame);document.getElementById(to).click();await new Promise(requestAnimationFrame);
   const active=Object.entries(commandPanels).filter(([,ids])=>ids.some(visible)).map(([id])=>id);transitions++;
   if(active.length>1||active.some(id=>id!==to))violations.push({from,to,active});
  }
  return window.auditDetails={transitions,commands,violations};
 });assert.deepEqual(r.violations,[]);return r;
});
test('U02 real pan and pinch/wheel preserve geometry without autosaving view-only changes',async(page,profile)=>{
 await openBase(page);await settle(page);
 const before=await page.evaluate(()=>{cancelTransientOperations();document.getElementById('fitBtn').click();window.auditGeometry=JSON.stringify({source:loadedSfcText,lines:data.lines,texts:data.texts,ink:inkStrokes});window.auditSaves=0;const original=saveRecoverySnapshot;saveRecoverySnapshot=(...args)=>{auditSaves++;return original(...args);};return {...view};});
 const rect=await page.locator('#canvas').boundingBox(),x=rect.x+rect.width*.55,y=rect.y+rect.height*.64;
 if(profile.options.hasTouch){
  const cdp=await page.context().newCDPSession(page);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i+1,radiusX:3,radiusY:3,force:1}))});
  await touch('touchStart',[[x,y]]);await touch('touchMove',[[x+35,y-20]]);await touch('touchMove',[[x+60,y-35]]);await touch('touchEnd',[]);
  await touch('touchStart',[[x-40,y],[x+40,y]]);await touch('touchMove',[[x-60,y-10],[x+60,y+10]]);await touch('touchMove',[[x-80,y-15],[x+80,y+15]]);await touch('touchEnd',[]);
 }else{await page.mouse.move(x,y);await page.mouse.down({button:'middle'});await page.mouse.move(x+55,y-25,{steps:5});await page.mouse.up({button:'middle'});await page.mouse.wheel(0,-140);}
 await page.waitForTimeout(350);
 const r=await page.evaluate(()=>({view:{...view},unchanged:auditGeometry===JSON.stringify({source:loadedSfcText,lines:data.lines,texts:data.texts,ink:inkStrokes}),saves:auditSaves}));
 assert.equal(r.unchanged,true);assert.equal(r.saves,0);assert.notDeepEqual(r.view,before);assert(r.view.scale>0&&Number.isFinite(r.view.scale));return r;
});
test('U03 long edit/undo/redo sequence restores exactly the same coordinate data',async page=>{
 await openBase(page);const r=await page.evaluate(()=>{
  const base=loadedSfcText;for(let i=0;i<40;i++)addInkStrokeOperation({type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:2000+i*10.123,y:3000},{x:2100+i*10.123,y:3100}]});markMemoChanged();
  const expected=JSON.stringify(inkStrokes);for(let i=0;i<40;i++)document.getElementById('undoFab').click();const empty=inkStrokes.length;for(let i=0;i<40;i++)document.getElementById('redoFab').click();
  return {operations:120,empty,restored:JSON.stringify(inkStrokes)===expected,sourceUnchanged:base===loadedSfcText};
 });assert.equal(r.empty,0);assert.equal(r.restored,true);assert.equal(r.sourceUnchanged,true);return r;
});
test('U04 last item of 65 text layers is visible and selectable after scrolling',async page=>{
 await page.evaluate(async()=>{
  const layers=Array.from({length:65},(_,i)=>`/*SXF\n#${100+i} = layer_feature('L${String(i+1).padStart(2,'0')}','1')\nSXF*/`).join('\n');
  const geometry="/*SXF\n#800 = line_feature('1','1','1','1','0','0','10000','10000')\nSXF*/\n/*SXF\n#900 = text_string_feature('1','1','1','LABEL','3000','3000','200','100','0','0','1','1','1')\nSXF*/";
  await handleLoadedSource(layers+'\n'+geometry,'layers.sfc',null,{restoreRecovery:false});openTextLayerModal(data.texts[0]);document.getElementById('textLayerChooseBtn').click();
 });
 const last=page.locator('#textLayerChoiceList .textLayerChoiceBtn').last();await last.scrollIntoViewIfNeeded();
 const r=await last.evaluate(e=>{const b=e.getBoundingClientRect(),r=e.parentElement.getBoundingClientRect();return {title:e.title,bottom:b.bottom,top:b.top,listTop:r.top,listBottom:r.bottom,viewport:innerHeight,hit:e.contains(document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2))};});
 await page.evaluate(r=>window.auditDetails=r,r);assert.equal(r.title,'L65');assert(r.top>=r.listTop-1&&r.bottom<=Math.min(r.listBottom,r.viewport)+1);assert.equal(r.hit,true);
 await last.click();const changed=await page.evaluate(()=>data.texts[0]?.layer);assert.equal(String(changed),'65');return {...r,selected:changed};
});
test('U05 GPS popup contrast matches dark/light theme and stays readable',async page=>{
 await openBase(page);const r=await page.evaluate(()=>{
  gpsEnabled=true;gpsDetailOpen=true;gpsPosition={lat:35,lon:135,zone:6,x:100,y:100,sfcX:100,sfcY:100,accuracy:.2,altitude:50,timestamp:Date.now()};const results=[];
  for(const dark of [true,false]){darkTheme=dark;updateThemeUI();updateGpsUi();const style=getComputedStyle(document.getElementById('gpsBox'));results.push({dark,color:style.color,background:style.backgroundColor});}
  return results;
 });
 const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=s=>rgb(s).reduce((n,v)=>n+v,0)/3;
 for(const item of r){assert(item.dark?lum(item.color)>180:lum(item.color)<80);assert(item.dark?lum(item.background)<100:lum(item.background)>200);}return r;
});
test('U06 popup hit targets are above Street View in both themes',async page=>{
 await openBase(page);const r=await page.evaluate(async()=>{
  const results=[];for(const dark of [true,false]){darkTheme=dark;updateThemeUI();for(const pair of [['measureBtn','measureBox'],['drawBtn','drawPanel'],['settingsBtn','settingsPanel']]){
   closeToolbarSurfacesExcept(pair[0]);document.getElementById(pair[0]).click();await new Promise(requestAnimationFrame);const panel=document.getElementById(pair[1]);
   if(getComputedStyle(panel).display==='none')continue;
   const b=panel.getBoundingClientRect(),x=Math.min(innerWidth-2,b.right-10),y=Math.max(2,b.top+20),hit=document.elementFromPoint(x,y);
   results.push({dark,panel:pair[1],hit:panel===hit||panel.contains(hit),top:b.top,bottom:b.bottom,viewport:innerHeight});
  }}return window.auditDetails=results;
 });assert(r.length>=4);assert(r.every(x=>x.hit));return r;
});
test('U07 source layer names are rendered as text, not executable HTML',async page=>{
 const r=await page.evaluate(async()=>{
  window.__auditXss=0;const name='<svg onload=window.__auditXss=1>';const content=auditSource.replace("layer_feature('AUDIT'",`layer_feature('${name}'`);await handleLoadedSource(content,'safe.sfc',null,{restoreRecovery:false});document.getElementById('layerFab').click();await new Promise(r=>setTimeout(r,80));
  return {flag:window.__auditXss,nameFound:document.getElementById('layerPanel').textContent.includes(name)};
 });assert.equal(r.flag,0);assert.equal(r.nameFound,true);return r;
});
test('U08 repeated export/reload of valid model coordinates preserves edits',async page=>{
 await openBase(page);const r=await page.evaluate(async()=>{
  addInkStrokeOperation({type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:2123.456,y:3789.012},{x:2234.567,y:3890.123}]});markMemoChanged();const expected=JSON.stringify(inkStrokes[0].points),counts=[];
  for(let i=0;i<6;i++){const out=await buildSfcExportBlobAndNameAsync();if(!out.ok)throw Error(out.reason);await handleLoadedSource(out.text,'roundtrip.sfc',null,{restoreRecovery:false});counts.push(inkStrokes.length);if(JSON.stringify(inkStrokes[0].points)!==expected)throw Error('coordinate drift');}
  return {roundTrips:6,counts,coordinatesUnchanged:true};
 });assert(r.counts.every(n=>n===1));return r;
});
test('U09 real drawing input near world origin is not mistaken for screen coordinates',async(page,profile)=>{
 await openBase(page);
 await page.evaluate(()=>{cancelTransientOperations();rotationDeg=0;view.scale=.5;view.tx=canvas.clientWidth*.6-200*.5;view.ty=canvas.clientHeight*.62+200*.5;inkEnabled=true;inkTool='line';inkEraser=false;drawPanel.style.display='none';draw();});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const p=await page.evaluate(()=>{const rect=canvas.getBoundingClientRect(),a=worldToScreen(200,200),b=worldToScreen(350,300);return {a:[rect.left+a[0],rect.top+a[1]],b:[rect.left+b[0],rect.top+b[1]]};});
 if(profile.options.hasTouch){
  const cdp=await page.context().newCDPSession(page);const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{x:p[0],y:p[1],id:1,radiusX:3,radiusY:3,force:1}]:[]});
  await touch('touchStart',p.a);await page.waitForTimeout(170);for(let i=1;i<=5;i++)await touch('touchMove',[p.a[0]+(p.b[0]-p.a[0])*i/5,p.a[1]+(p.b[1]-p.a[1])*i/5]);await touch('touchEnd');
 }else{await page.mouse.move(...p.a);await page.mouse.down();await page.mouse.move(...p.b,{steps:5});await page.mouse.up();}
 const r=await page.evaluate(async()=>{const out=await buildSfcExportBlobAndNameAsync();return window.auditDetails={strokeCount:inkStrokes.length,points:inkStrokes[0]?.points,ok:out.ok,reason:out.reason};});
 assert(r.strokeCount>0,'input did not produce a stroke');assert.equal(r.ok,true,r.reason);return r;
});
test('U10 screen/world transforms round trip over zoom and rotation combinations',async page=>{
 await openBase(page);const r=await page.evaluate(()=>{
  let count=0,maxError=0;for(const scale of [.0001,.01,.2,1,15,1000])for(const angle of [-720,-181,-90,0,37,90,179,360,721])for(const point of [[0,0],[123.456,-789.123],[1e8,-1e8],[-2000,3456]]){
   rotationDeg=angle;view={scale,tx:321.5,ty:200.25};const s=worldToScreen(...point),p=screenToWorld(...s);maxError=Math.max(maxError,Math.hypot(p[0]-point[0],p[1]-point[1]));count++;
  }return {count,maxError};
 });assert(r.maxError<.00001);return r;
});
test('U11 no duplicate DOM identifiers and no zero-size drawing viewport',async page=>{
 await openBase(page);const r=await page.evaluate(()=>{const ids=new Map();document.querySelectorAll('[id]').forEach(e=>ids.set(e.id,(ids.get(e.id)||0)+1));const b=canvas.getBoundingClientRect();return {duplicates:[...ids].filter(([,v])=>v>1),width:b.width,height:b.height,left:b.left,top:b.top,viewport:[innerWidth,innerHeight]};});
 assert.deepEqual(r.duplicates,[]);assert(r.width>100&&r.height>100);assert(r.left>=0&&r.top>=0);return r;
});
(async()=>{const h=await createHarness('ez-comprehensive-ui-20260906');try{for(const profile of profiles)for(const [name,fn] of cases)await h.run(name,fn,profile);}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
