const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
if(source.includes("enableVectorBaseMapAfterDrawingLoad"))throw new Error("基盤地図の自動起動処理が残っています");
if(!source.includes('id="vectorMapSettingRow"'))throw new Error("スマホ用基盤地図行が見つかりません");

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
  const base=`http://127.0.0.1:${server.address().port}/`;
  const desktop=await browser.newPage({viewport:{width:1440,height:900}});
  await desktop.route(/^https:\/\//,route=>route.abort());
  await desktop.goto(base,{waitUntil:"load",timeout:10000});
  await desktop.locator("#fileInput").setInputFiles(path.join(root,"sample.sfc"));
  await desktop.waitForFunction(()=>hasLoadedDrawing()&&data.lines.length>100,undefined,{timeout:15000});
  const loadedInitial=await desktop.evaluate(()=>({
    enabled:vectorBaseMapEnabled,
    resolving:vectorBaseMapResolveBusy,
    mapActive:document.getElementById("backgroundSxfToolbarBtn").classList.contains("modeActive")
  }));
  if(loadedInitial.enabled||loadedInitial.resolving||loadedInitial.mapActive)throw new Error(`図面読込み直後に基盤地図がONです: ${JSON.stringify(loadedInitial)}`);
  await desktop.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,10,1,1,1]];
    vectorBaseMapEnabled=false;
    updateDrawingDependentUi();
    updateAerialPhotoUi();
    updateToolbarActivationUI();
  });
  if(await desktop.locator("#vectorMapSettingRow").isVisible())throw new Error("PC背景内に基盤地図スイッチが残っています");
  const initial=await desktop.evaluate(()=>({
    mapActive:document.getElementById("backgroundSxfToolbarBtn").classList.contains("modeActive"),
    backgroundActive:["bgAerialActive","bgTerrainActive","bgBothActive","modeActive"].some(name=>document.getElementById("bgBtn").classList.contains(name))
  }));
  if(initial.mapActive||initial.backgroundActive)throw new Error(`初期状態がOFFではありません: ${JSON.stringify(initial)}`);
  const toggled=await desktop.evaluate(()=>{
    vectorBaseMapEnabled=true;
    updateAerialPhotoUi();
    updateToolbarActivationUI();
    return {
      mapActive:document.getElementById("backgroundSxfToolbarBtn").classList.contains("modeActive"),
      backgroundActive:["bgAerialActive","bgTerrainActive","bgBothActive","modeActive"].some(name=>document.getElementById("bgBtn").classList.contains(name))
    };
  });
  if(!toggled.mapActive||toggled.backgroundActive)throw new Error(`PCボタンの選択色が分離されていません: ${JSON.stringify(toggled)}`);

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.route(/^https:\/\//,route=>route.abort());
  await mobile.goto(base,{waitUntil:"load",timeout:10000});
  await mobile.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,10,1,1,1]];
    updateDrawingDependentUi();
    document.getElementById("aerialPhotoPanel").style.display="block";
  });
  if(!(await mobile.locator("#vectorMapSettingRow").isVisible()))throw new Error("スマホ背景内の基盤地図スイッチまで消えています");
  if(await mobile.locator("#backgroundSxfToolbarBtn").isVisible())throw new Error("スマホにPC用基盤地図ボタンが表示されています");
  console.log("Base map manual toggle and independent PC active state validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
