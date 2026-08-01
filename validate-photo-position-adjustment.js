const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const required=[
  ["Excel出力",'id="photoExcelBtn" type="button">Excel出力</button>'],
  ["一覧表の選択",'id="photoExcelListChoiceBtn" type="button">一覧表を出力</button>'],
  ["写真帳の選択",'id="photoExcelAlbumChoiceBtn" type="button">写真帳を出力</button>'],
  ["位置調整",'id="photoPositionAdjustBtn" type="button" aria-pressed="false">位置調整</button>'],
  ["原EXIF位置の保持","originalXNorth"],
  ["原EXIF方向の保持","originalDirection"],
  ["移動処理","applyPhotoAdjustedWorldPosition(item,worldX,worldY)"],
  ["方向回転処理","Math.atan2(dy,dx)*180/Math.PI"],
  ["DEM再取得","resolvePhotoDemElevation(drag.item)"],
  ["8方向Excel","formatPhotoDirection8(item.direction)"],
  ["Undo登録",'label:drag.kind==="rotate"?"写真方向調整":"写真位置調整"']
];
for(const [name,token] of required)if(!html.includes(token))throw new Error(`${name}がありません`);

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
  const page=await browser.newPage({viewport:{width:1200,height:820}});
  const pageErrors=[];page.on("pageerror",error=>pageErrors.push(String(error)));
  await page.addInitScript(()=>{
    const defs=new Map();
    const mock=(from,to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=(key,value)=>{if(value!==undefined)defs.set(key,value);return defs.get(key)||key;};
    window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"commit",timeout:10000});
  await page.waitForSelector("#canvas",{timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("drawPhotoAnnotationsOverlay")==="function",null,{timeout:10000});
  const initial=await page.evaluate(()=>window.eval(`(()=>{
    loadedSfcText="test";
    data={lines:[],polys:[],splines:[],texts:[],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{},source_name:"test.sfc",_drawingToPaperScale:1};
    rotationDeg=0;view={scale:2,tx:430,ty:360};
    photoAnnotations=[{number:1,fileName:"P1.jpg",lat:34,lon:134,direction:0,capturedAt:"2026:08:01 10:00:00",xNorth:0,yEast:0,demElevation:10,demSource:"DEM1A",demElevationChecked:true,worldX:0,worldY:0,markerX:0,markerY:0,coordinateZone:4,originalLat:34,originalLon:134,originalDirection:0,originalXNorth:0,originalYEast:0,manualPositionAdjusted:false,manualDirectionAdjusted:false,listX:0,listY:-20,listLayoutVersion:2}];
    layerVisibility[PHOTO_POSITION_LAYER_ID]=true;deletedLayerNames.delete(PHOTO_POSITION_LAYER_NAME);
    const panel=document.getElementById("photoListPanel");panel.style.display="flex";
    document.getElementById("startupModal").style.display="none";
    renderPhotoListPanel();setPhotoPositionAdjustMode(true);scheduleDraw();
    const g=getPhotoMarkerScreenGeometry(photoAnnotations[0]);
    return {center:g.center,button:document.getElementById("photoPositionAdjustBtn").textContent,active:photoPositionAdjustIsActive(),hit:hitTestPhotoPositionAdjust(g.center[0],g.center[1])?.kind};
  })()`));
  if(initial.button!=="位置調整中"||!initial.active||initial.hit!=="move")throw new Error(`位置調整ボタンが起動状態になりません: ${JSON.stringify(initial)}`);
  const rect=await page.locator("#canvas").boundingBox();
  await page.mouse.move(rect.x+initial.center[0],rect.y+initial.center[1]);
  await page.mouse.down();await page.mouse.move(rect.x+initial.center[0]+30,rect.y+initial.center[1]+18,{steps:3});await page.mouse.up();
  const moved=await page.evaluate(()=>window.eval(`({manual:photoAnnotations[0].manualPositionAdjusted,x:photoAnnotations[0].markerX,y:photoAnnotations[0].markerY,planeX:photoAnnotations[0].xNorth,planeY:photoAnnotations[0].yEast,undo:editUndoActions.at(-1)?.label})`));
  if(!moved.manual||Math.hypot(moved.x,moved.y)<1||moved.undo!=="写真位置調整")throw new Error(`写真位置のドラッグが反映されません: ${JSON.stringify(moved)}`);
  await page.evaluate(()=>window.eval(`photoAnnotations[0].demElevationChecked=true`));
  const geometry=await page.evaluate(()=>window.eval(`getPhotoMarkerScreenGeometry(photoAnnotations[0])`));
  await page.mouse.move(rect.x+geometry.tip[0],rect.y+geometry.tip[1]);
  await page.mouse.down();await page.mouse.move(rect.x+geometry.center[0]+42,rect.y+geometry.center[1],{steps:3});await page.mouse.up();
  const rotated=await page.evaluate(()=>window.eval(`({direction:photoAnnotations[0].direction,manual:photoAnnotations[0].manualDirectionAdjusted,label:editUndoActions.at(-1)?.label,text:formatPhotoDirection8(photoAnnotations[0].direction),sfcAngle:buildPhotoAnnotationExportStrokes().find(s=>s.photoTextLabel)?.photoTextLabel?.angle})`));
  if(!rotated.manual||rotated.label!=="写真方向調整"||!rotated.text||rotated.sfcAngle!==0)throw new Error("写真方向または水平番号の反映に失敗しました");
  const beforeUndo=rotated.direction;
  const history=await page.evaluate(()=>window.eval(`(()=>{undoLastEdit();const undone=photoAnnotations[0].direction;redoLastEdit();return {undone,redone:photoAnnotations[0].direction};})()`));
  if(Math.abs(history.undone-beforeUndo)<1e-6||Math.abs(history.redone-beforeUndo)>1e-6)throw new Error(`写真位置調整のUndo/Redoに失敗しました: ${JSON.stringify({beforeUndo,history,rotated})}`);
  await page.locator("#photoExcelBtn").click();
  const excelChoice=await page.evaluate(()=>({display:getComputedStyle(document.getElementById("photoExcelChoiceModal")).display,list:document.getElementById("photoExcelListChoiceBtn").textContent,album:document.getElementById("photoExcelAlbumChoiceBtn").textContent}));
  if(excelChoice.display!=="flex"||excelChoice.list!=="一覧表を出力"||excelChoice.album!=="写真帳を出力")throw new Error("Excel出力の選択画面が正しく開きません");
  if(pageErrors.length)throw new Error(`ページエラー: ${pageErrors.join(" | ")}`);
  console.log("photo position adjustment checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
