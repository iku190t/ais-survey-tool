const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=__dirname;
const server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');
  res.end(fs.readFileSync(file));
});
let browser;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/^https:\/\//,route=>route.abort());
  await page.addInitScript(()=>{
    const projection=(from,to,xy)=>from==='EPSG:4326'?[xy[0]*1000,xy[1]*1000]:[xy[0]/1000,xy[1]/1000];
    projection.defs=key=>key;window.proj4=projection;
    let tick=null;
    // Public Hiroshima fixture. No device geolocation is requested.
    const position={coords:{latitude:34.3853,longitude:132.4553,accuracy:4,altitude:10},timestamp:Date.now()};
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      watchPosition(success){tick=success;return 1;},clearWatch(){tick=null;},
      getCurrentPosition(success){success(position);}
    }});
    window.__sendZoneTestPosition=()=>tick?.(position);
  });
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const timing=await page.evaluate(()=>{
    const begin=performance.now(),zone=chooseJapanPlaneZone(34.3853,132.4553);
    const firstMs=performance.now()-begin;
    const repeated=performance.now();
    for(let i=0;i<1000;i++)chooseJapanPlaneZone(34.3853,132.4553);
    return {zone,firstMs,queries1000Ms:performance.now()-repeated};
  });
  assert.equal(timing.zone,3);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  assert(await page.evaluate(()=>{const started=startGps({allowWithoutDrawing:true});window.__sendZoneTestPosition();return started;}));
  assert.deepEqual(await page.evaluate(()=>({zone:gpsPosition.zone,temporary:gpsTemporaryCoordinateZone,aerial:aerialPhotoZone})),{zone:3,temporary:3,aerial:3});
  await page.evaluate(()=>stopGps());
  await page.evaluate(async()=>{
    await handleLoadedSource(await(await fetch('sample.sfc')).text(),'sample.sfc',null,{restoreRecovery:false});
    saveDrawingCoordinateSetting('4');
    window.__zoneTestSource=loadedSfcText;
    startGps();window.__sendZoneTestPosition();
  });
  assert.deepEqual(await page.evaluate(async()=>({manual:getManualCoordinateZone(),gps:gpsPosition.zone,temporary:gpsTemporaryCoordinateZone,background:await resolveProfileZone()})),{manual:4,gps:3,temporary:3,background:3});
  const redraw=await page.evaluate(async()=>{
    const resolver=window.EzJapanPlaneZoneResolver;let calls=0;
    window.EzJapanPlaneZoneResolver={ready:resolver.ready,resolve(...args){calls++;return resolver.resolve(...args);}};
    gpsFollow=false;
    for(let i=0;i<20;i++){
      view.tx+=1;view.ty-=1;view.scale*=1.001;
      setDrawingRotationPreserveCenter(i*2);scheduleDraw();
      await new Promise(requestAnimationFrame);
    }
    window.EzJapanPlaneZoneResolver=resolver;
    return calls;
  });
  assert.equal(redraw,0,'Pan/zoom/rotation must not rerun administrative lookup');
  await page.evaluate(()=>stopGps());
  assert.deepEqual(await page.evaluate(async()=>({manual:getManualCoordinateZone(),background:await resolveProfileZone(),sourceUnchanged:loadedSfcText===window.__zoneTestSource})),{manual:4,background:4,sourceUnchanged:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({test:'offline zone browser integration',cpuThrottle:4,...timing,redrawZoneLookups:redraw,manualZonePreserved:true}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
