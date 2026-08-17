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
  "overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain",
  "#textLayerBox.textLayerSubviewActive #textLayerActions{display:none;}",
  "scroll-padding-bottom:12px",
  "function setTextLayerModalView(view=\"menu\")",
  "setTextLayerModalView(\"choose\")",
  "setTextLayerModalView(\"new\")",
  "setTextLayerModalView(\"menu\")"
];

for(const token of required){
  if(!html.includes(token))throw new Error(`missing text layer UI behavior: ${token}`);
}

if((html.match(/setTextLayerModalView\("menu"\)/g)||[]).length<2){
  throw new Error("text layer modal menu reset is incomplete");
}

console.log("OK: text layer modal subviews, scrolling, and inline syntax");
