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
  'async function prepareAndroidSfcZipShare()',
  'createSingleFileZip(exportData.blob,exportData.saveAsName)',
  'pendingAndroidZipShare={blob:zipBlob,name:zipName}',
  'await shareBlobFile(pending.blob,pending.name)',
  'androidShareBtn.hidden=!showAndroidShare'
];
for(const token of required)if(!html.includes(token))throw new Error(`Android ZIP share integration missing: ${token}`);

const prepareBody=html.match(/async function prepareAndroidSfcZipShare\(\)\{([\s\S]*?)\n\}/)?.[1]||"";
if(!prepareBody.includes('if(!isAndroidLike())')||!prepareBody.includes('replace(/\\.[^.]+$/g,"")+".zip"'))throw new Error("Android-only ZIP preparation is incomplete");
console.log("OK: Android-only save-menu action prepares SFC ZIP and opens the native share sheet from a dedicated user action");
