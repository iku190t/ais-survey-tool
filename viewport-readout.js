/* Display-only viewport instruments. No drawing, GPS, or saved state is modified. */
(()=>{
  'use strict';
  const style=document.createElement('style');
  style.textContent=`
  #viewportReadout{position:fixed;pointer-events:none;z-index:55;color:white;opacity:.7;overflow:hidden}
  #viewportReadout[hidden]{display:none}
  #viewportCenter{position:absolute;left:50%;top:50%;width:20px;height:20px;transform:translate(-50%,-50%);opacity:.6}
  #viewportCenter:before,#viewportCenter:after{content:'';position:absolute;background:currentColor}
  #viewportCenter:before{left:0;top:9.5px;width:20px;height:1px}
  #viewportCenter:after{top:0;left:9.5px;width:1px;height:20px}
  #viewportCoordinates{position:absolute;bottom:calc(2px + env(safe-area-inset-bottom));left:28px;right:28px;text-align:center;font:10px/13px system-ui,sans-serif;font-variant-numeric:tabular-nums;display:flex;justify-content:center;gap:0 10px;flex-wrap:wrap}
  #viewportScale{position:absolute;left:24px;width:75px;height:18px;overflow:visible}
  body.viewport-instruments #gpsReturnBtn{bottom:calc(50px + env(safe-area-inset-bottom))}
  body.viewport-instruments #droggerOwnerActions{bottom:calc(96px + env(safe-area-inset-bottom))}
  body.viewport-instruments #mapOverlayInfoStack{bottom:calc(50px + env(safe-area-inset-bottom))}
  `;
  document.head.append(style);
  const hud=document.createElement('div');hud.id='viewportReadout';hud.hidden=true;
  hud.innerHTML='<div id="viewportCenter" aria-hidden="true"></div><svg id="viewportScale" aria-label="距離スケール"></svg><div id="viewportCoordinates"><span id="viewportXY"></span><span id="viewportElevation">DEM標高: —</span></div>';
  document.body.append(hud);
  const xy=hud.querySelector('#viewportXY'),height=hud.querySelector('#viewportElevation'),ruler=hud.querySelector('svg');
  let key='',changed=0,pending=false,done='',lastRuler='';
  let buttonWidth=112;
  function update(){
    if(document.hidden)return;
    const active=isTouchMobileLike()&&hasActiveWorkspace();
    hud.hidden=!active;document.body.classList.toggle('viewport-instruments',active);
    if(!active){key='';return;}
    // offsetWidth avoids the temporary CSS pan/zoom preview transform.
    const parent=canvas.parentElement.getBoundingClientRect();
    const w=canvas.clientWidth,h=canvas.clientHeight;
    Object.assign(hud.style,{left:`${parent.left+canvas.offsetLeft}px`,top:`${parent.top+canvas.offsetTop}px`,width:`${w}px`,height:`${h}px`,color:darkTheme?'#fff':'#000'});
    const dx=touchPanPreviewActive?touchPanPreviewDx:0,dy=touchPanPreviewActive?touchPanPreviewDy:0;
    const world=screenToWorld(w/2-dx,h/2-dy),plane=sfcWorldToPlane(...world);
    const edge=sfcWorldToPlane(...screenToWorld(w/2-dx+100,h/2-dy));
    const metersPerPixel=Math.hypot(edge.xNorth-plane.xNorth,edge.yEast-plane.yEast)/100;
    const zone=(gpsEnabled&&gpsTemporaryCoordinateZone)||getManualCoordinateZone()||profileZone||null;
    const next=[drawingWorkspaceRevision,zone,plane.xNorth.toFixed(3),plane.yEast.toFixed(3)].join(':');
    xy.textContent=`X: ${plane.xNorth.toFixed(3)}  Y: ${plane.yEast.toFixed(3)}`;
    if(next!==key){key=next;done='';changed=Date.now();height.textContent=zone?'DEM標高: …':'DEM標高: —（系未設定）';}
    const returnButton=document.getElementById('gpsReturnBtn');
    const buttonRect=returnButton.getBoundingClientRect();
    if(buttonRect.width)buttonWidth=buttonRect.width;
    if(Number.isFinite(metersPerPixel)&&metersPerPixel>0){
      const width=buttonWidth*2/3,distance=metersPerPixel*width;
      const signature=`${distance}:${width.toFixed(1)}`;
      if(signature!==lastRuler){
        lastRuler=signature;ruler.style.width=`${width}px`;
        const unit=distance>=1000?'km':distance<1?'cm':'m';
        const value=distance/(unit==='km'?1000:unit==='cm'?.01:1);
        const label=`${+value.toPrecision(3)} ${unit}`;
        ruler.innerHTML=`<text x="${width/2}" y="9" text-anchor="middle" fill="currentColor" font-family="system-ui" font-size="10">${label}</text><path d="M0,12V17H${width}V12" fill="none" stroke="currentColor" stroke-width="1"/>`;
      }
    }
    const rect=hud.getBoundingClientRect();
    const coordinates=hud.querySelector('#viewportCoordinates').getBoundingClientRect();
    const safeBottom=parseFloat(getComputedStyle(hud.querySelector('#viewportCoordinates')).bottom)-2;
    const upperEdge=buttonRect.height?buttonRect.bottom:rect.bottom-50-safeBottom;
    ruler.style.top=`${(upperEdge+coordinates.top)/2-rect.top-9}px`;
    ruler.style.left=`${12+buttonWidth/6}px`;
    if(zone&&!pending&&done!==key&&Date.now()-changed>=250){
      const request=key;pending=true;
      (async()=>{
        let elevation=null;
        try{
          if(!ensureProj4Defs())return;
          const ll=jgd2024XYToLatLon(plane.xNorth,plane.yEast,zone);
          for(const source of PROFILE_DEM_SOURCES){
            if(key!==request)return;
            try{elevation=await sampleDemElevationBilinear(ll.lat,ll.lon,source);}catch(_error){}
            if(Number.isFinite(elevation))break;
          }
        }finally{
          pending=false;
          if(key===request){done=request;height.textContent=Number.isFinite(elevation)?`DEM標高: ${elevation.toFixed(2)} m`:'DEM標高: —';}
        }
      })();
    }
  }
  // Small DOM-only update, no redraw or continuous GPS requests.
  setInterval(update,100);update();
})();
