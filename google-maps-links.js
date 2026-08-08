(()=>{
  "use strict";

  const GOOGLE_MAP_TARGET="ezviewer-google-map";
  const GOOGLE_STREET_TARGET="ezviewer-google-streetview";
  const QR_SCRIPT_URL="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
  const QR_SCRIPT_INTEGRITY="sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==";
  let active=false;
  let selectionMode="position";
  let positionWorld=null;
  let directionWorld=null;
  let coordinateZone=null;
  let positionLatLon=null;
  let directionLatLon=null;
  let mapWindow=null;
  let streetWindow=null;
  let qrScriptPromise=null;
  let touchCandidate=null;
  let suppressClickUntil=0;

  const byId=id=>document.getElementById(id);
  const isDesktop=()=>typeof isDesktopPhotoTool==="function"?isDesktopPhotoTool():matchMedia("(pointer:fine)").matches;
  const drawingAvailable=()=>typeof hasLoadedDrawing==="function"&&hasLoadedDrawing();
  const normalizeLatLon=value=>{
    const lat=Number(value&&value.lat),lon=Number(value&&value.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null;
  };
  const coord=value=>Number(value).toFixed(8).replace(/0+$/,"").replace(/\.$/,"");
  const googleMapsUrl=point=>{
    const ll=normalizeLatLon(point);
    if(!ll)return "";
    return `https://www.google.com/maps/@?api=1&map_action=map&center=${encodeURIComponent(`${coord(ll.lat)},${coord(ll.lon)}`)}&zoom=20&basemap=satellite`;
  };
  const googleMapsSearchUrl=point=>{
    const ll=normalizeLatLon(point);
    if(!ll)return "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coord(ll.lat)},${coord(ll.lon)}`)}`;
  };
  const bearing=(from,to)=>{
    const a=normalizeLatLon(from),b=normalizeLatLon(to);
    if(!a||!b)return null;
    const rad=Math.PI/180,lat1=a.lat*rad,lat2=b.lat*rad,dLon=(b.lon-a.lon)*rad;
    const y=Math.sin(dLon)*Math.cos(lat2);
    const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    return (Math.atan2(y,x)/rad+360)%360;
  };
  const googleStreetViewUrl=(point,heading=null)=>{
    const ll=normalizeLatLon(point);
    if(!ll)return "";
    const query=new URLSearchParams({api:"1",map_action:"pano",viewpoint:`${coord(ll.lat)},${coord(ll.lon)}`,pitch:"0",fov:"80"});
    if(Number.isFinite(Number(heading)))query.set("heading",Number(heading).toFixed(2));
    return `https://www.google.com/maps/@?${query}`;
  };

  function setStatus(message){const el=byId("googleMapsLinkStatus");if(el)el.textContent=message||"";}
  function setButtonState(){
    byId("googleMapsLinkBtn")?.classList.toggle("modeActive",active);
    byId("googleSelectPositionBtn")?.classList.toggle("active",active&&selectionMode==="position");
    byId("googleSelectDirectionBtn")?.classList.toggle("active",active&&selectionMode==="direction");
    const map=byId("googleOpenMapBtn"),street=byId("googleOpenStreetBtn");
    if(map)map.disabled=!positionLatLon;
    if(street)street.disabled=!positionLatLon;
  }
  function updateStatus(){
    if(!positionLatLon){setStatus("図面上で見る位置を選択してください。");return;}
    if(selectionMode==="direction"&&!directionLatLon){setStatus("図面上で見る方向を選択してください。");return;}
    const heading=bearing(positionLatLon,directionLatLon);
    setStatus(directionLatLon&&Number.isFinite(heading)
      ?`位置を選択済み　見る方向 ${heading.toFixed(1)}°`
      :"位置を選択済み。必要なら「見る方向を選択」を押してください。");
  }
  async function resolveZone(){
    const manual=typeof getManualCoordinateZone==="function"?getManualCoordinateZone():null;
    if(manual)return manual;
    if(coordinateZone)return coordinateZone;
    if(typeof resolveProfileZone==="function")coordinateZone=await resolveProfileZone();
    return coordinateZone;
  }
  async function worldToLatLon(point){
    if(!point||typeof sfcWorldToPlane!=="function"||typeof jgd2024XYToLatLon!=="function")return null;
    const zone=await resolveZone();
    if(!zone)throw new Error("座標系を判定できません。設定から座標系を選択してください。");
    const plane=sfcWorldToPlane(point.x,point.y);
    const ll=jgd2024XYToLatLon(plane.xNorth,plane.yEast,zone);
    return normalizeLatLon(ll);
  }
  function updateOpenWindows(){
    if(!positionLatLon)return;
    const mapUrl=googleMapsUrl(positionLatLon);
    const streetUrl=googleStreetViewUrl(positionLatLon,bearing(positionLatLon,directionLatLon));
    try{if(mapWindow&&!mapWindow.closed)mapWindow.location.href=mapUrl;}catch(_error){}
    try{if(streetWindow&&!streetWindow.closed)streetWindow.location.href=streetUrl;}catch(_error){}
  }
  async function selectWorldPoint(world){
    try{
      const ll=await worldToLatLon(world);
      if(!ll)return;
      if(selectionMode==="direction"){
        if(!positionWorld){selectionMode="position";setStatus("先に見る位置を選択してください。");setButtonState();return;}
        directionWorld={x:world.x,y:world.y};directionLatLon=ll;selectionMode="";
      }else{
        positionWorld={x:world.x,y:world.y};positionLatLon=ll;
        directionWorld=null;directionLatLon=null;selectionMode="";
      }
      updateStatus();setButtonState();updateOpenWindows();
      if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
    }catch(error){
      console.error("Google link coordinate conversion failed",error);
      if(typeof showToast==="function")showToast(error?.message||"位置を変換できません",2600);
      setStatus(error?.message||"位置を変換できません");
    }
  }
  function canvasPoint(event){
    const canvas=byId("interactionCanvas")||byId("canvas");
    if(!canvas||typeof screenToWorld!=="function")return null;
    const rect=canvas.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top,world=screenToWorld(x,y);
    return {screenX:x,screenY:y,x:world[0],y:world[1]};
  }
  function interceptMouseDown(event){
    if(!active||event.button!==0||!selectionMode)return;
    event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptClick(event){
    if(!active||!selectionMode||Date.now()<suppressClickUntil)return;
    const point=canvasPoint(event);if(!point)return;
    event.preventDefault();event.stopImmediatePropagation();
    selectWorldPoint(point);
  }
  function interceptTouchStart(event){
    if(!active||!selectionMode||event.touches.length!==1){touchCandidate=null;return;}
    const touch=event.touches[0];touchCandidate={x:touch.clientX,y:touch.clientY,moved:false};
    event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptTouchMove(event){
    if(!touchCandidate||event.touches.length!==1)return;
    const touch=event.touches[0];
    if(Math.hypot(touch.clientX-touchCandidate.x,touch.clientY-touchCandidate.y)>12)touchCandidate.moved=true;
    event.preventDefault();event.stopImmediatePropagation();
  }
  function interceptTouchEnd(event){
    if(!touchCandidate)return;
    const candidate=touchCandidate;touchCandidate=null;
    event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=Date.now()+500;
    if(candidate.moved)return;
    selectWorldPoint(canvasPoint({clientX:candidate.x,clientY:candidate.y}));
  }
  function openExternal(kind){
    if(!positionLatLon){if(typeof showToast==="function")showToast("先に見る位置を選択してください",1800);return;}
    const heading=bearing(positionLatLon,directionLatLon);
    const url=kind==="street"?googleStreetViewUrl(positionLatLon,heading):googleMapsUrl(positionLatLon);
    if(isDesktop()){
      const name=kind==="street"?GOOGLE_STREET_TARGET:GOOGLE_MAP_TARGET;
      const ref=window.open(url,name,"noopener=false");
      if(kind==="street")streetWindow=ref;else mapWindow=ref;
    }else window.open(url,"_blank","noopener");
  }
  function open(){
    if(!drawingAvailable()){if(typeof showToast==="function")showToast("先にSFC図面を開いてください",1800);return;}
    if(typeof closePanelsExcept==="function")closePanelsExcept("googleMapsLink");
    active=true;selectionMode=positionLatLon?"":"position";
    const modal=byId("googleMapsLinkModal");if(modal)modal.style.display="flex";
    updateStatus();setButtonState();
    if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
  }
  function close(){
    active=false;selectionMode="";touchCandidate=null;
    const modal=byId("googleMapsLinkModal");if(modal)modal.style.display="none";
    setButtonState();
    if(typeof scheduleInteractionDraw==="function")scheduleInteractionDraw();
  }
  function toggle(){active?close():open();}
  function syncAvailability(){
    const button=byId("googleMapsLinkBtn"),available=drawingAvailable();
    if(button){button.classList.toggle("unavailableTool",!available);button.classList.toggle("dimmed",!available);button.setAttribute("aria-disabled",available?"false":"true");}
    if(!available)close();
  }
  function drawOverlay(ctx){
    if(!active||!ctx||typeof worldToScreen!=="function")return;
    const drawPoint=(point,color,label)=>{
      if(!point)return;const screen=worldToScreen(point.x,point.y);
      ctx.save();ctx.fillStyle="rgba(255,255,255,.9)";ctx.strokeStyle=color;ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(screen[0],screen[1],9,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=color;ctx.font="700 12px sans-serif";ctx.textAlign="center";ctx.textBaseline="bottom";ctx.fillText(label,screen[0],screen[1]-12);ctx.restore();
    };
    if(positionWorld&&directionWorld){
      const a=worldToScreen(positionWorld.x,positionWorld.y),b=worldToScreen(directionWorld.x,directionWorld.y);
      ctx.save();ctx.strokeStyle="#00a8e8";ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.restore();
    }
    drawPoint(positionWorld,"#1677ff","位置");drawPoint(directionWorld,"#17a05e","方向");
  }
  function photoLatLon(item){
    if(!item)return null;
    const zone=typeof getPhotoCoordinateZone==="function"?getPhotoCoordinateZone(item):null;
    if(zone&&Number.isFinite(+item.xNorth)&&Number.isFinite(+item.yEast)&&typeof jgd2024XYToLatLon==="function"){
      try{return normalizeLatLon(jgd2024XYToLatLon(+item.xNorth,+item.yEast,zone));}catch(_error){}
    }
    return normalizeLatLon(item);
  }
  function ensureQrScript(){
    if(window.QRCode)return Promise.resolve();
    if(qrScriptPromise)return qrScriptPromise;
    qrScriptPromise=new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(script=>script.src===QR_SCRIPT_URL);
      if(existing){existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",()=>reject(new Error("QRコード機能を読み込めません")),{once:true});return;}
      const script=document.createElement("script");script.src=QR_SCRIPT_URL;script.async=true;script.crossOrigin="anonymous";script.integrity=QR_SCRIPT_INTEGRITY;
      script.onload=()=>window.QRCode?resolve():reject(new Error("QRコード機能を読み込めません"));
      script.onerror=()=>reject(new Error("QRコード機能を読み込めません"));document.head.appendChild(script);
    }).catch(error=>{qrScriptPromise=null;throw error;});
    return qrScriptPromise;
  }
  async function createPhotoQrImage(item){
    const ll=photoLatLon(item),url=googleMapsSearchUrl(ll);
    if(!url)return null;
    await ensureQrScript();
    const host=document.createElement("div");host.style.cssText="position:fixed;left:-9999px;top:-9999px;width:384px;height:384px;background:#fff";document.body.appendChild(host);
    try{
      new QRCode(host,{text:url,width:384,height:384,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const source=host.querySelector("canvas,img");if(!source)throw new Error("QRコードを作成できません");
      const canvas=document.createElement("canvas");canvas.width=440;canvas.height=500;
      const context=canvas.getContext("2d",{alpha:false});context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(source,28,20,384,384);
      context.fillStyle="#000";context.font="700 24px sans-serif";context.textAlign="center";context.textBaseline="middle";context.fillText("Googleマップで表示",220,452);
      return {blob:await canvasToBlob(canvas,"image/png"),width:440,height:500,extension:"png",contentType:"image/png"};
    }finally{host.remove();}
  }

  function installUi(){
    const style=document.createElement("style");
    style.textContent=`
      #googleMapsLinkModal{display:none;position:fixed;inset:0;z-index:238;pointer-events:none}
      #googleMapsLinkBox{pointer-events:auto;position:absolute;right:12px;bottom:12px;width:min(340px,calc(100vw - 24px));padding:12px;box-sizing:border-box;border:1px solid var(--border);border-radius:13px;background:color-mix(in srgb,var(--panel2) 96%,transparent);color:var(--fg);box-shadow:0 12px 34px rgba(0,0,0,.38)}
      #googleMapsLinkHeader{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:15px;font-weight:800}
      #googleMapsLinkHeader button{min-height:31px;padding:3px 9px;font-size:12px}
      #googleMapsLinkStatus{min-height:38px;margin:5px 0 9px;font-size:12px;line-height:1.55;color:var(--muted)}
      #googleMapsPickActions,#googleMapsOpenActions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      #googleMapsOpenActions{margin-top:8px}
      #googleMapsLinkBox button{min-height:38px;font-size:12px;font-weight:750}
      #googleMapsLinkBox button.active{background:#1677ff;color:#fff;border-color:#0f5ec8}
      #googleMapsOpenActions button{background:#1677ff;color:#fff;border-color:#0f5ec8}
      #googleMapsOpenActions button:disabled{opacity:.38}
      #googleMapsLinkNote{margin-top:8px;font-size:10px;line-height:1.45;color:var(--muted)}
      @media(max-width:700px),(pointer:coarse){#googleMapsLinkBox{left:8px;right:8px;bottom:8px;width:auto}}
    `;document.head.appendChild(style);
    const modal=document.createElement("div");modal.id="googleMapsLinkModal";modal.innerHTML=`
      <div id="googleMapsLinkBox" role="dialog" aria-label="Google連携">
        <div id="googleMapsLinkHeader"><span>Google連携</span><button id="googleMapsLinkCloseBtn" type="button">閉じる</button></div>
        <div id="googleMapsLinkStatus"></div>
        <div id="googleMapsPickActions">
          <button id="googleSelectPositionBtn" type="button">見る位置を選択</button>
          <button id="googleSelectDirectionBtn" type="button">見る方向を選択</button>
        </div>
        <div id="googleMapsOpenActions">
          <button id="googleOpenMapBtn" type="button">Google航空写真で開く</button>
          <button id="googleOpenStreetBtn" type="button">Googleストリートビューで開く</button>
        </div>
        <div id="googleMapsLinkNote">Google画像はEz Viewerへ取得・保存せず、通常のブラウザーで開きます。</div>
      </div>`;document.body.appendChild(modal);
    byId("googleMapsLinkCloseBtn").addEventListener("click",close);
    byId("googleSelectPositionBtn").addEventListener("click",()=>{selectionMode="position";updateStatus();setButtonState();});
    byId("googleSelectDirectionBtn").addEventListener("click",()=>{if(!positionWorld){selectionMode="position";setStatus("先に見る位置を選択してください。");}else selectionMode="direction";updateStatus();setButtonState();});
    byId("googleOpenMapBtn").addEventListener("click",()=>openExternal("map"));
    byId("googleOpenStreetBtn").addEventListener("click",()=>openExternal("street"));
    byId("googleMapsLinkBtn")?.addEventListener("click",event=>{event.preventDefault();toggle();});
    const target=byId("interactionCanvas")||byId("canvas");
    target?.addEventListener("mousedown",interceptMouseDown,true);target?.addEventListener("click",interceptClick,true);
    target?.addEventListener("touchstart",interceptTouchStart,{capture:true,passive:false});target?.addEventListener("touchmove",interceptTouchMove,{capture:true,passive:false});target?.addEventListener("touchend",interceptTouchEnd,{capture:true,passive:false});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&active){event.preventDefault();event.stopImmediatePropagation();close();}},true);
    syncAvailability();setButtonState();
  }

  window.GoogleMapsLinkFeature={
    open,close,toggle,isActive:()=>active,syncAvailability,drawOverlay,
    buildMapUrl:googleMapsUrl,buildStreetViewUrl:googleStreetViewUrl,buildMapSearchUrl:googleMapsSearchUrl,
    bearing,selectWorldPoint,photoLatLon,createPhotoQrImage
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installUi,{once:true});else installUi();
})();
