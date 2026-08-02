const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const source=fs.readFileSync("index.html","utf8");
const required=[
  'id="coordinateInspectCopyAllBtn"',
  'id="coordinateInspectDifference"',
  'setCoordinateInspectDifferenceResult(dem1a,dem5a)',
  'const [dem1a,dem5a]=await Promise.all([sample(dem1aSource),sample(dem5aSource)])',
  '`${x},${y},${elevation}`',
  'replace(/\\s*m\\s*$/i,"")',
  'startTextLongPress(e.clientX,e.clientY,"mouse")',
  'setTouchPanPreview(e.clientX-lastX,e.clientY-lastY)',
  '#coordinateInspectBox{width:min(238px,86vw)',
  '-webkit-user-select:text;user-select:text;',
  'setCoordinateInspectValue("coordinateInspectElevation",elevation.toFixed(3));',
  'event.clipboardData.setData("text/plain",value);',
];
for(const token of required)if(!source.includes(token))throw new Error(`missing implementation: ${token}`);
if(source.includes('id="terrainDifferenceBtn"'))throw new Error("DEM差ボタンが残っています");
if(source.includes('class="coordinateCopyBtn"'))throw new Error("個別コピーボタンが残っています");

const root=__dirname;
const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader("Content-Type",path.extname(file).toLowerCase()===".js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:1200,height:820}});
  await page.addInitScript(()=>{
    const defs=new Map();
    const mock=(_from,_to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=(key,value)=>{if(value!==undefined)defs.set(key,value);return defs.get(key)||key;};
    window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("copyAllCoordinateInspectValues")==="function",null,{timeout:10000});
  const result=await page.evaluate(()=>window.eval(`(async()=>{
    window.__copiedCoordinate="";
    try{Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{window.__copiedCoordinate=value;}}});}catch(_error){}
    try{Object.defineProperty(window,"isSecureContext",{configurable:true,value:true});}catch(_error){}
    setCoordinateInspectValue("coordinateInspectX","219.458");
    setCoordinateInspectValue("coordinateInspectY","-49942.675");
    setCoordinateInspectValue("coordinateInspectElevation","59.190 m");
    setCoordinateInspectDifferenceResult(59.190,58.940);
    updateCoordinateInspectCopyButtons();
    const copyButton=document.getElementById("coordinateInspectCopyAllBtn");
    await copyAllCoordinateInspectValues(copyButton);
    const copy={value:window.__copiedCoordinate,text:copyButton.textContent,display:copyButton.style.display};
    const difference={value:document.getElementById("coordinateInspectDifferenceValue")?.textContent,details:document.getElementById("coordinateInspectDifferenceDetails")?.textContent};

    view.tx=100;view.ty=200;
    const rect=canvas.getBoundingClientRect(),x=rect.left+220,y=rect.top+180;
    canvas.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0,buttons:1,clientX:x,clientY:y}));
    window.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,button:0,buttons:1,clientX:x+45,clientY:y+35}));
    window.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,button:0,buttons:0,clientX:x+45,clientY:y+35}));
    const left={tx:view.tx,ty:view.ty};

    canvas.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:1,buttons:4,clientX:x,clientY:y}));
    window.dispatchEvent(new MouseEvent("mousemove",{bubbles:true,button:1,buttons:4,clientX:x+45,clientY:y+35}));
    window.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,button:1,buttons:0,clientX:x+45,clientY:y+35}));
    const middle={tx:view.tx,ty:view.ty};
    const values=[...document.querySelectorAll(".coordinateInspectRow strong")];
    document.getElementById("coordinateInspectModal").style.display="flex";
    const selection=window.getSelection();
    selection.removeAllRanges();
    const range=document.createRange();
    range.selectNodeContents(document.getElementById("coordinateInspectX"));
    selection.addRange(range);
    const copiedTypes={};let selectionCopyPrevented=false;
    copyCoordinateInspectSelectionAsPlainText({
      clipboardData:{setData:(type,value)=>{copiedTypes[type]=value;}},
      preventDefault:()=>{selectionCopyPrevented=true;}
    });
    selection.removeAllRanges();
    const compact={
      individualCopies:document.querySelectorAll(".coordinateCopyBtn").length,
      boxWidth:getComputedStyle(document.getElementById("coordinateInspectBox")).width,
      gridGap:getComputedStyle(document.getElementById("coordinateInspectGrid")).gap,
      selectable:values.every(element=>getComputedStyle(element).userSelect==="text")
    };
    return {copy,difference,left,middle,compact,selectionCopy:{types:copiedTypes,prevented:selectionCopyPrevented}};
  })()`));
  if(result.copy.value!=="219.458,-49942.675,59.190")throw new Error(`まとめてコピーが不正です: ${JSON.stringify(result.copy)}`);
  if(result.copy.text!=="コピー済み"||result.copy.display!=="inline-flex")throw new Error(`まとめてコピーボタンの表示が不正です: ${JSON.stringify(result.copy)}`);
  if(result.difference.value!=="0.250 m"||!result.difference.details.includes("DEM1A：59.190 m")||!result.difference.details.includes("DEM5A：58.940 m"))throw new Error(`DEM標高差の情報表示が不正です: ${JSON.stringify(result.difference)}`);
  if(result.left.tx!==100||result.left.ty!==200)throw new Error(`PC左ドラッグで図面が移動しました: ${JSON.stringify(result.left)}`);
  if(result.middle.tx!==145||result.middle.ty!==235)throw new Error(`中ドラッグの既存パンが動きません: ${JSON.stringify(result.middle)}`);
  if(result.compact.individualCopies!==0||!result.compact.selectable||result.compact.gridGap!=="2px")throw new Error(`情報画面の簡素化が不正です: ${JSON.stringify(result.compact)}`);
  if(!result.selectionCopy.prevented||result.selectionCopy.types["text/plain"]!=="219.458"||Object.hasOwn(result.selectionCopy.types,"text/html"))throw new Error(`反転コピーに書式が混入します: ${JSON.stringify(result.selectionCopy)}`);
  console.log("coordinate inspect copy and PC pan checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
