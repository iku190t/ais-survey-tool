const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(__dirname+"/index.html","utf8");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match=>match[1])
  .filter(Boolean);

for(let index=0;index<scripts.length;index++){
  new vm.Script(scripts[index],{filename:`inline-${index+1}.js`});
}

const required=[
  "function applyLayerColorOverridesToSfc(srcText)",
  "function buildLayerOverrideColorDefinitions(baseText)",
  "function prepareSfcExportBase()",
  "source=applyLayerColorOverridesToSfc(source)",
  "let base = prepareSfcExportBase()",
  "let base=prepareSfcExportBase()",
  "void flushRecoveryIndexedDbSave()",
  "let recoverySnapshotDirty = false",
  "if(recoverySnapshotDirty)saveRecoverySnapshot({immediate:true})",
  "markMemoChanged();",
  "if(wasDragging) scheduleDraw();",
  "finishTouchTransformDraw();"
];

for(const token of required){
  if(!html.includes(token))throw new Error(`missing recovery/color behavior: ${token}`);
}

console.log("OK: lightweight recovery autosave and SFC layer color export");
