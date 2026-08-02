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
  ["CAD選択時は左端へ戻して対象行を縦中央表示",'scrollPhotoListItemToCenter(hit.item,"smooth","start","center")'],
  ["写真一覧ヘッダー固定",'#photoListTable thead th{position:sticky;top:0;'],
  ["背面マスク設定",'id="photoBackMask" class="active" type="button" aria-pressed="true"'],
  ["背面マスクボタンを小型化",'#photoBackMask{width:112px;min-height:32px'],
  ["背面マスク初期ON","backMaskEnabled:true"],
  ["丸内だけを背景色でマスク","ctx.fillStyle=bgColor()"],
  ["背面マスクのSFCレイヤー","name:PHOTO_BACK_MASK_LAYER_NAME"],
  ["背面マスクのSFC標準単色塗り","fill_area_style_colour_feature"],
  ["Ez Viewerのリンク下線","text-decoration:underline"],
  ["位置移動後にX座標を表示",'drag.kind==="rotate"?"end":"x"'],
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
  const backMaskInitial=await page.evaluate(()=>window.eval(`(()=>{ensureLayerVisibility();syncPhotoSettingsUi();const button=document.getElementById('photoBackMask');return {active:button.classList.contains('active'),pressed:button.getAttribute('aria-pressed'),enabled:photoSettings.backMaskEnabled,visible:isLayerVisible(PHOTO_BACK_MASK_LAYER_ID)};})()`));
  if(!backMaskInitial.active||backMaskInitial.pressed!=="true"||!backMaskInitial.enabled||!backMaskInitial.visible)throw new Error(`背面マスクが初期ONではありません: ${JSON.stringify(backMaskInitial)}`);
  await page.locator("#photoBackMask").click();
  const backMaskOff=await page.evaluate(()=>window.eval(`(()=>{const button=document.getElementById('photoBackMask');return {active:button.classList.contains('active'),pressed:button.getAttribute('aria-pressed'),enabled:photoSettings.backMaskEnabled,visible:isLayerVisible(PHOTO_BACK_MASK_LAYER_ID)};})()`));
  if(backMaskOff.active||backMaskOff.pressed!=="false"||backMaskOff.enabled||backMaskOff.visible)throw new Error(`背面マスクをOFFにできません: ${JSON.stringify(backMaskOff)}`);
  await page.locator("#photoBackMask").click();
  const backMaskOn=await page.evaluate(()=>window.eval(`(()=>{const button=document.getElementById('photoBackMask');return {active:button.classList.contains('active'),pressed:button.getAttribute('aria-pressed'),enabled:photoSettings.backMaskEnabled,visible:isLayerVisible(PHOTO_BACK_MASK_LAYER_ID)};})()`));
  if(!backMaskOn.active||backMaskOn.pressed!=="true"||!backMaskOn.enabled||!backMaskOn.visible)throw new Error(`背面マスクを再びONにできません: ${JSON.stringify(backMaskOn)}`);
  const maskExport=await page.evaluate(()=>window.eval(`(()=>{
    const strokes=buildPhotoAnnotationExportStrokes();
    const maskIndex=strokes.findIndex(stroke=>stroke.isPhotoBackMask);
    const circleIndex=strokes.findIndex(stroke=>stroke.isCircleMemo&&stroke.photoLayerId===PHOTO_POSITION_LAYER_ID);
    const ann=buildInkPolylineFeatureText('test');
    const records=parseSxfFeatureRecords(getFlatSxfText(ann.preludeText+'\\n'+ann.lineText));
    const fill=records.find(record=>record.name==='fill_area_style_colour_feature');
    const composite=records.find(record=>record.name==='composite_curve_org_feature');
    const boundary=records.find(record=>record.name==='polyline_feature');
    const areaControl=records.find(record=>record.name==='externally_defined_hatch_feature'&&unquoteSxfValue(record.args[1])==='Area_control');
    const backgroundFigure=records.find(record=>record.name==='sfig_org_feature');
    const originalTheme=darkTheme;
    darkTheme=false;
    const lightBg=bgColor();
    const lightStrokeColor=buildPhotoAnnotationExportStrokes().find(stroke=>stroke.isPhotoBackMask)?.color||'';
    const lightAnn=buildInkPolylineFeatureText('test');
    const lightRecords=parseSxfFeatureRecords(getFlatSxfText(lightAnn.colorText+'\\n'+lightAnn.preludeText+'\\n'+lightAnn.lineText));
    const lightRgb=lightRecords.find(record=>record.name==='user_defined_colour_feature');
    const lightFill=lightRecords.find(record=>record.name==='fill_area_style_colour_feature');
    darkTheme=originalTheme;
    const savedPlacement=data._mainDrawingPlacement;
    data._mainDrawingPlacement={name:'MAIN',angle:0,sx:1,sy:1};
    const synthetic=[
      'ISO-10303-21;','DATA;',
      '/*SXF\\n#10 = line_feature(\\'1\\',\\'1\\',\\'1\\',\\'1\\',\\'0\\',\\'0\\',\\'1\\',\\'0\\')\\nSXF*/',
      '/*SXF\\n#20 = composite_curve_org_feature(\\'1\\',\\'1\\',\\'1\\',\\'0\\')\\nSXF*/',
      '/*SXF\\n#30 = line_feature(\\'1\\',\\'1\\',\\'1\\',\\'1\\',\\'0\\',\\'0\\',\\'1\\',\\'0\\')\\nSXF*/',
      '/*SXF\\n#40 = sfig_org_feature(\\'PREV\\',\\'3\\')\\nSXF*/',
      '/*SXF\\n#50 = line_feature(\\'0\\',\\'0\\',\\'0\\',\\'0\\',\\'0\\',\\'0\\',\\'1\\',\\'0\\')\\nSXF*/',
      '/*SXF\\n#55 = composite_curve_org_feature(\\'1\\',\\'1\\',\\'1\\',\\'0\\')\\nSXF*/',
      '/*SXF\\n#57 = fill_area_style_colour_feature(\\'1\\',\\'1\\',\\'3\\',\\'0\\',\\'()\\')\\nSXF*/',
      '/*SXF\\n#60 = sfig_org_feature(\\'MAIN\\',\\'3\\')\\nSXF*/',
      '/*SXF\\n#70 = line_feature(\\'0\\',\\'0\\',\\'0\\',\\'0\\',\\'0\\',\\'0\\',\\'1\\',\\'0\\')\\nSXF*/',
      '/*SXF\\n#75 = composite_curve_org_feature(\\'1\\',\\'1\\',\\'1\\',\\'0\\')\\nSXF*/',
      '/*SXF\\n#77 = fill_area_style_colour_feature(\\'1\\',\\'1\\',\\'5\\',\\'0\\',\\'()\\')\\nSXF*/',
      '/*SXF\\n#80 = sfig_org_feature(\\'LATER\\',\\'3\\')\\nSXF*/','ENDSEC;'
    ].join('\\n');
    const assemblyAnn=buildInkPolylineFeatureText(synthetic);
    const assembled=insertMemoGeneralFeatures(synthetic,assemblyAnn.lineText,assemblyAnn.exportPoints,assemblyAnn.preludeText);
    const assemblyFill=parseSxfFeatureRecords(getFlatSxfText(assemblyAnn.preludeText+'\\n'+assemblyAnn.lineText)).find(record=>record.name==='fill_area_style_colour_feature');
    const assembledRecords=parseSxfFeatureRecords(getFlatSxfTextIncludingGenerated(assembled));
    const retainedSourceFill=assembledRecords.find(record=>record.id===57&&record.name==='fill_area_style_colour_feature');
    const shiftedSourceFill=assembledRecords.find(record=>record.id===77&&record.name==='fill_area_style_colour_feature');
    const assemblyOrder={
      outId:Number(unquoteSxfValue(assemblyFill?.args[2])),
      previous:assembled.indexOf("sfig_org_feature('PREV'"),
      boundary:assembled.indexOf('sfcviewer_generated_begin'),
      existing:assembled.indexOf('#50 = line_feature'),
      fill:assembled.indexOf('#'+assemblyFill?.id+' = fill_area_style_colour_feature'),
      main:assembled.indexOf("sfig_org_feature('MAIN'"),
      retainedSourceOuter:Number(unquoteSxfValue(retainedSourceFill?.args[2])),
      shiftedSourceOuter:Number(unquoteSxfValue(shiftedSourceFill?.args[2]))
    };
    data._mainDrawingPlacement=savedPlacement;
    return {
      maskIndex,circleIndex,
      decodedLayerText:decodeShiftJisFromLatin1(ann.layerText),
      fillArgs:fill?.args.map(unquoteSxfValue)||[],
      compositeCount:records.filter(record=>record.name==='composite_curve_org_feature').length,
      hasAreaControl:!!areaControl,
      hasBackgroundFigure:!!backgroundFigure,
      hasRootPlacement:ann.rootPlacementText.includes('sfig_locate_feature')&&ann.rootPlacementText.includes('$$ATRU$$'),
      lightMask:{bg:lightBg,stroke:lightStrokeColor,rgb:lightRgb?.args.map(unquoteSxfValue)||[],fillColor:unquoteSxfValue(lightFill?.args[1]||''),name:lightAnn.backgroundMaskName},
      boundaryHasCompositeStyle:boundary?boundary.args.slice(0,4).every(value=>Number(unquoteSxfValue(value))===0):false,
      closedBoundary:boundary?unquoteSxfValue(boundary.args[4])===String(String(unquoteSxfValue(boundary.args[5])).split(',').filter(Boolean).length):false,
      order:ann.preludeText.indexOf('composite_curve_org_feature')>=0&&ann.lineText.indexOf('fill_area_style_colour_feature')>=0&&ann.lineText.indexOf('fill_area_style_colour_feature')<ann.lineText.indexOf('circle_feature'),
      splitPrelude:ann.preludeText.includes('composite_curve_org_feature')&&!ann.lineText.includes('composite_curve_org_feature'),
      assemblyOrder,
      meta:parseMemoMetaPayload(buildMemoMetaComment())
    };
  })()`));
  if(maskExport.maskIndex<0||maskExport.circleIndex<0||maskExport.maskIndex>=maskExport.circleIndex)throw new Error(`背面マスクが写真番号より先に作成されません: ${JSON.stringify(maskExport)}`);
  if(!maskExport.decodedLayerText.includes("写真方向番号背面マスク")||maskExport.fillArgs.length!==5||maskExport.fillArgs[1]!=="17"||maskExport.compositeCount!==1||maskExport.hasAreaControl||maskExport.hasBackgroundFigure||maskExport.hasRootPlacement||!maskExport.boundaryHasCompositeStyle||!maskExport.closedBoundary||!maskExport.order||!maskExport.splitPrelude)throw new Error(`SFC背面マスクの書出しが不正です: ${JSON.stringify(maskExport)}`);
  if(maskExport.lightMask.rgb.join(',')!=="255,255,255"||maskExport.lightMask.fillColor!=="17"||maskExport.lightMask.name!=="")throw new Error(`白背景の背面マスク色が不正です: ${JSON.stringify(maskExport.lightMask)}`);
  const assemblyOrder=maskExport.assemblyOrder;
  if(assemblyOrder.outId!==4||assemblyOrder.retainedSourceOuter!==3||assemblyOrder.shiftedSourceOuter!==6||!(assemblyOrder.previous<assemblyOrder.existing&&assemblyOrder.existing<assemblyOrder.boundary&&assemblyOrder.boundary<assemblyOrder.fill&&assemblyOrder.fill<assemblyOrder.main))throw new Error(`SXFアセンブリ順と背面マスクの挿入位置が不正です: ${JSON.stringify(assemblyOrder)}`);
  if(maskExport.meta?.photoBackMaskEnabled!==true)throw new Error("背面マスク設定がSFCに保存されません");
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
  const scrollCheck=await page.evaluate(()=>window.eval(`(()=>{
    const source=photoAnnotations[0];
    photoAnnotations=Array.from({length:24},(_,index)=>({...source,number:index+1,fileName:'P'+String(index+1).padStart(2,'0')+'.jpg',markerX:index*80,worldX:index*80}));
    selectedPhotoPositionItem=photoAnnotations[11];renderPhotoListPanel();
    const scroll=document.getElementById('photoListTableScroll');scroll.scrollTop=0;
    const ok=scrollPhotoListItemToCenter(selectedPhotoPositionItem,'auto','start');
    const row=[...document.getElementById('photoListRows').children].find(candidate=>candidate._photoAnnotation===selectedPhotoPositionItem);
    const scrollRect=scroll.getBoundingClientRect(),rowRect=row.getBoundingClientRect();
    return {ok,scrollTop:scroll.scrollTop,centerDifference:Math.abs((rowRect.top+rowRect.bottom)/2-(scrollRect.top+scrollRect.bottom)/2),outlined:row.classList.contains('photoPositionSelectedRow')};
  })()`));
  if(!scrollCheck.ok||scrollCheck.scrollTop<=0||scrollCheck.centerDifference>25||!scrollCheck.outlined)throw new Error(`選択した写真行が一覧中央へ移動しません: ${JSON.stringify(scrollCheck)}`);
  const stickyHeaderCheck=await page.evaluate(()=>window.eval(`(()=>{
    const scroll=document.getElementById('photoListTableScroll'),header=document.querySelector('#photoListTable thead th');
    scroll.scrollTop=180;
    const scrollRect=scroll.getBoundingClientRect(),headerRect=header.getBoundingClientRect(),style=getComputedStyle(header);
    return {position:style.position,scrollTop:scroll.scrollTop,topDifference:Math.abs(headerRect.top-scrollRect.top)};
  })()`));
  if(stickyHeaderCheck.position!=="sticky"||stickyHeaderCheck.scrollTop<=0||stickyHeaderCheck.topDifference>2)throw new Error(`写真一覧ヘッダーが固定されません: ${JSON.stringify(stickyHeaderCheck)}`);
  const selectionScroll=await page.evaluate(()=>window.eval(`(()=>{
    const item=selectedPhotoPositionItem,scroll=document.getElementById('photoListTableScroll');
    scroll.scrollTop=80;scroll.scrollLeft=Math.max(0,scroll.scrollWidth-scroll.clientWidth);
    scrollPhotoListItemToCenter(item,'auto','start','keep');
    return {top:scroll.scrollTop,left:scroll.scrollLeft};
  })()`));
  if(selectionScroll.top!==80||selectionScroll.left!==0)throw new Error(`選択だけで一覧の縦位置が変わりました: ${JSON.stringify(selectionScroll)}`);
  const horizontalScroll=await page.evaluate(()=>window.eval(`(()=>{
    const item=selectedPhotoPositionItem,scroll=document.getElementById('photoListTableScroll');
    scrollPhotoListItemToCenter(item,'auto','x');const xLeft=scroll.scrollLeft;
    scrollPhotoListItemToCenter(item,'auto','end');const end=scroll.scrollLeft,max=Math.max(0,scroll.scrollWidth-scroll.clientWidth);
    scrollPhotoListItemToCenter(item,'auto','start');const start=scroll.scrollLeft;
    return {xLeft,end,max,start};
  })()`));
  if(horizontalScroll.xLeft<=0||Math.abs(horizontalScroll.end-horizontalScroll.max)>1||horizontalScroll.start!==0)throw new Error(`写真位置一覧の横スクロールが正しくありません: ${JSON.stringify(horizontalScroll)}`);
  const popupExclusive=await page.evaluate(()=>window.eval(`(()=>{
    data.texts=[{x:0,y:0,w:10,h:4,sp:0,angle:0,align1:1,text:'測点',layer:'1',_sxfFeatureId:1001}];
    data.layerNames={'1':'文字'};document.getElementById('photoListPanel').style.display='flex';setPhotoPositionAdjustMode(true);
    openTextLayerModal(data.texts[0]);
    return {photo:getComputedStyle(document.getElementById('photoListPanel')).display,text:getComputedStyle(document.getElementById('textLayerModal')).display};
  })()`));
  if(popupExclusive.photo!=="none"||popupExclusive.text!=="flex")throw new Error(`文字変更時に写真位置を閉じません: ${JSON.stringify(popupExclusive)}`);
  await page.evaluate(()=>window.eval(`(()=>{closeTextLayerModal();setPhotoListPanelOpen(true);})()`));
  await page.locator("#photoExcelBtn").click();
  const excelChoice=await page.evaluate(()=>{
    const list=document.getElementById("photoExcelListChoiceBtn"),album=document.getElementById("photoExcelAlbumChoiceBtn");
    const listStyle=getComputedStyle(list),albumStyle=getComputedStyle(album);
    return {display:getComputedStyle(document.getElementById("photoExcelChoiceModal")).display,list:list.textContent,album:album.textContent,listBackground:listStyle.backgroundColor,albumBackground:albumStyle.backgroundColor,listColor:listStyle.color,albumColor:albumStyle.color};
  });
  if(excelChoice.display!=="flex"||excelChoice.list!=="一覧表を出力"||excelChoice.album!=="写真帳を出力")throw new Error("Excel出力の選択画面が正しく開きません");
  if(excelChoice.listBackground!==excelChoice.albumBackground||excelChoice.listColor!==excelChoice.albumColor)throw new Error(`写真帳出力だけ青色です: ${JSON.stringify(excelChoice)}`);
  if(pageErrors.length)throw new Error(`ページエラー: ${pageErrors.join(" | ")}`);
  console.log("photo position adjustment checks passed");
  await browser.close();server.close();
})().catch(async error=>{console.error(error);try{await browser?.close();}catch(_error){}server.close();process.exitCode=1;});
