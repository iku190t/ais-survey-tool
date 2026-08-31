const fs=require("fs");
const http=require("http");
const os=require("os");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));
for(const token of [
  '<meta name="screen-orientation" content="auto">',
  '<meta name="x5-orientation" content="auto">',
  'document.body.classList.remove("portrait-preferred")',
  'screen.orientation.unlock()'
])if(!source.includes(token))throw new Error(`missing landscape support: ${token}`);
if(source.includes('screen.orientation.lock("portrait")'))throw new Error("portrait orientation lock remains");
if(manifest.orientation!=="any")throw new Error(`manifest orientation is not any: ${manifest.orientation}`);

const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
  const relative=pathname==="/"?"index.html":pathname.replace(/^\//,"");
  const file=path.join(root,relative);
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{"Content-Type":file.endsWith(".html")?"text/html":"application/octet-stream"});
  fs.createReadStream(file).pipe(res);
});

(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.route(/^https:\/\//,route=>route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
    const portraitState=await page.evaluate(()=>({
      bodyLeft:document.body.getBoundingClientRect().left,
      canvasLeft:document.getElementById("canvas").getBoundingClientRect().left,
      safeClass:document.body.classList.contains("mobile-landscape-safe-left")
    }));
    if(portraitState.safeClass||Math.abs(portraitState.bodyLeft)>1||Math.abs(portraitState.canvasLeft)>1)throw new Error(`portrait app gained a landscape inset: ${JSON.stringify(portraitState)}`);
    await page.setViewportSize({width:844,height:390});
    await page.evaluate(()=>window.dispatchEvent(new Event("orientationchange")));
    await page.waitForTimeout(500);
    const state=await page.evaluate(()=>{
      const blocker=document.getElementById("landscapeBlocker");
      const topbar=document.getElementById("topbar");
      const canvas=document.getElementById("canvas");
      const interactionCanvas=document.getElementById("interactionCanvas");
      const wrap=document.getElementById("wrap");
      const safeEdge=document.getElementById("gpsDetailSafeEdge");
      const bodyRect=document.body.getBoundingClientRect(),topbarRect=topbar.getBoundingClientRect(),canvasRect=canvas.getBoundingClientRect(),interactionRect=interactionCanvas.getBoundingClientRect(),wrapRect=wrap.getBoundingClientRect(),edgeRect=safeEdge.getBoundingClientRect();
      const startup=document.getElementById("startupBox");
      const startupModalRect=document.getElementById("startupModal").getBoundingClientRect();
      const rect=id=>document.getElementById(id).getBoundingClientRect();
      const firstColumn=["openIconBtn","fitBtn","bgBtn","measureBtn","drawBtn"].map(rect);
      const secondColumn=["profileBtn","textSearchOpenBtn","settingsBtn","helpBtn"].map(rect);
      const layerRect=rect("layerFab"),undoRect=rect("undoFab"),redoRect=rect("redoFab"),detailRect=rect("gpsDetailFab");
      const gpsRect=rect("gpsBtn"),compassRect=rect("compassFab"),streetRect=rect("googleMapsLinkBtn"),creditRect=rect("creditWrap");
      return {
        landscape:innerWidth>innerHeight,
        blockerDisplay:getComputedStyle(blocker).display,
        portraitClass:document.body.classList.contains("portrait-preferred"),
        topbarDisplay:getComputedStyle(topbar).display,
        photoToolDisplay:getComputedStyle(document.getElementById("photoToolBtn")).display,
        canvasWidth:canvas.clientWidth,
        canvasHeight:canvas.clientHeight,
        safeClass:document.body.classList.contains("mobile-landscape-safe-left"),
        safeLeft:Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-landscape-safe-left"))||0,
        innerWidth,
        innerHeight,
        bodyLeft:bodyRect.left,
        bodyRight:bodyRect.right,
        topbarLeft:topbarRect.left,
        topbarRight:topbarRect.right,
        topbarTop:topbarRect.top,
        topbarBottom:topbarRect.bottom,
        wrapLeft:wrapRect.left,
        wrapRight:wrapRect.right,
        wrapWidth:wrapRect.width,
        canvasPosition:getComputedStyle(canvas).position,
        canvasOffsetParent:canvas.offsetParent?.id||canvas.offsetParent?.tagName||null,
        canvasLeft:canvasRect.left-wrapRect.left,
        interactionLeft:interactionRect.left-wrapRect.left,
        detailSecondCharacterLeft:edgeRect.left-wrapRect.left,
        startupModalLeft:startupModalRect.left,
        startupModalRight:startupModalRect.right,
        firstColumn:firstColumn.map(r=>({left:r.left,top:r.top,width:r.width,height:r.height})),
        secondColumn:secondColumn.map(r=>({left:r.left,top:r.top,width:r.width,height:r.height})),
        creditBottom:creditRect.bottom,
        layerTop:layerRect.top-wrapRect.top,
        undoTop:undoRect.top-wrapRect.top,
        redoTop:redoRect.top-wrapRect.top,
        detailTop:detailRect.top-wrapRect.top,
        gpsTop:gpsRect.top-wrapRect.top,
        compassTop:compassRect.top-wrapRect.top,
        streetTop:streetRect.top-wrapRect.top,
        fileButtonVisible:document.getElementById("openIconBtn").getBoundingClientRect().width>0,
        startupScrollable:startup.scrollHeight>startup.clientHeight
      };
    });
    const sameColumn=(items)=>items.every((item,index)=>Math.abs(item.left-items[0].left)<=1&&Math.abs(item.width-48)<=1&&Math.abs(item.height-48)<=1&&(index===0||item.top>items[index-1].top));
    const safeAreaAligned=state.safeClass&&state.safeLeft>30
      &&Math.abs(state.bodyLeft-state.safeLeft)<=1.5
      &&Math.abs(state.bodyRight-state.innerWidth)<=1.5
      &&Math.abs(state.topbarLeft-state.bodyLeft)<=1
      &&Math.abs(state.topbarRight-state.wrapLeft)<=1
      &&Math.abs(state.topbarTop)<=1
      &&Math.abs(state.topbarBottom-state.innerHeight)<=1
      &&Math.abs(state.wrapRight-state.bodyRight)<=1
      &&Math.abs(state.canvasLeft)<=1
      &&Math.abs(state.interactionLeft)<=1
      &&Math.abs(state.detailSecondCharacterLeft-state.safeLeft)<=1.5
      &&Math.abs(state.startupModalLeft-state.wrapLeft)<=1
      &&Math.abs(state.startupModalRight-state.bodyRight)<=1;
    const sidebarAligned=sameColumn(state.firstColumn)&&sameColumn(state.secondColumn)
      &&state.secondColumn[0].left>state.firstColumn[0].left
      &&Math.abs(state.firstColumn[0].top-state.secondColumn[0].top)<=1
      &&Math.abs(state.creditBottom-state.innerHeight)<=8;
    const mapToolsRaised=Math.abs(state.layerTop-12)<=1&&Math.abs(state.undoTop-12)<=1&&Math.abs(state.redoTop-12)<=1
      &&Math.abs(state.detailTop-58)<=1&&Math.abs(state.gpsTop-12)<=1&&Math.abs(state.compassTop-12)<=1&&Math.abs(state.streetTop-58)<=1;
    if(!state.landscape||state.blockerDisplay!=="none"||state.portraitClass||state.topbarDisplay==="none"||state.photoToolDisplay!=="none"||!state.fileButtonVisible||state.canvasWidth<=state.canvasHeight||!state.startupScrollable||!safeAreaAligned||!sidebarAligned||!mapToolsRaised){
      throw new Error(`mobile landscape state failed: ${JSON.stringify(state)}`);
    }
    await page.locator("#startupVideoBtn").scrollIntoViewIfNeeded();
    if(!(await page.locator("#startupVideoBtn").isVisible()))throw new Error("landscape startup actions cannot be reached by scrolling");
    await page.screenshot({path:path.join(os.tmpdir(),"ez-viewer-mobile-landscape.png")});
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>window.dispatchEvent(new Event("orientationchange")));
    await page.waitForTimeout(300);
    const restoredPortrait=await page.evaluate(()=>{
      const bodyRect=document.body.getBoundingClientRect(),topbarRect=document.getElementById("topbar").getBoundingClientRect(),canvasRect=document.getElementById("canvas").getBoundingClientRect();
      return {safeClass:document.body.classList.contains("mobile-landscape-safe-left"),bodyLeft:bodyRect.left,bodyRight:bodyRect.right,topbarLeft:topbarRect.left,topbarRight:topbarRect.right,canvasLeft:canvasRect.left};
    });
    if(restoredPortrait.safeClass||Math.abs(restoredPortrait.bodyLeft)>1||Math.abs(restoredPortrait.bodyRight-390)>1||Math.abs(restoredPortrait.topbarLeft)>1||Math.abs(restoredPortrait.topbarRight-390)>1||Math.abs(restoredPortrait.canvasLeft)>1){
      throw new Error(`portrait layout was not restored after rotation: ${JSON.stringify(restoredPortrait)}`);
    }
    console.log("Mobile portrait/landscape display validated");
  }finally{
    await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
