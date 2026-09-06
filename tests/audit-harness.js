const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const source="/*SXF\n#10 = pre_defined_colour_feature('black')\nSXF*/\n/*SXF\n#20 = pre_defined_font_feature('continuous')\nSXF*/\n/*SXF\n#30 = width_feature('0.130000')\nSXF*/\n/*SXF\n#40 = layer_feature('AUDIT','1')\nSXF*/\n/*SXF\n#50 = line_feature('1','1','1','1','0','0','10000','0')\nSXF*/\n/*SXF\n#60 = line_feature('1','1','1','1','10000','0','10000','10000')\nSXF*/\n/*SXF\n#70 = text_string_feature('1','1','1','AUDIT','1000','1000','200','100','0','0','1','1','1')\nSXF*/";
const sim='A01,1,P1,100,100,10,\nA01,2,P2,110,100,10,\nA01,3,P3,110,110,10,\nA01,4,P4,100,110,10,\nD00,1,PARCEL,1,\nB01,1,P1,\nB01,2,P2,\nB01,3,P3,\nB01,4,P4,\nD99,\n';
const outputDir=process.env.EZ_AUDIT_OUTPUT_DIR||path.join(require('node:os').tmpdir(),'ez-viewer-audit');
fs.mkdirSync(outputDir,{recursive:true});
const profiles=[
 {name:'Chrome-PC',engine:'chrome',options:{viewport:{width:1366,height:900}}},
 {name:'Edge-PC',engine:'edge',options:{viewport:{width:1366,height:900}}},
 {name:'Android-like-portrait',engine:'chrome',options:{viewport:{width:412,height:915},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Synthetic) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'}},
 {name:'Android-like-landscape',engine:'chrome',options:{viewport:{width:915,height:412},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Synthetic) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'}},
 {name:'iPhone-like-portrait',engine:'chrome',options:{viewport:{width:393,height:852},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}},
 {name:'iPhone-like-landscape',engine:'chrome',options:{viewport:{width:852,height:393},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}}
];
async function createHarness(label){
 const results=[],browsers={};
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const ext=path.extname(file);res.setHeader('Content-Type',ext==='.js'?'text/javascript':ext==='.html'?'text/html':ext==='.webmanifest'?'application/manifest+json':'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const entryUrl=process.env.EZ_VIEWER_TEST_URL||`http://127.0.0.1:${server.address().port}/`;
 const base=new URL('.',entryUrl).href;
 async function run(name,fn,profile=profiles[0]){
  if(!browsers[profile.engine])browsers[profile.engine]=await chromium.launch({headless:true,executablePath:profile.engine==='edge'?'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe':'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const context=await browsers[profile.engine].newContext(profile.options),page=await context.newPage();
  page.setDefaultTimeout(10000);const errors=[],warnings=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text().slice(0,500));});
  await context.route(/^https?:\/\//,r=>r.request().url().startsWith(base)?r.continue():r.abort());
  const record={name,profile:profile.name,started:new Date().toISOString()},started=Date.now();
  try{
   await page.goto(entryUrl,{waitUntil:'load'});
   await page.waitForFunction(()=>typeof handleLoadedSource==='function');
   await page.evaluate(({source,sim})=>{window.auditSource=source;window.auditSim=sim;window.auditDetails=null;},{source,sim});
   record.details=await fn(page,profile,base);
   if(errors.length)throw new Error('Uncaught application errors: '+errors.join(' | '));
   record.status='PASS';
  }catch(e){record.status='FAIL';record.error=e.stack;record.details=await page.evaluate(()=>window.auditDetails).catch(()=>null);}
  finally{record.ms=Date.now()-started;record.errors=errors;record.warnings=warnings;results.push(record);console.log(JSON.stringify({name,profile:profile.name,status:record.status,ms:record.ms,error:record.error?.split('\n').slice(0,3).join(' '),details:record.details}));await context.close();}
  fs.writeFileSync(path.join(outputDir,`${label}-results.json`),JSON.stringify(results,null,2));return record;
 }
 return {run,results,base,profiles,async close(){for(const browser of Object.values(browsers))await browser.close();server.close();if(results.some(r=>r.status==='FAIL'))process.exitCode=1;console.log(JSON.stringify({total:results.length,pass:results.filter(r=>r.status==='PASS').length,fail:results.filter(r=>r.status==='FAIL').length}));}};
}
async function settle(page){await page.waitForFunction(()=>!recoveryDbFlushBusy&&!recoveryDbPendingRecord&&!recoveryDbPendingByKey.size);}
async function openBase(page,name='base.sfc'){await page.evaluate(async name=>{
 await handleLoadedSource(auditSource,name,null,{restoreRecovery:false});
 // Loading schedules a two-frame mobile layout/fit; input tests start after it.
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
},name);}
module.exports={createHarness,profiles,source,sim,root,settle,openBase,outputDir};
