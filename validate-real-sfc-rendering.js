const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const input=process.argv[2];
if(!input||!fs.existsSync(input))throw new Error("usage: node validate-real-sfc-rendering.js <real.sfc>");
const screenshot=process.argv[3]||path.join(process.env.TEMP||root,"ez-viewer-real-sfc.png");

const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase();
  res.setHeader("Content-Type",ext===".js"?"text/javascript; charset=utf-8":ext===".png"?"image/png":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:1365,height:768}});
  if(process.env.TEST_LINE_SCALE){
    await page.addInitScript(scale=>localStorage.setItem("sfcviewer-ui-preferences-v1",JSON.stringify({displayLineWidthScale:Number(scale)})),process.env.TEST_LINE_SCALE);
  }
  const errors=[];
  page.on("pageerror",error=>errors.push(String(error)));
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/?real-sfc-test=1`,{waitUntil:"load",timeout:10000});
  await page.locator("#fileInput").setInputFiles(input);
  await page.waitForFunction(()=>document.getElementById("startupModal").style.display==="none"&&data.lines.length+data.polys.length+data.texts.length>0,null,{timeout:20000});
  await page.waitForTimeout(500);
  const metrics=await page.evaluate(()=>{
    const bounds=items=>{
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,vertices=0,maxSegment=0;
      for(const item of items||[]){
        const pts=item[0]||[];vertices+=pts.length;
        for(let i=0;i<pts.length;i++){
          const x=+pts[i][0],y=+pts[i][1];
          minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
          if(i)maxSegment=Math.max(maxSegment,Math.hypot(x-pts[i-1][0],y-pts[i-1][1]));
        }
      }
      return {minX,minY,maxX,maxY,vertices,maxSegment};
    };
    const widths=[...data.lines.map(v=>v[6]),...data.polys.map(v=>v[3]),...(data.splines||[]).map(v=>v[3])].filter(Number.isFinite);
    const screenWidths=widths.map(v=>scaledDisplayLineWidthPx(v));
    return {
      counts:{lines:data.lines.length,polys:data.polys.length,splines:(data.splines||[]).length,texts:data.texts.length,circles:data.circles.length,arcs:(data.arcs||[]).length},
      polyBounds:bounds(data.polys),splineBounds:bounds(data.splines),
      widths:{min:Math.min(...widths),max:Math.max(...widths),screenMax:Math.max(...screenWidths),displayLineWidthScale},
      drawingToPaperScale:data._drawingToPaperScale,
      mainDrawingPlacement:data._mainDrawingPlacement,
      partialFiguresExpanded:data._partialFiguresExpanded,
      view:{x:view.x,y:view.y,scale:view.scale,zoom:view.zoom},
      canvas:{width:canvas.width,height:canvas.height},
      startupIcons:Array.from(document.querySelectorAll("#topbar .toolIconBtn")).map(button=>({id:button.id,opacity:getComputedStyle(button).opacity,disabled:button.disabled,dimmed:button.classList.contains("dimmed")}))
    };
  });
  await page.screenshot({path:screenshot});
  if(errors.length)throw new Error(errors.join(" | "));
  console.log(JSON.stringify({input,screenshot,metrics},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
