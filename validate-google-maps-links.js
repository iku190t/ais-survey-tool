const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");
const JSZip=require("jszip");

const root=__dirname;
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const feature=fs.readFileSync(path.join(root,"google-maps-links.js"),"utf8");
for(const token of [
  'id="googleMapsLinkBtn"',
  'id="photoAlbumMapQrBtn"',
  '<script src="google-maps-links.js?v=1"></script>',
  'const useMapQr=!!settings.mapQr',
  'await addPhotoImage(photo,photoRect'
])if(!index.includes(token))throw new Error(`Google連携の実装が不足しています: ${token}`);
for(const token of [
  "map_action=map","basemap=satellite",'map_action:"pano"',"heading",
  "ezviewer-google-map","ezviewer-google-streetview","createPhotoQrImage"
])if(!feature.includes(token))throw new Error(`Google URL連携が不足しています: ${token}`);
if(/maps\.googleapis\.com|AIza[0-9A-Za-z_-]+/.test(feature))throw new Error("Google Maps Platform APIまたはAPIキーが混入しています");

const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase();
  res.setHeader("Content-Type",ext===".js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const pageErrors=[];page.on("pageerror",error=>pageErrors.push(String(error)));
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  await page.waitForFunction(()=>window.GoogleMapsLinkFeature&&document.getElementById("googleMapsLinkModal"));
  const urls=await page.evaluate(()=>(
    {
      map:GoogleMapsLinkFeature.buildMapUrl({lat:34.0701,lon:134.5502}),
      street:GoogleMapsLinkFeature.buildStreetViewUrl({lat:34.0701,lon:134.5502},91.25),
      qr:GoogleMapsLinkFeature.buildMapSearchUrl({lat:34.0701,lon:134.5502}),
      bearing:GoogleMapsLinkFeature.bearing({lat:34,lon:134},{lat:34,lon:134.01})
    }
  ));
  if(!urls.map.includes("map_action=map")||!urls.map.includes("basemap=satellite"))throw new Error(`航空写真URLが不正です: ${urls.map}`);
  if(!urls.street.includes("map_action=pano")||!urls.street.includes("heading=91.25"))throw new Error(`ストリートビューURLが不正です: ${urls.street}`);
  if(!urls.qr.includes("/maps/search/")||!urls.qr.includes("query="))throw new Error(`QR用URLが不正です: ${urls.qr}`);
  if(Math.abs(urls.bearing-90)>0.1)throw new Error(`方位角が不正です: ${urls.bearing}`);

  const ui=await page.evaluate(async()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,1000,1000,1,1,1]];loadedSfcText="test";updateDrawingDependentUi();
    const calls=[];window.open=(url,name)=>{calls.push({url,name});return {closed:false,location:{href:url}};};
    resolveProfileZone=async()=>4;sfcWorldToPlane=()=>({xNorth:100,yEast:200});jgd2024XYToLatLon=()=>({lat:34.0701,lon:134.5502});
    document.getElementById("googleMapsLinkBtn").click();
    await GoogleMapsLinkFeature.selectWorldPoint({x:1000,y:2000});
    document.getElementById("googleOpenMapBtn").click();
    document.getElementById("googleSelectDirectionBtn").click();
    jgd2024XYToLatLon=()=>({lat:34.0701,lon:134.5602});
    await GoogleMapsLinkFeature.selectWorldPoint({x:2000,y:2000});
    document.getElementById("googleOpenStreetBtn").click();
    return {
      modal:getComputedStyle(document.getElementById("googleMapsLinkModal")).display,
      active:document.getElementById("googleMapsLinkBtn").classList.contains("modeActive"),
      calls
    };
  });
  if(ui.modal!=="flex"||!ui.active)throw new Error(`Google連携パネルが開きません: ${JSON.stringify(ui)}`);
  if(ui.calls[0]?.name!=="ezviewer-google-map"||ui.calls[1]?.name!=="ezviewer-google-streetview")throw new Error(`PC専用タブ名が不正です: ${JSON.stringify(ui.calls)}`);
  if(!ui.calls[1]?.url.includes("heading="))throw new Error("ストリートビューへ2点方向が渡されていません");

  const qr=await page.evaluate(async()=>{
    window.QRCode=function(host,options){
      const canvas=document.createElement("canvas");canvas.width=options.width;canvas.height=options.height;
      const c=canvas.getContext("2d");c.fillStyle="#fff";c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle="#000";
      for(let y=0;y<24;y++)for(let x=0;x<24;x++)if((x*y+x+y)%3===0)c.fillRect(x*16,y*16,16,16);
      host.appendChild(canvas);
    };
    window.QRCode.CorrectLevel={M:0};
    const image=await GoogleMapsLinkFeature.createPhotoQrImage({lat:34.0701,lon:134.5502});
    return {type:image?.blob?.type,size:image?.blob?.size,width:image?.width,height:image?.height};
  });
  if(qr.type!=="image/png"||qr.size<1000||qr.width!==440||qr.height!==500)throw new Error(`写真QR画像が不正です: ${JSON.stringify(qr)}`);

  const workbookBase64=await page.evaluate(()=>window.eval(`(async()=>{
    photoAnnotations=[{number:1,fileName:'P1.jpg',lat:34.0701,lon:134.5502,direction:90,capturedAt:'2026:08:08 10:00:00',xNorth:100,yEast:200,demElevation:10,demSource:'DEM1A',demElevationChecked:true,worldX:1000,worldY:2000,markerX:1000,markerY:2000}];
    data={lines:[[0,0,1000,0,'L']],polys:[],splines:[],texts:[],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{L:'L'},source_name:'test.sfc',_drawingToPaperScale:1};layerVisibility.L=true;photoSourceFiles.clear();
    const canvas=document.createElement('canvas');canvas.width=180;canvas.height=120;const c=canvas.getContext('2d');c.fillStyle='#ddd';c.fillRect(0,0,180,120);
    const photo=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));photoSourceFiles.set(photoAlbumSourceKey('P1.jpg'),new File([photo],'P1.jpg',{type:'image/jpeg'}));
    const blob=await buildPhotoAlbumXlsx({layout:'3',spread:false,comment1:'number',comment2:'fileName',comment3:'capturedAt',custom1:'',custom2:'',custom3:'',miniMap:false,mapQr:true});
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);
  })()`));
  const workbookBuffer=Buffer.from(workbookBase64,"base64");
  if(process.env.GOOGLE_QR_TEST_OUTPUT)fs.writeFileSync(process.env.GOOGLE_QR_TEST_OUTPUT,workbookBuffer);
  const zip=await JSZip.loadAsync(workbookBuffer);
  const drawing=await zip.file("xl/drawings/drawing1.xml").async("string");
  const media=Object.keys(zip.files).filter(name=>name.startsWith("xl/media/")&&!zip.files[name].dir);
  if(media.length!==2||!drawing.includes("GoogleマップQR 1"))throw new Error(`写真帳へQRが配置されていません: media=${media.length}`);
  if(pageErrors.length)throw new Error(`ページエラー: ${pageErrors.join(" | ")}`);
  console.log("Google browser links and photo-album map QR validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();server.close();
});
