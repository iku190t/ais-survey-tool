const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const [name,token] of [
  ["PC限定EXIF先頭読込み","PHOTO_EXIF_PREFIX_BYTES=512*1024"],
  ["JPEG部分読込み","file.slice(0,PHOTO_EXIF_PREFIX_BYTES).arrayBuffer()"],
  ["EXIF全体読込みフォールバック","parsePhotoExifBuffer(await file.arrayBuffer())"],
  ["PC写真の4並列解析","profileMapLimit(selected,4,processPhotoFile)"],
  ["スマホの逐次解析","await processPhotoFile(selected[index],index)"]
])if(!html.includes(token))throw new Error(`${name}がありません`);

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
  const pageErrors=[];page.on("pageerror",error=>pageErrors.push(String(error)));
  await page.addInitScript(()=>{
    const defs=new Map();
    const mock=(_from,_to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=(key,value)=>{if(value!==undefined)defs.set(key,value);return defs.get(key)||key;};
    window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"commit",timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("readPhotoExif")==="function",null,{timeout:10000});
  const result=await page.evaluate(()=>window.eval(`(async()=>{
    const originalParser=parsePhotoExifBuffer;
    const makeFile=(fullSize,prefixShouldFail=false)=>{
      let sliceReads=0,fullReads=0;
      const file={
        size:fullSize,
        slice(){return {arrayBuffer:async()=>{sliceReads++;return new ArrayBuffer(PHOTO_EXIF_PREFIX_BYTES);}};},
        arrayBuffer:async()=>{fullReads++;return new ArrayBuffer(fullSize);}
      };
      parsePhotoExifBuffer=buffer=>{
        if(prefixShouldFail&&buffer.byteLength===PHOTO_EXIF_PREFIX_BYTES)throw new RangeError('truncated');
        return {lat:34,lon:134,direction:90,capturedAt:'2026:08:03 10:00:00'};
      };
      return {file,reads:()=>({sliceReads,fullReads})};
    };
    try{
      const fast=makeFile(PHOTO_EXIF_PREFIX_BYTES*4,false);
      const fastExif=await readPhotoExif(fast.file);
      const fallback=makeFile(PHOTO_EXIF_PREFIX_BYTES*4,true);
      const fallbackExif=await readPhotoExif(fallback.file);
      return {desktop:isDesktopPhotoTool(),fast:fast.reads(),fallback:fallback.reads(),fastExif,fallbackExif};
    }finally{parsePhotoExifBuffer=originalParser;}
  })()`));
  if(!result.desktop)throw new Error("PC判定になっていません");
  if(result.fast.sliceReads!==1||result.fast.fullReads!==0)throw new Error(`先頭読込みが不正です: ${JSON.stringify(result.fast)}`);
  if(result.fallback.sliceReads!==1||result.fallback.fullReads!==1)throw new Error(`全体読込みフォールバックが不正です: ${JSON.stringify(result.fallback)}`);
  if(result.fastExif.lat!==34||result.fallbackExif.direction!==90)throw new Error("EXIF結果が維持されていません");
  if(pageErrors.length)throw new Error(`ページエラー: ${pageErrors.join(" | ")}`);
  console.log("photo network import checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
