const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");

const root=__dirname;
const source=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const token of [
  "PROFILE_TILE_MEMORY_CACHE_LIMIT_PC = 200",
  "PROFILE_TILE_MEMORY_CACHE_LIMIT_MOBILE = 80",
  "function trimProfileTileMemoryCache()",
  "function buildBoundsSpatialIndex(",
  "function queryBoundsSpatialIndex(",
  "target._textHitSpatialIndex=buildBoundsSpatialIndex",
  "function getPhotoMiniMapVisibleSegments(",
  "const LARGE_DRAWING_TOUCH_FRAME_MS=32",
  "function scheduleTouchTransformDraw()",
  "function finishTouchTransformDraw()"
])if(!source.includes(token))throw new Error(`missing performance implementation: ${token}`);

const desktopWheelBlock=source.slice(source.indexOf('canvas.addEventListener("wheel"'),source.indexOf('canvas.addEventListener("dblclick"'));
const desktopDoubleClickBlock=source.slice(source.indexOf('canvas.addEventListener("dblclick"'),source.indexOf('// iOS Safari'));
const desktopWheelFinishBlock=source.slice(source.indexOf('function finishDesktopWheelZoomPreview()'),source.indexOf('function finishTouchPanPreview('));
if([desktopWheelBlock,desktopDoubleClickBlock,desktopWheelFinishBlock].some(block=>block.includes("scheduleRecoverySnapshot"))){
  throw new Error("view-only zoom still triggers a full recovery snapshot");
}
if(!/applyTwoFingerTransformFromTouches\(t1, t2\);[\s\S]{0,180}scheduleTouchTransformDraw\(\)/.test(source))throw new Error("two-finger zoom is not using throttled drawing");
if(!/touchMode==="onefingerzoom"[\s\S]{0,900}scheduleTouchTransformDraw\(\)/.test(source))throw new Error("one-finger zoom is not using throttled drawing");

const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase();
  res.setHeader("Content-Type",ext===".js"?"text/javascript; charset=utf-8":ext===".webmanifest"?"application/manifest+json":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:1200,height:820}});
  await page.addInitScript(()=>{
    const mock=(_from,_to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=key=>key;window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"load",timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("buildBoundsSpatialIndex")==="function",null,{timeout:10000});
  const result=await page.evaluate(()=>window.eval(`(()=>{
    profileTileMemoryCache.clear();profileTileMemoryPending.clear();
    for(let i=0;i<230;i++)profileTileMemoryCache.set('pc-'+i,Promise.resolve(new Uint8ClampedArray(4)));
    trimProfileTileMemoryCache();
    const pcCacheSize=profileTileMemoryCache.size;
    const originalMobileLike=isTouchMobileLike;
    isTouchMobileLike=()=>true;
    profileTileMemoryCache.clear();
    for(let i=0;i<100;i++)profileTileMemoryCache.set('mobile-'+i,Promise.resolve(new Uint8ClampedArray(4)));
    trimProfileTileMemoryCache();
    const mobileCacheSize=profileTileMemoryCache.size;
    isTouchMobileLike=originalMobileLike;

    const items=Array.from({length:20000},(_,i)=>({id:i,x:i%200,y:Math.floor(i/200)}));
    const index=buildBoundsSpatialIndex(items,item=>({minx:item.x-.2,miny:item.y-.2,maxx:item.x+.2,maxy:item.y+.2}),12,64,true);
    const bounds={minx:99.5,miny:49.5,maxx:100.5,maxy:50.5};
    const candidates=queryBoundsSpatialIndex(index,bounds);
    const expected=items.filter(item=>item.x+.2>=bounds.minx&&item.x-.2<=bounds.maxx&&item.y+.2>=bounds.miny&&item.y-.2<=bounds.maxy);
    const candidateIds=new Set(candidates.map(item=>item.id));
    const missing=expected.filter(item=>!candidateIds.has(item.id)).length;

    const textItems=Array.from({length:500},(_,i)=>({
      x:(i%25)*14,y:Math.floor(i/25)*12,h:4+(i%3),w:7+(i%5),sp:.2,
      angle:(i%9)*10-40,align1:i%9+1,align2:i%11===0?2:1,
      text:i%11===0?'縦書'+i:'TXT'+i,layer:'L',_sxfFeatureId:i+1
    }));
    data=prepareRenderMetadata({lines:[],polys:[],splines:[],texts:textItems,circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{L:'L'}},1000);
    loadedSfcText='test';currentLoadedKind='sfc';showText=true;layerVisibility={L:true};
    view={scale:1.4,tx:320,ty:220};rotationDeg=17;
    let textHitMismatches=0,textHitComparisons=0;
    for(let i=0;i<textItems.length;i+=5){
      const screen=worldToScreen(textItems[i].x,textItems[i].y);
      for(const offset of [[0,0],[5,0],[-5,0],[0,5],[0,-5]]){
        const savedIndex=data._textHitSpatialIndex;
        const indexedHit=findEditableTextAtScreen(screen[0]+offset[0],screen[1]+offset[1]);
        data._textHitSpatialIndex=null;
        const fullHit=findEditableTextAtScreen(screen[0]+offset[0],screen[1]+offset[1]);
        data._textHitSpatialIndex=savedIndex;
        textHitComparisons++;
        if((indexedHit?._sxfFeatureId||0)!==(fullHit?._sxfFeatureId||0))textHitMismatches++;
      }
    }

    const geometry=[];
    for(let y=0;y<100;y++)for(let x=0;x<200;x++)geometry.push([x,y,x+.8,y+.2]);
    geometry._spatialIndex=buildBoundsSpatialIndex(geometry,segment=>({minx:segment[0],miny:segment[1],maxx:segment[2],maxy:segment[3]}),28,96,false);
    const visible=getPhotoMiniMapVisibleSegments(geometry,100,50,5);
    const miniExpected=geometry.filter(segment=>segment[2]>=95&&segment[0]<=105&&segment[3]>=45&&segment[1]<=55);
    const visibleSet=new Set(visible);
    const miniMissing=miniExpected.filter(segment=>!visibleSet.has(segment)).length;
    profileTileMemoryCache.clear();profileTileMemoryPending.clear();
    return {pcCacheSize,mobileCacheSize,candidates:candidates.length,totalItems:items.length,missing,textHitMismatches,textHitComparisons,visible:visible.length,totalSegments:geometry.length,miniMissing};
  })()`));
  if(result.pcCacheSize!==200)throw new Error(`DEM LRU cache size is ${result.pcCacheSize}`);
  if(result.mobileCacheSize!==80)throw new Error(`mobile DEM LRU cache size is ${result.mobileCacheSize}`);
  if(result.missing)throw new Error(`text spatial index missed ${result.missing} nearby items`);
  if(result.candidates>=result.totalItems/10)throw new Error(`text spatial query is too broad: ${result.candidates}`);
  if(result.textHitMismatches)throw new Error(`indexed text hit differs from full scan in ${result.textHitMismatches}/${result.textHitComparisons} cases`);
  if(result.miniMissing)throw new Error(`mini-map spatial index missed ${result.miniMissing} nearby segments`);
  if(result.visible>=result.totalSegments/10)throw new Error(`mini-map spatial query is too broad: ${result.visible}`);
  console.log(`performance index checks passed (DEM=${result.pcCacheSize}/${result.mobileCacheSize}, text=${result.candidates}/${result.totalItems} and ${result.textHitComparisons} hit comparisons, mini=${result.visible}/${result.totalSegments})`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  server.close();
});
