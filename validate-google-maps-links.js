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
  'id="photoAlbumMiniMap"',
  'id="photoAlbumMapQr" type="checkbox" checked',
  '<script src="google-maps-links.js?v=3"></script>',
  'const useMapQr=!!settings.mapQr',
  'a:hlinkClick r:id="rIdLink${image.id}"'
])if(!index.includes(token))throw new Error(`Google連携の実装が不足しています: ${token}`);
for(const absent of ['id="photoAlbumMapQrBtn"','id="googleOpenMapBtn"','id="googleOpenStreetBtn"','id="googleSelectDirectionBtn"']){
  if(index.includes(absent)||feature.includes(absent))throw new Error(`廃止した操作が残っています: ${absent}`);
}
for(const token of [
  "data=!3m1!1e3",'map_action:"pano"',"heading",
  "ezviewer-google-map","ezviewer-google-streetview","prepareExternalWindows","createPhotoQrImage"
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
      bearing:GoogleMapsLinkFeature.bearing({lat:34,lon:134},{lat:34,lon:134.01}),
      buttonOutsideTopbar:!document.getElementById("topbar")?.contains(document.getElementById("googleMapsLinkBtn")),
      buttonTop:parseFloat(getComputedStyle(document.getElementById("googleMapsLinkBtn")).top),
      qrChecked:document.getElementById("photoAlbumMapQr")?.checked,
      qrNextToMini:document.getElementById("photoAlbumMiniMapLabel")?.nextElementSibling?.id
    }
  ));
  if(!urls.map.includes("/maps/@34.0701,134.5502,20z/")||!urls.map.includes("data=!3m1!1e3"))throw new Error(`航空写真URLが不正です: ${urls.map}`);
  if(!urls.street.includes("map_action=pano")||!urls.street.includes("heading=91.25"))throw new Error(`ストリートビューURLが不正です: ${urls.street}`);
  if(!urls.qr.includes("/maps/search/")||!urls.qr.includes("query="))throw new Error(`QR用URLが不正です: ${urls.qr}`);
  if(Math.abs(urls.bearing-90)>0.1)throw new Error(`方位角が不正です: ${urls.bearing}`);
  if(!urls.buttonOutsideTopbar||!(urls.buttonTop>=55))throw new Error(`Googleボタンが方位の下へ配置されていません: ${JSON.stringify(urls)}`);
  if(!urls.qrChecked||urls.qrNextToMini!=="photoAlbumMapQrLabel")throw new Error("QRチェックが豆図の横で初期ONになっていません");

  const ui=await page.evaluate(async()=>{
    document.getElementById("startupModal").style.display="none";
    data.lines=[[0,0,1000,1000,1,1,1]];loadedSfcText="test";updateDrawingDependentUi();
    const opened=[];
    window.open=(url,name,features)=>{
      const record={url,name,features,moves:[],sizes:[],closed:false};
      const handle={closed:false,moveTo:(...args)=>record.moves.push(args),resizeTo:(...args)=>record.sizes.push(args)};
      Object.defineProperty(handle,"location",{value:{get href(){return record.url;},set href(value){record.url=value;}}});
      opened.push(record);return handle;
    };
    resolveProfileZone=async()=>4;
    screenToWorld=(x,y)=>[x,y];
    sfcWorldToPlane=(x,y)=>({xNorth:x,yEast:y});
    const conversions=[{lat:34.0701,lon:134.5502},{lat:34.0701,lon:134.5602},{lat:34.0801,lon:134.5702},{lat:34.0901,lon:134.5802}];
    let conversion=0;
    jgd2024XYToLatLon=()=>conversions[Math.min(conversion++,conversions.length-1)];
    document.getElementById("googleMapsLinkBtn").click();
    const target=document.getElementById("canvas")||document.getElementById("interactionCanvas");
    target.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:100,clientY:100,button:0}));
    await new Promise(resolve=>setTimeout(resolve,20));
    target.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:200,clientY:100,button:0}));
    await new Promise(resolve=>setTimeout(resolve,30));
    target.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:300,clientY:100,button:0}));
    await new Promise(resolve=>setTimeout(resolve,20));
    target.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:400,clientY:100,button:0}));
    await new Promise(resolve=>setTimeout(resolve,30));
    return {
      modal:getComputedStyle(document.getElementById("googleMapsLinkModal")).display,
      active:document.getElementById("googleMapsLinkBtn").classList.contains("modeActive"),
      status:document.getElementById("googleMapsLinkStatus").textContent,
      opened
    };
  });
  if(ui.modal!=="flex"||!ui.active)throw new Error(`Google連携パネルが開きません: ${JSON.stringify(ui)}`);
  if(ui.opened.length!==2)throw new Error(`2画面を1回ずつ開いていません: ${JSON.stringify(ui.opened)}`);
  const street=ui.opened.find(item=>item.name==="ezviewer-google-streetview");
  const map=ui.opened.find(item=>item.name==="ezviewer-google-map");
  if(!street?.url.includes("map_action=pano")||!street.url.includes("heading="))throw new Error(`ストリートビューが方向付きで開きません: ${JSON.stringify(street)}`);
  if(!map?.url.includes("data=!3m1!1e3"))throw new Error(`航空写真が開きません: ${JSON.stringify(map)}`);
  if(!map.url.includes("34.0801,134.5702"))throw new Error(`同じ2画面を次の選択位置へ更新できません: ${JSON.stringify(map)}`);
  if(!street.moves.length||!map.moves.length)throw new Error("PCの左右配置が実行されていません");

  const qr=await page.evaluate(async()=>{
    window.QRCode=function(host,options){
      const canvas=document.createElement("canvas");canvas.width=options.width;canvas.height=options.height;
      const c=canvas.getContext("2d");c.fillStyle="#fff";c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle="#000";
      for(let y=0;y<24;y++)for(let x=0;x<24;x++)if((x*y+x+y)%3===0)c.fillRect(x*16,y*16,16,16);
      host.appendChild(canvas);
    };
    window.QRCode.CorrectLevel={M:0};
    const image=await GoogleMapsLinkFeature.createPhotoQrImage({lat:34.0701,lon:134.5502});
    return {type:image?.blob?.type,size:image?.blob?.size,width:image?.width,height:image?.height,url:image?.url};
  });
  if(qr.type!=="image/png"||qr.size<1000||qr.width!==416||qr.height!==416||!qr.url.includes("/maps/search/"))throw new Error(`写真QR画像が不正です: ${JSON.stringify(qr)}`);

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
  const rels=await zip.file("xl/drawings/_rels/drawing1.xml.rels").async("string");
  const media=Object.keys(zip.files).filter(name=>name.startsWith("xl/media/")&&!zip.files[name].dir);
  if(media.length!==2||!drawing.includes("GoogleマップQR 1"))throw new Error(`写真帳へQRが配置されていません: media=${media.length}`);
  if(drawing.includes("Googleマップで表示"))throw new Error("QR画像の下に不要な文字が残っています");
  if(!drawing.includes('a:hlinkClick r:id="rIdLink2"')||!rels.includes('Id="rIdLink2"')||!rels.includes('TargetMode="External"')||!rels.includes("maps/search")){
    throw new Error("QR画像にGoogleマップのハイパーリンクが設定されていません");
  }
  if(pageErrors.length)throw new Error(`ページエラー: ${pageErrors.join(" | ")}`);
  const qrAnchor=(drawing.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)||[]).find(anchor=>anchor.includes('rIdLink2'))||"";
  if(!/<xdr:from>[\s\S]*?<xdr:col>(?:7|8|9|10|11|12)<\/xdr:col>/.test(qrAnchor))throw new Error("Mini-map OFF QR is not in the mini-map area");
  console.log("Google two-point windows and clickable photo-album QR validated");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();server.close();
});
