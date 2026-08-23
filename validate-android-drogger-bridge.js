const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(__dirname+"/index.html","utf8");
for(const [index,match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()){
  if(match[1].trim())new vm.Script(match[1],{filename:`inline-${index+1}.js`});
}
for(const token of [
  'const DROGGER_NATIVE_STATUS_URL="http://127.0.0.1:38472/status"',
  'source")==="android_app"',
  'function pollDroggerNativeStatus()',
  'RTK状態:',
  'fixMode:droggerNativeStatus.bridge?droggerNativeStatus.fixMode:""',
  'setInterval(pollDroggerNativeStatus,1000)'
])if(!html.includes(token))throw new Error(`web bridge integration missing: ${token}`);
console.log("OK: private Android loopback status polling and FIX/FLOAT web integration");
