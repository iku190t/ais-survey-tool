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
        bodyLeft:bodyRect.left,
        bodyRight:bodyRect.right,
        topbarLeft:topbarRect.left,
        wrapLeft:wrapRect.left,
        canvasLeft:canvasRect.left-wrapRect.left,
        interactionLeft:interactionRect.left-wrapRect.left,
        detailSecondCharacterLeft:edgeRect.left-wrapRect.left,
        startupModalLeft:startupModalRect.left,
        startupModalRight:startupModalRect.right,
        fileButtonVisible:document.getElementById("openIconBtn").getBoundingClientRect().width>0,
        startupScrollable:startup.scrollHeight>startup.clientHeight
      };
    });
    const safeAreaAligned=state.safeClass&&state.safeLeft>30
      &&Math.abs(state.bodyLeft-state.safeLeft)<=1.5
      &&Math.abs(state.bodyRight-state.innerWidth)<=1.5
      &&Math.abs(state.topbarLeft-state.bodyLeft)<=1
      &&Math.abs(state.wrapLeft-state.bodyLeft)<=1
      &&Math.abs(state.canvasLeft)<=1
      &&Math.abs(state.interactionLeft)<=1
      &&Math.abs(state.detailSecondCharacterLeft-state.safeLeft)<=1.5
      &&Math.abs(state.startupModalLeft-state.bodyLeft)<=1
      &&Math.abs(state.startupModalRight-state.bodyRight)<=1;
    if(!state.landscape||state.blockerDisplay!=="none"||state.portraitClass||state.topbarDisplay==="none"||state.photoToolDisplay!=="none"||!state.fileButtonVisible||state.canvasWidth<=state.canvasHeight||!state.startupScrollable||!safeAreaAligned){
      throw new Error(`mobile landscape state failed: ${JSON.stringify(state)}`);
    }
    await page.locator("#startupVideoBtn").scrollIntoViewIfNeeded();
    if(!(await page.locator("#startupVideoBtn").isVisible()))throw new Error("landscape startup actions cannot be reached by scrolling");
    await page.screenshot({path:path.join(os.tmpdir(),"ez-viewer-mobile-landscape.png")});
    console.log("Mobile portrait/landscape display validated");
  }finally{
    await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
