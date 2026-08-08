const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  "function shouldConfirmRegistryDownload(alreadyDownloaded=false)",
  "return !alreadyDownloaded&&!isDesktopPhotoTool()",
  "function cancelRegistryMapOperation(options={})",
  "registryMapAbortController?.abort()",
  "function updateRegistryBusyProgress(progress={})",
  'registryMapAutoBtn.textContent=registryMapAutoBusy?"キャンセル":registryMapState.loaded?"解除":"図面範囲"',
  'cancelRegistryMapOperation({closePanel:true})',
  'fetch(resource.url,{cache:"force-cache",signal})',
  'showBusy("法務局地図をダウンロード中…")'
])if(!source.includes(token))throw new Error(`法務局地図の進捗・キャンセル実装が不足しています: ${token}`);

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
  const errors=[];desktop.on("pageerror",error=>errors.push(String(error)));
  await desktop.route(/^https:\/\//,route=>route.abort());
  await desktop.goto(base,{waitUntil:"load",timeout:10000});
  const desktopResult=await desktop.evaluate(()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,10,10,1,1,1]];loadedSfcText="test";updateDrawingDependentUi();
    const confirmation=shouldConfirmRegistryDownload(false);
    showBusy("test");updateRegistryBusyProgress({received:5*1024*1024,total:10*1024*1024});
    const progress={
      hidden:busyProgress.hidden,
      count:busyProgressCount.textContent,
      percent:busyProgressPercent.textContent,
      width:busyProgressFill.style.width
    };hideBusy();

    registryMapAutoBusy=true;registryMapAbortController=new AbortController();
    const firstSignal=registryMapAbortController.signal;updateRegistryMapUi();
    const busyButton={text:registryMapAutoBtn.textContent,active:registryMapAutoBtn.classList.contains("active"),disabled:registryMapAutoBtn.disabled};
    registryMapAutoBtn.click();
    const panelCancel={aborted:firstSignal.aborted,busy:registryMapAutoBusy,text:registryMapAutoBtn.textContent};

    registryMapPanel.style.display="block";registryMapAutoBusy=true;registryMapAbortController=new AbortController();
    const secondSignal=registryMapAbortController.signal;updateRegistryMapUi();updateToolbarActivationUI();
    document.getElementById("registryToolbarBtn").click();
    const toolbarCancel={aborted:secondSignal.aborted,busy:registryMapAutoBusy,panel:getComputedStyle(registryMapPanel).display,active:document.getElementById("registryToolbarBtn").classList.contains("modeActive")};

    registryMapState=registryEmptyState();registryMapState.loaded=true;updateRegistryMapUi();
    const loadedText=registryMapAutoBtn.textContent;registryMapAutoBtn.click();
    return {confirmation,progress,busyButton,panelCancel,toolbarCancel,loadedText,loadedAfterClick:registryMapState.loaded};
  });
  if(desktopResult.confirmation)throw new Error("PCで容量確認が有効です");
  if(desktopResult.progress.hidden||desktopResult.progress.count!=="5.0MB／10.0MB"||desktopResult.progress.percent!=="50％"||desktopResult.progress.width!=="50%")throw new Error(`共通進捗バーが不正です: ${JSON.stringify(desktopResult.progress)}`);
  if(desktopResult.busyButton.text!=="キャンセル"||!desktopResult.busyButton.active||desktopResult.busyButton.disabled)throw new Error(`取得中ボタンが不正です: ${JSON.stringify(desktopResult.busyButton)}`);
  if(!desktopResult.panelCancel.aborted||desktopResult.panelCancel.busy||desktopResult.panelCancel.text!=="図面範囲")throw new Error(`図面範囲ボタンでキャンセルできません: ${JSON.stringify(desktopResult.panelCancel)}`);
  if(!desktopResult.toolbarCancel.aborted||desktopResult.toolbarCancel.busy||desktopResult.toolbarCancel.panel!=="none"||desktopResult.toolbarCancel.active)throw new Error(`上部ボタンでキャンセルできません: ${JSON.stringify(desktopResult.toolbarCancel)}`);
  if(desktopResult.loadedText!=="解除"||desktopResult.loadedAfterClick)throw new Error("表示済み法務局地図を解除できません");

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.route(/^https:\/\//,route=>route.abort());
  await mobile.goto(base,{waitUntil:"load",timeout:10000});
  const mobileResult=await mobile.evaluate(async()=>{
    const confirmation=shouldConfirmRegistryDownload(false);
    const promise=confirmRegistryDownload({size:13*1024*1024},"テスト地域");
    const visible=getComputedStyle(document.getElementById("registryDownloadConfirmModal")).display;
    const message=document.getElementById("registryDownloadConfirmMessage").textContent;
    closeRegistryDownloadConfirm(false);
    const accepted=await promise;
    return {confirmation,visible,message,accepted};
  });
  if(!mobileResult.confirmation||mobileResult.visible!=="flex"||!mobileResult.message.includes("13.0MB")||mobileResult.accepted)throw new Error(`スマホ容量確認が不正です: ${JSON.stringify(mobileResult)}`);
  if(errors.length)throw new Error(`ページエラー: ${errors.join(" | ")}`);
  console.log("Registry mobile-only confirmation, shared progress and cancel controls validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();server.close();
});
