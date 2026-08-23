const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
if(!source.includes("const RECENT_DRAWING_LIMIT=3;"))throw new Error("recent drawing limit is not 3");

const server=http.createServer((request,response)=>{
  const clean=decodeURIComponent((request.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){response.writeHead(404);response.end();return;}
  response.setHeader("Content-Type",path.extname(file)===".js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  response.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.route(/^https:\/\//,route=>route.abort());
  await page.addInitScript(entries=>{
    localStorage.setItem("sfcviewer.recentDrawings.v1",JSON.stringify(entries));
  },Array.from({length:5},(_,index)=>({
    id:`old-${index+1}`,name:`図面${index+1}.sfc`,size:100+index,lastModified:1000+index,openedAt:5000-index
  })));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  await page.waitForFunction(()=>document.querySelectorAll("#startupRecentList .recentDrawingButton").length===3);
  const initial=await page.evaluate(async()=>({
    stored:(await readRecentDrawingHistory()).map(entry=>entry.name),
    startup:Array.from(document.querySelectorAll("#startupRecentList .recentDrawingButton"),button=>button.textContent),
    menu:Array.from(document.querySelectorAll("#saveMenuRecentList .recentDrawingButton"),button=>button.textContent)
  }));
  const expected=["図面1.sfc","図面2.sfc","図面3.sfc"];
  if(JSON.stringify(initial.stored)!==JSON.stringify(expected)||JSON.stringify(initial.startup)!==JSON.stringify(expected)||JSON.stringify(initial.menu)!==JSON.stringify(expected)){
    throw new Error(`existing recent drawings were not limited to 3: ${JSON.stringify(initial)}`);
  }
  await page.evaluate(()=>rememberRecentDrawing({name:"最新図面.sfc",size:999,lastModified:9999},null));
  const updated=await page.evaluate(async()=>({
    stored:(await readRecentDrawingHistory()).map(entry=>entry.name),
    startup:Array.from(document.querySelectorAll("#startupRecentList .recentDrawingButton"),button=>button.textContent),
    menu:Array.from(document.querySelectorAll("#saveMenuRecentList .recentDrawingButton"),button=>button.textContent)
  }));
  const updatedExpected=["最新図面.sfc","図面1.sfc","図面2.sfc"];
  if(JSON.stringify(updated.stored)!==JSON.stringify(updatedExpected)||JSON.stringify(updated.startup)!==JSON.stringify(updatedExpected)||JSON.stringify(updated.menu)!==JSON.stringify(updatedExpected)){
    throw new Error(`newest recent drawing was not promoted within the 3-item limit: ${JSON.stringify(updated)}`);
  }
  console.log("PC recent drawing history limit and ordering validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
