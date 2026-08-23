const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(__dirname+"/index.html","utf8");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(code=>code.trim());
for(let index=0;index<scripts.length;index++)new vm.Script(scripts[index],{filename:`inline-${index+1}.js`});

const required=[
  'id="saveMenuAndroidShareBtn"',
  '>共有・メール送信</button>',
  'id="androidShareReadyModal"',
  'function isAndroidLike()',
  'async function shareBlobFileWithNativeAndroid(blob,fileName)',
  'DROGGER_NATIVE_SHARE_URL="http://127.0.0.1:38472/share"',
  'location.href=`intent://share?id=${encodeURIComponent(shareId)}#Intent;scheme=ezviewer;package=jp.co.eyesurvey.ezviewer;end`',
  'async function prepareAndroidSfcZipShare()',
  'createSingleFileZip(exportData.blob,exportData.saveAsName)',
  'pendingAndroidZipShare={blob:zipBlob,name:zipName}',
  'await shareBlobFile(pending.blob,pending.name)',
  'androidShareBtn.hidden=!showAndroidShare',
  'saveAsBtn.hidden=hideAndroidSaveAs',
  'const shared=await shareBlobFile(file,file.name)'
];
for(const token of required)if(!html.includes(token))throw new Error(`Android ZIP share integration missing: ${token}`);

const prepareBody=html.match(/async function prepareAndroidSfcZipShare\(\)\{([\s\S]*?)\n\}/)?.[1]||"";
if(!prepareBody.includes('if(!isAndroidLike())')||!prepareBody.includes('replace(/\\.[^.]+$/g,"")+".zip"'))throw new Error("Android-only ZIP preparation is incomplete");
console.log("OK: private Android app sends SFC ZIP and coordinate CSV through the loopback native share bridge while hiding Save As");
