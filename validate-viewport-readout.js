const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const server=http.createServer((req,res)=>{const p=path.join(__dirname,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);if(!fs.existsSync(p)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(p));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 for(const size of [[390,844],[844,390],[1280,800]]){
  const page=await browser.newPage({viewport:{width:size[0],height:size[1]},hasTouch:size[0]<1000,isMobile:size[0]<1000});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https:\/\//,r=>r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(()=>{document.getElementById('startupModal').style.display='none';gpsOnlyBlankMode=true;view.scale=.1;view.tx=100;view.ty=200;profileZone=4;ensureProj4Defs=()=>true;jgd2024XYToLatLon=()=>({lat:34,lon:134});sampleDemElevationBilinear=async()=>12.345;});
  await page.waitForTimeout(700);
  if(size[0]>=1000){
   assert(await page.locator('#viewportReadout').isHidden());
   assert(!await page.evaluate(()=>document.body.classList.contains('viewport-instruments')));
   assert.deepEqual(errors,[]);console.log('PASS desktop instruments disabled');await page.close();continue;
  }
  assert.match(await page.locator('#viewportElevation').textContent(),/12.35/);
  for(const dark of [true,false]){
   await page.evaluate(d=>{darkTheme=d;},dark);await page.waitForTimeout(130);
   assert.equal(await page.locator('#viewportReadout').evaluate(e=>getComputedStyle(e).color),dark?'rgb(255, 255, 255)':'rgb(0, 0, 0)');
   assert.equal(await page.locator('#viewportCoordinates').evaluate(e=>getComputedStyle(e).backgroundColor),dark?'rgba(0, 0, 0, 0.5)':'rgba(255, 255, 255, 0.5)');
  }
  const before=await page.locator('#viewportXY').textContent();
  await page.evaluate(()=>{view.tx+=100;rotationDeg=37;});await page.waitForTimeout(150);
  assert.notEqual(await page.locator('#viewportXY').textContent(),before);
  const oldWidth=await page.locator('#viewportScale').evaluate(e=>e.getBoundingClientRect().width);
  const oldLabel=await page.locator('#viewportScale').textContent();
  await page.evaluate(()=>{view.scale*=2;});await page.waitForTimeout(150);
  assert.equal(await page.locator('#viewportScale').evaluate(e=>e.getBoundingClientRect().width),oldWidth);
  assert.notEqual(await page.locator('#viewportScale').textContent(),oldLabel);
  await page.evaluate(()=>{for(const id of ['gpsReturnBtn','droggerOwnerActions','mapAttributionPanel'])document.getElementById(id).classList.add('show');});await page.waitForTimeout(150);
  const layout=await page.evaluate(()=>{
   const h=document.getElementById('viewportReadout').getBoundingClientRect(),c=document.getElementById('viewportCoordinates').getBoundingClientRect(),s=document.getElementById('viewportScale').getBoundingClientRect();
   return {centerError:Math.abs((c.left+c.right-h.left-h.right)/2),safe:c.left>=h.left+27&&c.right<=h.right-27,overlap:['gpsReturnBtn','droggerOwnerActions','mapAttributionPanel'].some(id=>{const b=document.getElementById(id).getBoundingClientRect();return b.width&&b.height&&((c.left<b.right&&c.right>b.left&&c.top<b.bottom&&c.bottom>b.top)||(s.left<b.right&&s.right>b.left&&s.top<b.bottom&&s.bottom>b.top));}),pointer:getComputedStyle(document.getElementById('viewportReadout')).pointerEvents};
  });
  assert(layout.safe);assert(layout.centerError<1);assert(!layout.overlap,JSON.stringify(layout));assert.equal(layout.pointer,'none');assert.deepEqual(errors,[]);
  const placement=await page.evaluate(()=>{const s=document.getElementById('viewportScale').getBoundingClientRect(),b=document.getElementById('gpsReturnBtn').getBoundingClientRect(),c=document.getElementById('viewportCoordinates').getBoundingClientRect();return {ratio:s.width/b.width,between:s.top>=b.bottom&&s.bottom<=c.top,labels:document.querySelectorAll('#viewportScale text').length};});
  assert(Math.abs(placement.ratio-2/3)<.01);assert(placement.between,JSON.stringify(placement));assert.equal(placement.labels,1);
  assert.match(await page.locator('#viewportScale').textContent(),/^\d+(?:\.\d)? (?:m|cm|km)$/);
  assert(await page.evaluate(()=>{const s=document.getElementById('viewportScale').getBoundingClientRect(),c=document.getElementById('viewportCoordinates').getBoundingClientRect();return Math.abs((s.left+s.right-c.left-c.right)/2)<1&&c.bottom<=innerHeight;}));
  console.log('PASS',size,layout);await page.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
