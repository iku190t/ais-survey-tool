const fs=require("fs");
const http=require("http");
const path=require("path");
const {chromium}=require("playwright");
const JSZip=require("jszip");

const root=__dirname;
const server=http.createServer((req,res)=>{
  const clean=decodeURIComponent((req.url||"/").split("?")[0]);
  const file=path.join(root,clean==="/"?"index.html":clean.replace(/^\//,""));
  if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase();
  res.setHeader("Content-Type",ext===".js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(file));
});

function decodeBase64(value){return Buffer.from(value,"base64");}
async function inspectWorkbook(buffer,expectedEndColumn,minimumImages){
  const zip=await JSZip.loadAsync(buffer);
  const workbook=await zip.file("xl/workbook.xml").async("string");
  const sheet=await zip.file("xl/worksheets/sheet1.xml").async("string");
  const drawing=await zip.file("xl/drawings/drawing1.xml").async("string");
  const media=Object.keys(zip.files).filter(name=>name.startsWith("xl/media/")&&!zip.files[name].dir);
  if(!workbook.includes(`$${expectedEndColumn}$`))throw new Error(`印刷範囲の終端が${expectedEndColumn}ではありません`);
  if(!sheet.includes('horizontalCentered="1" verticalCentered="1"'))throw new Error("ページ中央設定がありません");
  if(media.length<minimumImages)throw new Error(`豆図を含む画像数が不足しています: ${media.length}`);
  if(!drawing.includes('<a:ln w="6350">'))throw new Error("写真の0.5pt枠がありません");
  return {media:media.length,workbook,sheet,drawing};
}

let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
  const page=await browser.newPage({viewport:{width:1200,height:820}});
  await page.addInitScript(()=>{
    const defs=new Map();
    const mock=(_from,_to,coordinate)=>Array.isArray(coordinate)?coordinate:[0,0];
    mock.defs=(key,value)=>{if(value!==undefined)defs.set(key,value);return defs.get(key)||key;};
    window.proj4=mock;window.shp=async()=>({type:"FeatureCollection",features:[]});
  });
  await page.route(/^https:\/\//,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"commit",timeout:10000});
  await page.waitForFunction(()=>typeof window.eval("buildPhotoAlbumXlsx")==="function",null,{timeout:10000});
  const output=await page.evaluate(()=>window.eval(`(async()=>{
    loadedSfcText="test";
    data={lines:[[0,0,1000,0,"L"],[1000,0,1000,1000,"L"],[1000,1000,0,1000,"L"]],polys:[],splines:[],texts:[],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{L:"L"},source_name:"test.sfc",_drawingToPaperScale:1};
    layerVisibility.L=true;photoSourceFiles.clear();
    photoAnnotations=Array.from({length:4},(_,index)=>({number:index+1,fileName:'P'+(index+1)+'.jpg',direction:index*45,capturedAt:'2026:08:02 10:00:0'+index,xNorth:index,yEast:index,demElevation:10+index,demSource:'DEM1A',demElevationChecked:true,worldX:index*120,worldY:index*80,markerX:index*120,markerY:index*80}));
    for(const item of photoAnnotations){
      const canvas=document.createElement('canvas');canvas.width=180;canvas.height=120;
      const c=canvas.getContext('2d');c.fillStyle='#dbeafe';c.fillRect(0,0,180,120);c.fillStyle='#1d4ed8';c.font='24px sans-serif';c.fillText(item.fileName,18,65);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
      photoSourceFiles.set(photoAlbumSourceKey(item.fileName),new File([blob],item.fileName,{type:'image/jpeg'}));
    }
    const settings={comment1:'number',comment2:'fileName',comment3:'capturedAt',custom1:'',custom2:'',custom3:'',miniMap:true};
    const encode=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);};
    const progress=[],stages=[];
    const threeBlob=await buildPhotoAlbumXlsx({...settings,layout:'3'},(completed,total)=>progress.push(completed+'/'+total),stage=>stages.push(stage));
    return {three:await encode(threeBlob),four:await encode(await buildPhotoAlbumXlsx({...settings,layout:'4'})),spread:await encode(await buildPhotoAlbumXlsx({...settings,layout:'spread'})),progress,stages};
  })()`));
  const three=await inspectWorkbook(decodeBase64(output.three),"M",8);
  const four=await inspectWorkbook(decodeBase64(output.four),"M",8);
  const spread=await inspectWorkbook(decodeBase64(output.spread),"Y",8);
  if(process.env.PHOTO_ALBUM_TEST_OUTPUT){
    fs.mkdirSync(process.env.PHOTO_ALBUM_TEST_OUTPUT,{recursive:true});
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-3.xlsx"),decodeBase64(output.three));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-4.xlsx"),decodeBase64(output.four));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-spread.xlsx"),decodeBase64(output.spread));
  }
  if(!spread.sheet.includes('<col min="1" max="9" width="4.27"')||!spread.sheet.includes('<col min="17" max="25" width="4.27"'))throw new Error("見開きが以前の3枚形式と同じ幅ではありません");
  if(!three.sheet.includes('<col min="1" max="6" width="9.6"')||!three.sheet.includes('<col min="8" max="13" width="6.4"'))throw new Error("3枚形式が以前の写真・コメント幅ではありません");
  if(!four.sheet.includes('<col min="1" max="6" width="8"')||!four.sheet.includes('<col min="8" max="13" width="6.4"'))throw new Error("4枚形式の写真幅またはコメント幅が正しくありません");
  if(output.progress.join(",")!=="1/4,2/4,3/4,4/4")throw new Error(`写真枚数の進捗が正しくありません: ${output.progress.join(",")}`);
  if(output.stages.join(",")!=="excel")throw new Error(`Excel作成段階へ切り替わりません: ${output.stages.join(",")}`);
  const progressUi=await page.evaluate(()=>{
    showBusy("写真帳を作成中…");updateBusyPhotoCount(7,17);
    const result={hidden:busyProgress.hidden,count:busyProgressCount.textContent,percent:busyProgressPercent.textContent,width:busyProgressFill.style.width};
    hideBusy();return result;
  });
  if(progressUi.hidden||progressUi.count!=="7／17枚"||progressUi.percent!=="41％"||progressUi.width!=="41%")throw new Error(`進捗バー表示が正しくありません: ${JSON.stringify(progressUi)}`);
  console.log(`photo album runtime checks passed (3-photo media=${three.media}, 4-photo media=${four.media}, spread media=${spread.media})`);
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
