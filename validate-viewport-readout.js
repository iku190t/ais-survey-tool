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
  let addressRequests=0;
  await page.route('https://geoapi.heartrails.com/**',async r=>{addressRequests++;await r.fulfill({json:{response:{location:[{prefecture:'テスト県',city:'テスト市',town:'テスト町',x:'134',y:'34'}]}}});});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(()=>{document.getElementById('startupModal').style.display='none';gpsOnlyBlankMode=true;view.scale=.1;view.tx=100;view.ty=200;profileZone=4;ensureProj4Defs=()=>true;jgd2024XYToLatLon=()=>({lat:34,lon:134});sampleDemElevationBilinear=async()=>12.345;});
  await page.waitForTimeout(1200);
  if(size[0]>=1000){
   assert(await page.locator('#viewportReadout').isHidden());
   assert(!await page.evaluate(()=>document.body.classList.contains('viewport-instruments')));
   assert.equal(addressRequests,0);
   assert.deepEqual(errors,[]);console.log('PASS desktop instruments disabled');await page.close();continue;
  }
  assert.match(await page.locator('#viewportElevation').textContent(),/12.35/);
  assert.equal(await page.locator('#viewportAddress').textContent(),'付近: テスト県テスト市テスト町');
  assert.equal(addressRequests,1);
  assert(await page.evaluate(()=>document.getElementById('viewportAddress').getBoundingClientRect().bottom<=document.getElementById('viewportXY').getBoundingClientRect().top));
  for(const dark of [true,false]){
   await page.evaluate(d=>{darkTheme=d;},dark);await page.waitForTimeout(130);
   assert.equal(await page.locator('#viewportReadout').evaluate(e=>getComputedStyle(e).color),dark?'rgb(255, 255, 255)':'rgb(0, 0, 0)');
   assert.equal(await page.locator('#viewportCoordinates').evaluate(e=>getComputedStyle(e,'::before').backgroundColor),dark?'rgba(0, 0, 0, 0.95)':'rgba(255, 255, 255, 0.95)');
   assert(await page.locator('#viewportCoordinates').evaluate(e=>{const p=getComputedStyle(e,'::before'),h=document.getElementById('viewportReadout').getBoundingClientRect(),r=e.getBoundingClientRect();return Math.abs(r.left+parseFloat(p.left)-h.left)<1&&Math.abs(r.right-parseFloat(p.right)-h.right)<1;}));
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
  assert(await page.evaluate(()=>{const s=document.getElementById('viewportScale').getBoundingClientRect(),b=document.getElementById('gpsReturnBtn').getBoundingClientRect(),c=document.getElementById('viewportCoordinates').getBoundingClientRect();return Math.abs(s.left-b.left)<1&&c.bottom<=innerHeight;}));
  assert.equal(addressRequests,1,'cached location reused during view changes');
  await page.evaluate(()=>{profileZone=null;});await page.waitForTimeout(150);
  assert.equal(await page.locator('#viewportAddress').textContent(),'付近の住所: —');
  if(size[0]===390){
   await page.route('https://geoapi.heartrails.com/**',async r=>{addressRequests++;await new Promise(resolve=>setTimeout(resolve,500));await r.fulfill({json:{response:{location:[{prefecture:'古い県',city:'古い市',town:'古い町',x:'135',y:'35'}]}}}).catch(()=>{});});
   await page.evaluate(()=>{profileZone=4;jgd2024XYToLatLon=()=>({lat:35,lon:135});});
   await page.waitForFunction(()=>document.getElementById('viewportAddress').textContent==='付近の住所: …');
   while(addressRequests<2)await page.waitForTimeout(100);
   await page.evaluate(()=>{jgd2024XYToLatLon=()=>({lat:36,lon:136});view.tx+=10;});
   await page.waitForTimeout(650);
   assert(!/古い/.test(await page.locator('#viewportAddress').textContent()),'stale reply ignored');
   await page.route('https://geoapi.heartrails.com/**',async r=>{addressRequests++;await r.fulfill({status:503,body:'unavailable'});});
   await page.waitForFunction(()=>document.getElementById('viewportAddress').textContent==='付近の住所: 取得できません',{},{timeout:8000});
   const count=addressRequests;await page.waitForTimeout(1000);assert.equal(addressRequests,count,'failure does not loop');
   assert.match(await page.locator('#viewportXY').textContent(),/X:/);
  }
  console.log('PASS',size,layout);await page.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
