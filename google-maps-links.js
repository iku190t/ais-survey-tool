(()=>{
  "use strict";

  const QR_SCRIPT_URL="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
  const QR_SCRIPT_INTEGRITY="sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==";
  let active=false,selectionMode="position",positionWorld=null,directionWorld=null;
  let coordinateZone=null,positionLatLon=null,directionLatLon=null;
  let streetWindow=null,qrScriptPromise=null,touchCandidate=null,suppressClickUntil=0;

  const byId=id=>document.getElementById(id);
  const isDesktop=()=>typeof isDesktopPhotoTool==="function"?isDesktopPhotoTool():matchMedia("(pointer:fine)").matches;
  const drawingAvailable=()=>typeof isDrawingActionAvailable==="function"
    ?isDrawingActionAvailable()
    :typeof hasLoadedDrawing==="function"&&hasLoadedDrawing();
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
  function externalWindowRect(){
    const leftBase=Number.isFinite(screen.availLeft)?screen.availLeft:0,topBase=Number.isFinite(screen.availTop)?screen.availTop:0;
    const availableWidth=Math.max(1,screen.availWidth||window.innerWidth||1200),availableHeight=Math.max(1,screen.availHeight||window.innerHeight||800);
    return {left:leftBase,top:topBase,width:availableWidth,height:availableHeight};
  }
  function popupFeatures(){
    if(!isDesktop())return "popup=yes";
    const {left,top,width,height}=externalWindowRect();
    return `popup=yes,left=${left},top=${top},width=${width},height=${height},resizable=yes,scrollbars=yes`;
  }
  function prepareExternalWindows(){
    if(!isDesktop())return;
    // 座標変換中にポップアップが遮断されないよう、2点目のクリックで
    // 空のウィンドウを先に確保する。同じ選択操作内では1枚だけにする。
    if(streetWindow){
      try{streetWindow.focus?.();}catch(_focusError){}
      return;
    }
    try{
      streetWindow=window.open("about:blank","_blank",popupFeatures());
      if(streetWindow)placeExternalWindows(streetWindow);
    }catch(_error){streetWindow=null;}
  }
  function placeExternalWindows(targetWindow=streetWindow){
    if(!isDesktop())return;
    const streetRect=externalWindowRect();
    try{targetWindow?.moveTo(streetRect.left,streetRect.top);targetWindow?.resizeTo(streetRect.width,streetRect.height);}catch(_error){}
  }
  function openExternalPair(reposition=true){
    if(!positionLatLon||!directionLatLon)return;
    const heading=bearing(positionLatLon,directionLatLon),streetUrl=googleStreetViewUrl(positionLatLon,heading);
    let targetWindow=streetWindow,openedNow=false;
    streetWindow=null;
    if(targetWindow){
      try{
        targetWindow.location.href=streetUrl;
        try{targetWindow.focus?.();}catch(_focusError){}
      }catch(_error){targetWindow=null;}
    }
    try{
      if(!targetWindow){
        targetWindow=window.open(streetUrl,"_blank",popupFeatures());
        openedNow=!!targetWindow;
      }
    }catch(_error){targetWindow=null;}
    if(reposition&&openedNow)placeExternalWindows(targetWindow);
    if(!targetWindow){
      if(typeof showToast==="function")showToast("ブラウザーのポップアップを許可してください",3000);
    }
  }
  function previewDirectionFrom(point){
    const canvas=byId("canvas")||byId("interactionCanvas");if(!canvas||typeof screenToWorld!=="function")return null;
    const rect=canvas.getBoundingClientRect(),margin=28,offset=76;
    let screenX=point.screenX+offset;if(screenX>rect.width-margin)screenX=Math.max(margin,point.screenX-offset);
    const world=screenToWorld(screenX,point.screenY);return {x:world[0],y:world[1]};
  }
  async function selectWorldPoint(world){
    try{
      const ll=await worldToLatLon(world);if(!ll)return;
      if(selectionMode==="position"){
        positionWorld={x:world.x,y:world.y};positionLatLon=ll;directionWorld=isDesktop()?previewDirectionFrom(world):null;directionLatLon=null;selectionMode="direction";
      }else{
        directionWorld={x:world.x,y:world.y};directionLatLon=ll;
      }
      updateStatus();setButtonState();if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
      if(directionLatLon){
        if(isDesktop()){openExternalPair();close();}
        else{
          const streetUrl=googleStreetViewUrl(positionLatLon,bearing(positionLatLon,directionLatLon));
          setTimeout(()=>{close();if(streetUrl)window.open(streetUrl,"_self");},180);
        }
      }
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
  function setCanvasCursor(value=""){
    const canvas=byId("canvas")||byId("interactionCanvas");if(canvas)canvas.style.cursor=value;
  }
  function interceptMouseDown(event){
    if(!active||event.button!==0)return;
    const point=canvasPoint(event);if(point&&selectionMode==="direction"&&positionWorld){directionWorld={x:point.x,y:point.y};if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();}
    event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptMouseMove(event){
    if(!active||!isDesktop())return;
    const point=canvasPoint(event);
    if(point&&selectionMode==="direction"&&positionWorld){directionWorld={x:point.x,y:point.y};if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();}
    if(typeof clearDesktopCadObjectHover==="function")clearDesktopCadObjectHover();
    if(typeof updateDesktopCadCrosshair==="function")updateDesktopCadCrosshair(0,0,false,false);
    setCanvasCursor("crosshair");event.stopImmediatePropagation();
  }
  function interceptClick(event){
    if(!active)return;
    event.preventDefault();event.stopImmediatePropagation();if(Date.now()<suppressClickUntil)return;
    const point=canvasPoint(event);if(!point)return;
    if(selectionMode==="direction")prepareExternalWindows();selectWorldPoint(point);
  }
  function interceptTouchStart(event){
    if(!active||event.touches.length!==1){touchCandidate=null;return;}
    const touch=event.touches[0],point=canvasPoint(touch);
    const mode=selectionMode==="direction"&&positionWorld?"second-point":"first-point";
    touchCandidate={mode,x:touch.clientX,y:touch.clientY,lastX:touch.clientX,lastY:touch.clientY,moved:false};
    if(mode==="second-point"&&point){directionWorld={x:point.x,y:point.y};if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();}
    event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptTouchMove(event){
    if(!touchCandidate||event.touches.length!==1)return;const touch=event.touches[0];
    touchCandidate.lastX=touch.clientX;touchCandidate.lastY=touch.clientY;
    if(touchCandidate.mode==="second-point"){
      const point=canvasPoint(touch);if(point){directionWorld={x:point.x,y:point.y};touchCandidate.moved=true;if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();}
    }else if(Math.hypot(touch.clientX-touchCandidate.x,touch.clientY-touchCandidate.y)>12)touchCandidate.moved=true;
    event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptTouchEnd(event){
    if(!touchCandidate)return;const candidate=touchCandidate;touchCandidate=null;
    event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=Date.now()+500;
    const point=canvasPoint({clientX:candidate.lastX,clientY:candidate.lastY});if(!point)return;
    if(candidate.mode==="first-point"&&candidate.moved)return;
    if(candidate.mode==="second-point"&&isDesktop())prepareExternalWindows();void selectWorldPoint(point);
  }
  function open(){
    if(!drawingAvailable()){if(typeof showToast==="function")showToast("先にSFC図面を開くか、現在地モードを開始してください",1800);return;}
    if(typeof closePanelsExcept==="function")closePanelsExcept("googleMapsLink");
    active=true;selectionMode="position";positionWorld=null;directionWorld=null;positionLatLon=null;directionLatLon=null;
    const modal=byId("googleMapsLinkModal");if(modal)modal.style.display="flex";updateStatus();setButtonState();
    if(isDesktop())setCanvasCursor("crosshair");
    if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
  }
  function close(){
    active=false;selectionMode="position";touchCandidate=null;setCanvasCursor("");
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
    const drawPoint=point=>{if(!point)return;const screenPoint=worldToScreen(point.x,point.y);context.save();context.fillStyle="rgba(22,119,255,.28)";context.strokeStyle="#1677ff";context.lineWidth=3;context.beginPath();context.arc(screenPoint[0],screenPoint[1],8,0,Math.PI*2);context.fill();context.stroke();context.restore();};
    if(positionWorld&&directionWorld){
      const a=worldToScreen(positionWorld.x,positionWorld.y),b=worldToScreen(directionWorld.x,directionWorld.y);
      context.save();context.strokeStyle="#1677ff";context.lineWidth=2.5;context.setLineDash([]);context.beginPath();context.moveTo(a[0],a[1]);context.lineTo(b[0],b[1]);context.stroke();
      const angle=Math.atan2(b[1]-a[1],b[0]-a[0]),headLength=isDesktop()?13:17,spread=.52;
      context.setLineDash([]);context.beginPath();context.moveTo(b[0],b[1]);context.lineTo(b[0]-headLength*Math.cos(angle-spread),b[1]-headLength*Math.sin(angle-spread));context.moveTo(b[0],b[1]);context.lineTo(b[0]-headLength*Math.cos(angle+spread),b[1]-headLength*Math.sin(angle+spread));context.stroke();
      context.restore();
    }
    // The second point is represented by the arrow tip on both PC and phone.
    // Drawing another circle there makes the direction look like a point mark.
    drawPoint(positionWorld);
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
    byId("googleMapsLinkCloseBtn").addEventListener("click",close);
    // interactionCanvas is a draw-only overlay with pointer-events:none.
    // Bind selection to the actual input canvas so CAD points can be hit.
    const target=byId("canvas")||byId("interactionCanvas");target?.addEventListener("mousedown",interceptMouseDown,true);target?.addEventListener("click",interceptClick,true);
    window.addEventListener("mousemove",interceptMouseMove,true);
    target?.addEventListener("touchstart",interceptTouchStart,{capture:true,passive:false});target?.addEventListener("touchmove",interceptTouchMove,{capture:true,passive:false});target?.addEventListener("touchend",interceptTouchEnd,{capture:true,passive:false});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&active){event.preventDefault();event.stopImmediatePropagation();close();}},true);syncAvailability();setButtonState();
    // The large single-file viewer can become visible before this auxiliary
    // script finishes loading. Preserve an early first click instead of losing it.
    if(window.__ezGoogleLinkPendingOpen){window.__ezGoogleLinkPendingOpen=false;setTimeout(open,0);}
  }
  window.GoogleMapsLinkFeature={open,close,toggle,isActive:()=>active,syncAvailability,drawOverlay,buildMapUrl:googleMapsUrl,buildStreetViewUrl:googleStreetViewUrl,buildMapSearchUrl:googleMapsSearchUrl,bearing,selectWorldPoint,photoLatLon,createPhotoQrImage,getSelection:()=>({positionWorld:positionWorld?{...positionWorld}:null,directionWorld:directionWorld?{...directionWorld}:null})};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installUi,{once:true});else installUi();
})();
