const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  'id="startupRecoveryBtn"',
  '前回の作業を復元',
  'const RECOVERY_DB_BASE_STORE = "bases"',
  'async function persistRecoveryBaseSource()',
  'async function restoreLatestRecoveryWork()',
  'await persistRecoveryBaseSource();'
]){
  if(!source.includes(token))throw new Error(`missing last-work recovery implementation: ${token}`);
}

const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase();
  const type=ext===".js"?"text/javascript; charset=utf-8":ext===".sfc"?"application/octet-stream":"text/html; charset=utf-8";
  res.setHeader("Content-Type",type);
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.route(/^https:\/\//,route=>route.abort());
  const url=`http://127.0.0.1:${server.address().port}/`;
  await page.goto(url,{waitUntil:"load",timeout:15000});
  await page.waitForFunction(()=>window.eval("typeof restoreLatestRecoveryWork")==="function");

  const initial=await page.evaluate(()=>({
    text:document.getElementById("startupRecoveryBtn")?.textContent,
    disabled:document.getElementById("startupRecoveryBtn")?.disabled
  }));
  if(initial.text!=="前回の作業を復元"||!initial.disabled)throw new Error(`empty recovery button state is wrong: ${JSON.stringify(initial)}`);

  await page.click("#startupSampleBtn");
  await page.waitForFunction(()=>window.eval("loadedSfcText.length>0&&document.getElementById('startupModal').style.display==='none'"),null,{timeout:15000});
  const saved=await page.evaluate(()=>window.eval(`(async()=>{
    inkStrokes.push({
      type:"freehand",color:"#12ab34",opacity:1,eraser:false,
      worldWidthMm:.13,width:10,screenWidthPx:null,
      points:[{x:12345,y:23456},{x:13345,y:24456}]
    });
    layerColorOverrides["recovery-test"]="#abcdef";
    markMemoChanged();
    await persistRecoveryBaseSource();
    for(let i=0;i<40&&(recoveryDbFlushBusy||recoveryDbPendingRecord);i++)await new Promise(resolve=>setTimeout(resolve,25));
    await flushRecoveryIndexedDbSave();
    const key=getRecoveryStorageKey();
    const db=await openRecoveryDb();
    const base=await recoveryDbRequest(db.transaction(RECOVERY_DB_BASE_STORE,"readonly").objectStore(RECOVERY_DB_BASE_STORE).get(key));
    const snapshot=await recoveryDbRequest(db.transaction(RECOVERY_DB_SNAPSHOT_STORE,"readonly").objectStore(RECOVERY_DB_SNAPSHOT_STORE).get(key));
    localStorage.removeItem(key);
    return {key,base:!!base,baseSize:base?.sourceText?.length||0,snapshot:!!snapshot};
  })()`));
  if(!saved.base||!saved.snapshot||saved.baseSize<1000)throw new Error(`base/Snapshot was not stored: ${JSON.stringify(saved)}`);

  await page.reload({waitUntil:"load",timeout:15000});
  await page.waitForFunction(()=>{
    const button=document.getElementById("startupRecoveryBtn");
    return button&&!button.disabled&&button.textContent==="前回の作業を復元";
  },null,{timeout:10000});
  await page.click("#startupRecoveryBtn");
  await page.waitForFunction(()=>window.eval(`
    loadedSfcText.length>0&&
    inkStrokes.some(stroke=>stroke.color==="#12ab34")&&
    layerColorOverrides["recovery-test"]==="#abcdef"&&
    document.getElementById("startupModal").style.display==="none"
  `),null,{timeout:15000});
  const restored=await page.evaluate(()=>window.eval(`({
    sourceName:data.source_name,
    sourceSize:loadedSfcText.length,
    stroke:inkStrokes.some(stroke=>stroke.color==="#12ab34"),
    color:layerColorOverrides["recovery-test"],
    openHandle:currentOpenHandle
  })`));
  if(!restored.stroke||restored.color!=="#abcdef"||restored.sourceSize<1000||restored.openHandle!==null){
    throw new Error(`last work was not restored: ${JSON.stringify(restored)}`);
  }
  console.log(`last-work recovery passed (${restored.sourceName}, ${restored.sourceSize} source chars)`);
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
}).finally(async()=>{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
});
