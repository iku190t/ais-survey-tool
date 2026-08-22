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
function drawingAnchorForName(drawing,name){
  return (drawing.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)||[]).find(anchor=>anchor.includes(`name="${name}"`))||"";
}
function anchorMarker(anchor,tag){
  const block=anchor.match(new RegExp(`<xdr:${tag}>([\\s\\S]*?)<\\/xdr:${tag}>`))?.[1]||"";
  const number=name=>Number(block.match(new RegExp(`<xdr:${name}>(-?\\d+)<\\/xdr:${name}>`))?.[1]||0);
  return {col:number("col"),colOff:number("colOff"),row:number("row"),rowOff:number("rowOff")};
}
function assertQrInsidePhoto(drawing,number,label){
  const photo=drawingAnchorForName(drawing,`写真 ${number}`),qr=drawingAnchorForName(drawing,`GoogleマップQR ${number}`);
  if(!photo||!qr)throw new Error(`${label}の写真またはQRがありません`);
  const pf=anchorMarker(photo,"from"),pt=anchorMarker(photo,"to"),qf=anchorMarker(qr,"from"),qt=anchorMarker(qr,"to");
  const afterOrEqual=(a,b,axis)=>a[axis]>b[axis]||(a[axis]===b[axis]&&a[`${axis}Off`]>=b[`${axis}Off`]);
  const beforeOrEqual=(a,b,axis)=>a[axis]<b[axis]||(a[axis]===b[axis]&&a[`${axis}Off`]<=b[`${axis}Off`]);
  if(!afterOrEqual(qf,pf,"col")||!beforeOrEqual(qt,pt,"col")||!afterOrEqual(qf,pf,"row")||!beforeOrEqual(qt,pt,"row"))throw new Error(`${label}のQRが写真右上の内部にありません`);
}
async function inspectWorkbook(buffer,expectedEndColumn,minimumImages){
  const zip=await JSZip.loadAsync(buffer);
  const workbook=await zip.file("xl/workbook.xml").async("string");
  const sheet=await zip.file("xl/worksheets/sheet1.xml").async("string");
  const drawing=await zip.file("xl/drawings/drawing1.xml").async("string");
  const drawingRels=await zip.file("xl/drawings/_rels/drawing1.xml.rels").async("string");
  const media=Object.keys(zip.files).filter(name=>name.startsWith("xl/media/")&&!zip.files[name].dir);
  if(!workbook.includes(`$${expectedEndColumn}$`))throw new Error(`印刷範囲の終端が${expectedEndColumn}ではありません`);
  if(!sheet.includes('horizontalCentered="1" verticalCentered="1"'))throw new Error("ページ中央設定がありません");
  if(media.length<minimumImages)throw new Error(`豆図を含む画像数が不足しています: ${media.length}`);
  if(!drawing.includes('<a:ln w="6350">'))throw new Error("写真の0.5pt枠がありません");
  const qrCount=(drawing.match(/name="GoogleマップQR /g)||[]).length;
  const shapeLinkCount=(drawing.match(/<xdr:sp macro="" textlink="">[\s\S]*?<xdr:cNvPr id="\d+" name="Googleマップリンク \d+">[\s\S]*?<a:hlinkClick r:id="rIdLink\d+"\/>[\s\S]*?<a:alpha val="0"\/>[\s\S]*?<\/xdr:sp>/g)||[]).length;
  const drawingLinkRelCount=(drawingRels.match(/Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/hyperlink"/g)||[]).length;
  if(qrCount&&shapeLinkCount!==qrCount)throw new Error(`PDF用透明リンク数がQR数と一致しません: QR=${qrCount}, link=${shapeLinkCount}`);
  if(qrCount&&drawingLinkRelCount!==qrCount)throw new Error(`QRリンク関係数がQR数と一致しません: QR=${qrCount}, rel=${drawingLinkRelCount}`);
  if(qrCount&&!drawingRels.includes('Target="https://maps.google.com/?q=35,134" TargetMode="External"'))throw new Error("Googleマップ外部リンクがありません");
  return {media:media.length,workbook,sheet,drawing,drawingRels,qrCount,shapeLinkCount};
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
  await page.waitForFunction(()=>window.eval("typeof buildPhotoAlbumXlsx")==="function",null,{timeout:10000});
  const output=await page.evaluate(()=>window.eval(`(async()=>{
    window.GoogleMapsLinkFeature={...(window.GoogleMapsLinkFeature||{}),createPhotoQrImage:async item=>{
      const canvas=document.createElement('canvas');canvas.width=120;canvas.height=120;
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,120,120);context.fillStyle='#000';context.fillRect(8,8,104,104);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      return {blob,width:120,height:120,extension:'png',contentType:'image/png',url:'https://maps.google.com/?q=35,134'};
    }};
    loadedSfcText="test";
    data={lines:[[0,0,1000,0,"L"],[1000,0,1000,1000,"L"],[1000,1000,0,1000,"L"]],polys:[],splines:[],texts:[],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{L:"L"},source_name:"test.sfc",_drawingToPaperScale:1};
    layerVisibility.L=true;photoSourceFiles.clear();
    photoAnnotations=Array.from({length:6},(_,index)=>({number:index+1,fileName:'P'+(index+1)+'.jpg',direction:index*45,capturedAt:'2026:08:02 10:00:0'+index,xNorth:index,yEast:index,demElevation:10+index,demSource:'DEM1A',demElevationChecked:true,worldX:index*120,worldY:index*80,markerX:index*120,markerY:index*80}));
    for(const item of photoAnnotations){
      const canvas=document.createElement('canvas');canvas.width=180;canvas.height=120;
      const c=canvas.getContext('2d');c.fillStyle='#dbeafe';c.fillRect(0,0,180,120);c.fillStyle='#1d4ed8';c.font='24px sans-serif';c.fillText(item.fileName,18,65);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
      photoSourceFiles.set(photoAlbumSourceKey(item.fileName),new File([blob],item.fileName,{type:'image/jpeg'}));
    }
    const settings={comment1:'number',comment2:'fileName',comment3:'capturedAt',custom1:'',custom2:'',custom3:'',miniMap:true,mapQr:true,spread:false};
    const encode=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);};
    const progress=[],stages=[];
    const threeBlob=await buildPhotoAlbumXlsx({...settings,layout:'3'},(completed,total)=>progress.push(completed+'/'+total),stage=>stages.push(stage));
    return {
      two:await encode(await buildPhotoAlbumXlsx({...settings,layout:'2'})),three:await encode(threeBlob),four:await encode(await buildPhotoAlbumXlsx({...settings,layout:'4'})),six:await encode(await buildPhotoAlbumXlsx({...settings,layout:'6'})),eight:await encode(await buildPhotoAlbumXlsx({...settings,layout:'8'})),
      spread2:await encode(await buildPhotoAlbumXlsx({...settings,layout:'2',spread:true})),spread3:await encode(await buildPhotoAlbumXlsx({...settings,layout:'3',spread:true})),spread4:await encode(await buildPhotoAlbumXlsx({...settings,layout:'4',spread:true})),spread6:await encode(await buildPhotoAlbumXlsx({...settings,layout:'6',spread:true})),spread8:await encode(await buildPhotoAlbumXlsx({...settings,layout:'8',spread:true})),
      qrOnly2:await encode(await buildPhotoAlbumXlsx({...settings,layout:'2',miniMap:false})),qrOnly3:await encode(await buildPhotoAlbumXlsx({...settings,layout:'3',miniMap:false})),qrOnly4:await encode(await buildPhotoAlbumXlsx({...settings,layout:'4',miniMap:false})),qrOnly6:await encode(await buildPhotoAlbumXlsx({...settings,layout:'6',miniMap:false})),qrOnly8:await encode(await buildPhotoAlbumXlsx({...settings,layout:'8',miniMap:false})),
      progress,stages
    };
  })()`));
  const two=await inspectWorkbook(decodeBase64(output.two),"M",8);
  const three=await inspectWorkbook(decodeBase64(output.three),"M",8);
  const four=await inspectWorkbook(decodeBase64(output.four),"M",8);
  const six=await inspectWorkbook(decodeBase64(output.six),"M",8);
  const eight=await inspectWorkbook(decodeBase64(output.eight),"M",6);
  const spread2=await inspectWorkbook(decodeBase64(output.spread2),"M",8);
  const spread3=await inspectWorkbook(decodeBase64(output.spread3),"Y",8);
  const spread4=await inspectWorkbook(decodeBase64(output.spread4),"Y",8);
  const spread6=await inspectWorkbook(decodeBase64(output.spread6),"M",8);
  const spread8=await inspectWorkbook(decodeBase64(output.spread8),"M",6);
  const qrOnly=[
    ["2枚",await inspectWorkbook(decodeBase64(output.qrOnly2),"M",12)],
    ["3枚",await inspectWorkbook(decodeBase64(output.qrOnly3),"M",12)],
    ["4枚",await inspectWorkbook(decodeBase64(output.qrOnly4),"M",12)],
    ["6枚",await inspectWorkbook(decodeBase64(output.qrOnly6),"M",12)],
    ["8枚",await inspectWorkbook(decodeBase64(output.qrOnly8),"M",12)]
  ];
  for(const [label,book] of qrOnly){
    if(book.drawing.includes('name="豆図 1"'))throw new Error(`${label}の豆図OFFで豆図が残っています`);
    assertQrInsidePhoto(book.drawing,1,label);
  }
  if(process.env.PHOTO_ALBUM_TEST_OUTPUT){
    fs.mkdirSync(process.env.PHOTO_ALBUM_TEST_OUTPUT,{recursive:true});
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-2.xlsx"),decodeBase64(output.two));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-3.xlsx"),decodeBase64(output.three));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-4.xlsx"),decodeBase64(output.four));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-6.xlsx"),decodeBase64(output.six));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-8.xlsx"),decodeBase64(output.eight));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-spread-2.xlsx"),decodeBase64(output.spread2));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-spread-3.xlsx"),decodeBase64(output.spread3));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-spread-4.xlsx"),decodeBase64(output.spread4));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-spread-6.xlsx"),decodeBase64(output.spread6));
    fs.writeFileSync(path.join(process.env.PHOTO_ALBUM_TEST_OUTPUT,"photo-album-spread-8.xlsx"),decodeBase64(output.spread8));
  }
  for(const row of [26,27,28,29,30])if(!two.sheet.includes(`<mergeCell ref="B${row}:L${row}"/>`))throw new Error(`2枚形式のコメント${row}行が正しく配置されていません`);
  const twoPhotoAnchor=drawingAnchorForName(two.drawing,"写真 1");
  if(!twoPhotoAnchor.includes("<xdr:col>1</xdr:col>")||!/<xdr:to>[\s\S]*?<xdr:col>11<\/xdr:col>/.test(twoPhotoAnchor))throw new Error("2枚形式の写真とコメントの左右幅がそろっていません");
  if(!two.drawing.includes('name="豆図 1"'))throw new Error("2枚形式のコメント欄に豆図がありません");
  for(const [count,spread] of [[3,spread3],[4,spread4]]){
    if(!spread.sheet.includes('<col min="1" max="9" width="4.27"')||!spread.sheet.includes('<col min="17" max="25" width="4.27"'))throw new Error(`見開き${count}枚の左右幅が正しくありません`);
  }
  for(const [count,forced,normal] of [[2,spread2,two],[6,spread6,six],[8,spread8,eight]]){
    if(forced.sheet!==normal.sheet||forced.drawing!==normal.drawing)throw new Error(`${count}枚で見開き指定が生成処理へ混入しています`);
  }
  const spread3Front=drawingAnchorForName(spread3.drawing,"写真 1"),spread3Back=drawingAnchorForName(spread3.drawing,"写真 4");
  if(!spread3Front.includes("<xdr:col>0</xdr:col>")||!spread3Back.includes("<xdr:col>10</xdr:col>"))throw new Error("3枚見開きの表裏で写真・コメント位置が反転していません");
  if(!three.sheet.includes('<col min="1" max="6" width="9.6"')||!three.sheet.includes('<col min="8" max="13" width="6.4"'))throw new Error("3枚形式が以前の写真・コメント幅ではありません");
  if(!four.sheet.includes('<col min="1" max="6" width="8"')||!four.sheet.includes('<col min="8" max="13" width="6.4"'))throw new Error("4枚形式の写真幅またはコメント幅が正しくありません");
  if(three.sheet.includes('<c r="H20"')||three.sheet.includes('<c r="H40"')||three.sheet.includes('<c r="H60"'))throw new Error("3枚形式の最下部に余分な罫線が残っています");
  if(four.sheet.includes('<c r="H15"')||four.sheet.includes('<c r="H30"')||four.sheet.includes('<c r="H45"')||four.sheet.includes('<c r="H60"'))throw new Error("4枚形式の最下部に余分な罫線が残っています");
  if(!six.sheet.includes('<col min="1" max="6" width="8"')||!six.sheet.includes('<col min="8" max="13" width="8"'))throw new Error("6枚形式が以前の写真幅とコメント3行を維持していません");
  if(!six.drawing.includes('name="豆図 1"'))throw new Error("6枚形式のコメント点線上に豆図がありません");
  const sixMiniAnchor=drawingAnchorForName(six.drawing,"豆図 1");
  if(!sixMiniAnchor.includes("<xdr:row>16</xdr:row>")||!sixMiniAnchor.includes("<xdr:row>20</xdr:row>"))throw new Error("6枚豆図が上下へ拡張されていません");
  if(!/<xdr:to>[\s\S]*?<xdr:row>20<\/xdr:row><xdr:rowOff>0<\/xdr:rowOff>/.test(sixMiniAnchor))throw new Error("6枚豆図の下端が次の写真との境界線に揃っていません");
  if(!eight.sheet.includes('<mergeCell ref="B13:E13"/>')||!eight.sheet.includes('<mergeCell ref="I13:L13"/>'))throw new Error("8枚形式のコメント線が写真幅内に収まっていません");
  if(output.progress.join(",")!=="1/6,2/6,3/6,4/6,5/6,6/6")throw new Error(`写真枚数の進捗が正しくありません: ${output.progress.join(",")}`);
  if(output.stages.join(",")!=="excel")throw new Error(`Excel作成段階へ切り替わりません: ${output.stages.join(",")}`);
  const spreadUi=await page.evaluate(()=>{
    const states={};
    for(const layout of ["2","3","4","6","8"]){
      const radio=document.querySelector(`input[name="photoAlbumLayout"][value="${layout}"]`),spread=document.getElementById("photoAlbumSpread"),label=document.getElementById("photoAlbumSpreadLabel");
      radio.checked=true;spread.checked=true;updatePhotoAlbumMiniMapAvailability();
      states[layout]={disabled:spread.disabled,checked:spread.checked,labelDisabled:label.classList.contains("disabled")};
    }
    return states;
  });
  for(const layout of ["2","6","8"]){const state=spreadUi[layout];if(!state.disabled||state.checked||!state.labelDisabled)throw new Error(`${layout}枚で見開きチェックを選択できます: ${JSON.stringify(state)}`);}
  for(const layout of ["3","4"]){const state=spreadUi[layout];if(state.disabled||!state.checked||state.labelDisabled)throw new Error(`${layout}枚で見開きチェックを選択できません: ${JSON.stringify(state)}`);}
  const progressUi=await page.evaluate(()=>{
    showBusy("写真帳を作成中…");updateBusyPhotoCount(7,17);
    const result={hidden:busyProgress.hidden,count:busyProgressCount.textContent,percent:busyProgressPercent.textContent,width:busyProgressFill.style.width};
    hideBusy();return result;
  });
  if(progressUi.hidden||progressUi.count!=="7／17枚"||progressUi.percent!=="41％"||progressUi.width!=="41%")throw new Error(`進捗バー表示が正しくありません: ${JSON.stringify(progressUi)}`);
  const reconnectAndDelete=await page.evaluate(()=>{
    photoAnnotations=[
      {number:1,fileName:"A.jpg",lat:35,lon:134,xNorth:1,yEast:2,worldX:1,worldY:2,markerX:1,markerY:2},
      {number:2,fileName:"B.jpg",lat:35,lon:134,xNorth:3,yEast:4,worldX:3,worldY:4,markerX:3,markerY:4}
    ];
    photoSourceFiles.clear();
    const missingBefore=getMissingPhotoSourceItems().length;
    reconnectPhotoSourceFiles([new File(["a"],"A.jpg",{type:"image/jpeg"})]);
    const missingAfterOne=getMissingPhotoSourceItems().length;
    reconnectPhotoSourceFiles([new File(["b"],"B.jpg",{type:"image/jpeg"})]);
    const missingAfterAll=getMissingPhotoSourceItems().length;
    const fileNameComment=photoAlbumCommentText(photoAnnotations[0],"fileName");
    photoSourceFiles.clear();
    const missingAfterDirectFallback=getMissingPhotoSourceItems().length;
    const sourcesAfterDirectFallback=photoSourceFiles.size;

    data={lines:[[0,0,10,10,1]],polys:[],splines:[],texts:[],circles:[],arcs:[],ellipses:[],ellipseArcs:[],markers:[],layerNames:{1:PHOTO_POSITION_LAYER_NAME},source_name:"photo.sfc"};
    deletedLayerNames=new Set();removedSourceLayerNames=new Set();editUndoActions=[];
    deleteLayerByName(PHOTO_POSITION_LAYER_NAME);
    const afterDelete={photos:photoAnnotations.length,sources:photoSourceFiles.size,lines:data.lines.length,removed:[...removedSourceLayerNames]};
    undoLastEdit();
    const afterUndo={photos:photoAnnotations.length,sources:photoSourceFiles.size,lines:data.lines.length};
    redoLastEdit();
    data.lines.push([0,0,20,20,1]);
    removeStalePhotoSourceGeometry();
    const afterReimportCleanup={lines:data.lines.length,removed:[...removedSourceLayerNames]};
    return {missingBefore,missingAfterOne,missingAfterAll,fileNameComment,missingAfterDirectFallback,sourcesAfterDirectFallback,afterDelete,afterUndo,afterReimportCleanup};
  });
  if(reconnectAndDelete.missingBefore!==2||reconnectAndDelete.missingAfterOne!==1||reconnectAndDelete.missingAfterAll!==0)throw new Error(`元写真の再接続が正しくありません: ${JSON.stringify(reconnectAndDelete)}`);
  if(reconnectAndDelete.fileNameComment!=="A")throw new Error(`写真帳のファイル名表示が正しくありません: ${JSON.stringify(reconnectAndDelete.fileNameComment)}`);
  if(reconnectAndDelete.missingAfterDirectFallback!==0||reconnectAndDelete.sourcesAfterDirectFallback!==2)throw new Error(`写真情報の直接参照から元写真を復元できません: ${JSON.stringify(reconnectAndDelete)}`);
  if(reconnectAndDelete.afterDelete.photos!==0||reconnectAndDelete.afterDelete.sources!==0||reconnectAndDelete.afterDelete.lines!==0||reconnectAndDelete.afterDelete.removed.length!==2)throw new Error(`写真レイヤー削除が関連データを消去していません: ${JSON.stringify(reconnectAndDelete.afterDelete)}`);
  if(reconnectAndDelete.afterUndo.photos!==2||reconnectAndDelete.afterUndo.sources!==2||reconnectAndDelete.afterUndo.lines!==1)throw new Error(`写真レイヤー削除のUndoが正しくありません: ${JSON.stringify(reconnectAndDelete.afterUndo)}`);
  if(reconnectAndDelete.afterReimportCleanup.lines!==0||reconnectAndDelete.afterReimportCleanup.removed.length!==2)throw new Error(`新規写真読込み前に旧矢印を除去できません: ${JSON.stringify(reconnectAndDelete.afterReimportCleanup)}`);
  console.log(`photo album runtime checks passed (2-photo media=${two.media}, 3-photo media=${three.media}, 4-photo media=${four.media}, 6-photo media=${six.media}, 8-photo media=${eight.media}, spread=3/4 only)`);
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
