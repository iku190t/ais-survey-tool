(()=>{
  "use strict";

  const GOOGLE_MAP_TARGET="ezviewer-google-map";
  const GOOGLE_STREET_TARGET="ezviewer-google-streetview";
  const QR_SCRIPT_URL="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
  const QR_SCRIPT_INTEGRITY="sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==";
  let active=false,selectionMode="position",positionWorld=null,directionWorld=null;
  let coordinateZone=null,positionLatLon=null,directionLatLon=null;
  let mapWindow=null,streetWindow=null,qrScriptPromise=null,touchCandidate=null,suppressClickUntil=0;
  let mouseDrag=null,liveSyncTimer=null,liveSyncRevision=0,lastLiveSyncAt=0;
  const LIVE_SYNC_DELAY=280;

  const byId=id=>document.getElementById(id);
  const isDesktop=()=>typeof isDesktopPhotoTool==="function"?isDesktopPhotoTool():matchMedia("(pointer:fine)").matches;
  const drawingAvailable=()=>typeof hasLoadedDrawing==="function"&&hasLoadedDrawing();
  const normalizeLatLon=value=>{
    const lat=Number(value&&value.lat),lon=Number(value&&value.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null;
  };
  const coord=value=>Number(value).toFixed(8).replace(/0+$/,"").replace(/\.$/,"");
  const googleMapsUrl=point=>{
    const ll=normalizeLatLon(point);if(!ll)return "";
    return `https://www.google.com/maps/@${coord(ll.lat)},${coord(ll.lon)},20z/data=!3m1!1e3`;
  };
  const googleMapsSearchUrl=point=>{
    const ll=normalizeLatLon(point);if(!ll)return "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coord(ll.lat)},${coord(ll.lon)}`)}`;
  };
  const bearing=(from,to)=>{
    const a=normalizeLatLon(from),b=normalizeLatLon(to);if(!a||!b)return null;
    const rad=Math.PI/180,lat1=a.lat*rad,lat2=b.lat*rad,dLon=(b.lon-a.lon)*rad;
    const y=Math.sin(dLon)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    return (Math.atan2(y,x)/rad+360)%360;
  };
  const googleStreetViewUrl=(point,heading=null)=>{
    const ll=normalizeLatLon(point);if(!ll)return "";
    const query=new URLSearchParams({api:"1",map_action:"pano",viewpoint:`${coord(ll.lat)},${coord(ll.lon)}`,pitch:"0",fov:"80"});
    if(Number.isFinite(Number(heading)))query.set("heading",Number(heading).toFixed(2));
    return `https://www.google.com/maps/@?${query}`;
  };

  function setStatus(message){const element=byId("googleMapsLinkStatus");if(element)element.textContent=message||"";}
  function setButtonState(){byId("googleMapsLinkBtn")?.classList.toggle("modeActive",active);}
  function updateStatus(){
    if(positionWorld&&directionWorld&&selectionMode==="position"){
      setStatus("1点目・2点目・中央をドラッグして位置を調整できます。");return;
    }
    if(selectionMode==="position"){setStatus("CAD上で1点目（見る位置）を選択してください。");return;}
    setStatus("CAD上で2点目（見る方向）を選択してください。");
  }
  async function resolveZone(){
    const manual=typeof getManualCoordinateZone==="function"?getManualCoordinateZone():null;
    if(manual)return manual;if(coordinateZone)return coordinateZone;
    if(typeof resolveProfileZone==="function")coordinateZone=await resolveProfileZone();
    return coordinateZone;
  }
  async function worldToLatLon(point){
    if(!point||typeof sfcWorldToPlane!=="function"||typeof jgd2024XYToLatLon!=="function")return null;
    const zone=await resolveZone();if(!zone)throw new Error("座標系を判定できません。設定から座標系を選択してください。");
    const plane=sfcWorldToPlane(point.x,point.y),ll=jgd2024XYToLatLon(plane.xNorth,plane.yEast,zone);
    return normalizeLatLon(ll);
  }
  function externalWindowRect(side){
    const leftBase=Number.isFinite(screen.availLeft)?screen.availLeft:0,topBase=Number.isFinite(screen.availTop)?screen.availTop:0;
    const availableWidth=Math.max(1,screen.availWidth||window.innerWidth||1200),availableHeight=Math.max(1,screen.availHeight||window.innerHeight||800);
    const width=Math.max(300,Math.floor(availableWidth/4)),height=Math.max(320,Math.floor(availableHeight/2));
    const top=topBase+availableHeight-height,left=leftBase+(side==="right"?width:0);
    return {left,top,width,height};
  }
  function popupFeatures(side){
    if(!isDesktop())return "popup=yes";
    const {left,top,width,height}=externalWindowRect(side);
    return `popup=yes,left=${left},top=${top},width=${width},height=${height},resizable=yes,scrollbars=yes`;
  }
  function prepareExternalWindows(){
    try{if(!streetWindow||streetWindow.closed)streetWindow=window.open("about:blank",GOOGLE_STREET_TARGET,popupFeatures("left"));}catch(_error){streetWindow=null;}
    try{if(!mapWindow||mapWindow.closed)mapWindow=window.open("about:blank",GOOGLE_MAP_TARGET,popupFeatures("right"));}catch(_error){mapWindow=null;}
  }
  function placeExternalWindows(){
    if(!isDesktop())return;
    const streetRect=externalWindowRect("left"),mapRect=externalWindowRect("right");
    try{streetWindow?.moveTo(streetRect.left,streetRect.top);streetWindow?.resizeTo(streetRect.width,streetRect.height);}catch(_error){}
    try{mapWindow?.moveTo(mapRect.left,mapRect.top);mapWindow?.resizeTo(mapRect.width,mapRect.height);}catch(_error){}
  }
  function openExternalPair(reposition=true){
    if(!positionLatLon||!directionLatLon)return;
    const heading=bearing(positionLatLon,directionLatLon),streetUrl=googleStreetViewUrl(positionLatLon,heading),mapUrl=googleMapsUrl(positionLatLon);
    try{if(streetWindow&&!streetWindow.closed)streetWindow.location.href=streetUrl;else streetWindow=window.open(streetUrl,GOOGLE_STREET_TARGET,popupFeatures("left"));}catch(_error){streetWindow=null;}
    try{if(mapWindow&&!mapWindow.closed)mapWindow.location.href=mapUrl;else mapWindow=window.open(mapUrl,GOOGLE_MAP_TARGET,popupFeatures("right"));}catch(_error){mapWindow=null;}
    if(reposition)placeExternalWindows();
    if(!streetWindow||!mapWindow){
      if(typeof showToast==="function")showToast("ブラウザーのポップアップを許可してください",3000);
    }
  }
  async function syncExternalPairFromWorld(revision){
    try{
      const position=positionWorld?{...positionWorld}:null,direction=directionWorld?{...directionWorld}:null;
      const [nextPosition,nextDirection]=await Promise.all([
        position?worldToLatLon(position):Promise.resolve(null),
        direction?worldToLatLon(direction):Promise.resolve(null)
      ]);
      if(revision!==liveSyncRevision)return;
      if(nextPosition)positionLatLon=nextPosition;
      if(nextDirection)directionLatLon=nextDirection;
      if(positionLatLon&&directionLatLon)openExternalPair(false);
    }catch(error){
      console.error("Google link drag synchronization failed",error);
    }
  }
  function scheduleExternalPairSync(immediate=false){
    if(immediate){
      if(liveSyncTimer){clearTimeout(liveSyncTimer);liveSyncTimer=null;}
      lastLiveSyncAt=Date.now();void syncExternalPairFromWorld(++liveSyncRevision);return;
    }
    if(liveSyncTimer)return;
    const delay=Math.max(0,LIVE_SYNC_DELAY-(Date.now()-lastLiveSyncAt));
    liveSyncTimer=setTimeout(()=>{liveSyncTimer=null;lastLiveSyncAt=Date.now();void syncExternalPairFromWorld(++liveSyncRevision);},delay);
  }
  async function selectWorldPoint(world){
    try{
      const ll=await worldToLatLon(world);if(!ll)return;
      if(selectionMode==="position"){
        positionWorld={x:world.x,y:world.y};positionLatLon=ll;directionWorld=null;directionLatLon=null;selectionMode="direction";
      }else{
        directionWorld={x:world.x,y:world.y};directionLatLon=ll;openExternalPair();selectionMode="position";
      }
      updateStatus();setButtonState();if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
    }catch(error){
      console.error("Google link coordinate conversion failed",error);
      if(typeof showToast==="function")showToast(error?.message||"位置を変換できません",2600);setStatus(error?.message||"位置を変換できません");
    }
  }
  function canvasPoint(event){
    const canvas=byId("canvas")||byId("interactionCanvas");if(!canvas||typeof screenToWorld!=="function")return null;
    const rect=canvas.getBoundingClientRect(),screenX=event.clientX-rect.left,screenY=event.clientY-rect.top;
    if(screenX<0||screenY<0||screenX>rect.width||screenY>rect.height)return null;
    const world=screenToWorld(screenX,screenY);
    return {screenX,screenY,x:world[0],y:world[1]};
  }
  function hitTestDragHandle(screenX,screenY){
    if(typeof worldToScreen!=="function")return "";
    const hit=(point,radius=15)=>{if(!point)return false;const p=worldToScreen(point.x,point.y);return Math.hypot(screenX-p[0],screenY-p[1])<=radius;};
    if(hit(positionWorld))return "position";
    if(hit(directionWorld))return "direction";
    if(positionWorld&&directionWorld){
      const midpoint={x:(positionWorld.x+directionWorld.x)/2,y:(positionWorld.y+directionWorld.y)/2};
      if(hit(midpoint,16))return "translate";
    }
    return "";
  }
  function setCanvasCursor(value=""){
    const canvas=byId("canvas")||byId("interactionCanvas");if(canvas)canvas.style.cursor=value;
  }
  function beginMouseDrag(event,point){
    if(!isDesktop()||!point)return false;
    const kind=hitTestDragHandle(point.screenX,point.screenY);if(!kind)return false;
    mouseDrag={kind,startScreenX:point.screenX,startScreenY:point.screenY,startWorld:{x:point.x,y:point.y},position:positionWorld?{...positionWorld}:null,direction:directionWorld?{...directionWorld}:null,moved:false};
    setCanvasCursor("grabbing");return true;
  }
  function moveMouseDrag(point){
    if(!mouseDrag||!point)return;
    const dx=point.x-mouseDrag.startWorld.x,dy=point.y-mouseDrag.startWorld.y;
    if(mouseDrag.kind==="position")positionWorld={x:point.x,y:point.y};
    else if(mouseDrag.kind==="direction")directionWorld={x:point.x,y:point.y};
    else{
      if(mouseDrag.position)positionWorld={x:mouseDrag.position.x+dx,y:mouseDrag.position.y+dy};
      if(mouseDrag.direction)directionWorld={x:mouseDrag.direction.x+dx,y:mouseDrag.direction.y+dy};
    }
    if(Math.hypot(point.screenX-mouseDrag.startScreenX,point.screenY-mouseDrag.startScreenY)>2)mouseDrag.moved=true;
    scheduleExternalPairSync(false);if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
  }
  function interceptMouseDown(event){
    if(!active||event.button!==0)return;
    const point=canvasPoint(event);beginMouseDrag(event,point);event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptMouseMove(event){
    if(!active||!isDesktop())return;
    const point=canvasPoint(event);
    if(mouseDrag){
      if(point)moveMouseDrag(point);event.preventDefault();event.stopImmediatePropagation();return;
    }
    const kind=point?hitTestDragHandle(point.screenX,point.screenY):"";setCanvasCursor(kind?"grab":"crosshair");
  }
  function interceptMouseUp(event){
    if(!active||!mouseDrag)return;
    const point=canvasPoint(event);if(point)moveMouseDrag(point);
    mouseDrag=null;suppressClickUntil=Date.now()+500;scheduleExternalPairSync(true);
    const kind=point?hitTestDragHandle(point.screenX,point.screenY):"";setCanvasCursor(kind?"grab":"crosshair");
    event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptClick(event){
    if(!active)return;
    event.preventDefault();event.stopImmediatePropagation();if(Date.now()<suppressClickUntil)return;
    const point=canvasPoint(event);if(!point)return;
    if(selectionMode==="direction")prepareExternalWindows();selectWorldPoint(point);
  }
  function interceptTouchStart(event){
    if(!active||event.touches.length!==1){touchCandidate=null;return;}
    const touch=event.touches[0];touchCandidate={x:touch.clientX,y:touch.clientY,moved:false};event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptTouchMove(event){
    if(!touchCandidate||event.touches.length!==1)return;const touch=event.touches[0];
    if(Math.hypot(touch.clientX-touchCandidate.x,touch.clientY-touchCandidate.y)>12)touchCandidate.moved=true;
    event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptTouchEnd(event){
    if(!touchCandidate)return;const candidate=touchCandidate;touchCandidate=null;
    event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=Date.now()+500;if(candidate.moved)return;
    if(selectionMode==="direction")prepareExternalWindows();selectWorldPoint(canvasPoint({clientX:candidate.x,clientY:candidate.y}));
  }
  function open(){
    if(!drawingAvailable()){if(typeof showToast==="function")showToast("先にSFC図面を開いてください",1800);return;}
    if(typeof closePanelsExcept==="function")closePanelsExcept("googleMapsLink");
    active=true;selectionMode="position";positionWorld=null;directionWorld=null;positionLatLon=null;directionLatLon=null;mouseDrag=null;
    const modal=byId("googleMapsLinkModal");if(modal)modal.style.display="flex";updateStatus();setButtonState();
    if(isDesktop())setCanvasCursor("crosshair");
    if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
  }
  function close(){
    active=false;selectionMode="position";touchCandidate=null;mouseDrag=null;liveSyncRevision++;
    if(liveSyncTimer){clearTimeout(liveSyncTimer);liveSyncTimer=null;}setCanvasCursor("");
    const modal=byId("googleMapsLinkModal");if(modal)modal.style.display="none";setButtonState();
    if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
  }
  function toggle(){active?close():open();}
  function syncAvailability(){
    const button=byId("googleMapsLinkBtn"),available=drawingAvailable();
    if(button){button.classList.toggle("unavailableTool",!available);button.classList.toggle("dimmed",!available);button.setAttribute("aria-disabled",available?"false":"true");}
    if(!available)close();
  }
  function drawOverlay(context){
    if(!active||!context||typeof worldToScreen!=="function")return;
    const drawPoint=(point,color,label)=>{if(!point)return;const screenPoint=worldToScreen(point.x,point.y);context.save();context.fillStyle="rgba(255,255,255,.92)";context.strokeStyle=color;context.lineWidth=3;context.beginPath();context.arc(screenPoint[0],screenPoint[1],9,0,Math.PI*2);context.fill();context.stroke();context.fillStyle=color;context.font="800 12px sans-serif";context.textAlign="center";context.textBaseline="bottom";context.fillText(label,screenPoint[0],screenPoint[1]-12);context.restore();};
    if(positionWorld&&directionWorld){
      const a=worldToScreen(positionWorld.x,positionWorld.y),b=worldToScreen(directionWorld.x,directionWorld.y),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      context.save();context.strokeStyle="#00a8e8";context.lineWidth=2;context.setLineDash([7,5]);context.beginPath();context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.stroke();
      context.setLineDash([]);context.fillStyle="#00a8e8";context.strokeStyle="#fff";context.lineWidth=2;context.beginPath();context.arc(mid[0],mid[1],6,0,Math.PI*2);context.fill();context.stroke();context.restore();
    }
    drawPoint(positionWorld,"#1677ff","1");drawPoint(directionWorld,"#17a05e","2");
  }
  function photoLatLon(item){
    if(!item)return null;const zone=typeof getPhotoCoordinateZone==="function"?getPhotoCoordinateZone(item):null;
    if(zone&&Number.isFinite(+item.xNorth)&&Number.isFinite(+item.yEast)&&typeof jgd2024XYToLatLon==="function")try{return normalizeLatLon(jgd2024XYToLatLon(+item.xNorth,+item.yEast,zone));}catch(_error){}
    return normalizeLatLon(item);
  }
  function ensureQrScript(){
    if(window.QRCode)return Promise.resolve();if(qrScriptPromise)return qrScriptPromise;
    qrScriptPromise=new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(script=>script.src===QR_SCRIPT_URL);
      if(existing){existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",()=>reject(new Error("QRコード機能を読み込めません")),{once:true});return;}
      const script=document.createElement("script");script.src=QR_SCRIPT_URL;script.async=true;script.crossOrigin="anonymous";script.integrity=QR_SCRIPT_INTEGRITY;
      script.onload=()=>window.QRCode?resolve():reject(new Error("QRコード機能を読み込めません"));script.onerror=()=>reject(new Error("QRコード機能を読み込めません"));document.head.appendChild(script);
    }).catch(error=>{qrScriptPromise=null;throw error;});return qrScriptPromise;
  }
  async function createPhotoQrImage(item){
    const ll=photoLatLon(item),url=googleMapsSearchUrl(ll);if(!url)return null;await ensureQrScript();
    const host=document.createElement("div");host.style.cssText="position:fixed;left:-9999px;top:-9999px;width:384px;height:384px;background:#fff";document.body.appendChild(host);
    try{
      new QRCode(host,{text:url,width:384,height:384,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const source=host.querySelector("canvas,img");if(!source)throw new Error("QRコードを作成できません");
      const canvas=document.createElement("canvas");canvas.width=416;canvas.height=416;const context=canvas.getContext("2d",{alpha:false});
      context.fillStyle="#fff";context.fillRect(0,0,416,416);context.drawImage(source,16,16,384,384);
      return {blob:await canvasToBlob(canvas,"image/png"),width:416,height:416,extension:"png",contentType:"image/png",url};
    }finally{host.remove();}
  }
  function installUi(){
    const style=document.createElement("style");style.textContent=`
      #googleMapsLinkModal{display:none;position:fixed;inset:0;z-index:238;pointer-events:none}
      #googleMapsLinkBox{pointer-events:auto;position:absolute;right:60px;top:calc(58px + var(--cad-toolbar-offset,40px));width:min(285px,calc(100vw - 76px));padding:9px 10px;box-sizing:border-box;border:1px solid var(--border);border-radius:11px;background:color-mix(in srgb,var(--panel2) 96%,transparent);color:var(--fg);box-shadow:0 10px 28px rgba(0,0,0,.38)}
      #googleMapsLinkHeader{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;font-weight:800}
      #googleMapsLinkHeader button{min-height:30px;padding:3px 9px;font-size:12px}
      #googleMapsLinkStatus{margin-top:7px;font-size:12px;line-height:1.5;color:var(--muted)}
      @media(max-width:700px),(pointer:coarse){#googleMapsLinkBox{left:8px;right:8px;top:auto;bottom:8px;width:auto}}
    `;document.head.appendChild(style);
    const modal=document.createElement("div");modal.id="googleMapsLinkModal";modal.innerHTML=`<div id="googleMapsLinkBox" role="dialog" aria-label="Google連携"><div id="googleMapsLinkHeader"><span>Google連携</span><button id="googleMapsLinkCloseBtn" type="button">閉じる</button></div><div id="googleMapsLinkStatus"></div></div>`;document.body.appendChild(modal);
    byId("googleMapsLinkCloseBtn").addEventListener("click",close);byId("googleMapsLinkBtn")?.addEventListener("click",event=>{event.preventDefault();toggle();});
    // interactionCanvas is a draw-only overlay with pointer-events:none.
    // Bind selection to the actual input canvas so CAD points can be hit.
    const target=byId("canvas")||byId("interactionCanvas");target?.addEventListener("mousedown",interceptMouseDown,true);target?.addEventListener("click",interceptClick,true);
    window.addEventListener("mousemove",interceptMouseMove,true);window.addEventListener("mouseup",interceptMouseUp,true);
    target?.addEventListener("touchstart",interceptTouchStart,{capture:true,passive:false});target?.addEventListener("touchmove",interceptTouchMove,{capture:true,passive:false});target?.addEventListener("touchend",interceptTouchEnd,{capture:true,passive:false});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&active){event.preventDefault();event.stopImmediatePropagation();close();}},true);syncAvailability();setButtonState();
  }
  window.GoogleMapsLinkFeature={open,close,toggle,isActive:()=>active,syncAvailability,drawOverlay,buildMapUrl:googleMapsUrl,buildStreetViewUrl:googleStreetViewUrl,buildMapSearchUrl:googleMapsSearchUrl,bearing,selectWorldPoint,photoLatLon,createPhotoQrImage,getSelection:()=>({positionWorld:positionWorld?{...positionWorld}:null,directionWorld:directionWorld?{...directionWorld}:null})};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installUi,{once:true});else installUi();
})();
