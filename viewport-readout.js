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
  #viewportCoordinates{position:absolute;bottom:calc(8px + env(safe-area-inset-bottom));left:28px;right:28px;text-align:center;font:11px/16px system-ui,sans-serif;font-variant-numeric:tabular-nums;display:flex;justify-content:center;gap:3px 12px;flex-wrap:wrap}
  #viewportScale{position:absolute;left:24px;width:160px;height:34px;overflow:visible}
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
  const nice=value=>{const p=10**Math.floor(Math.log10(value));return [5,2,1].map(n=>n*p).find(n=>n<=value)||p/2;};
  function update(){
    if(document.hidden)return;
    const active=hasActiveWorkspace();
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
    if(Number.isFinite(metersPerPixel)&&metersPerPixel>0){
      const distance=nice(metersPerPixel*Math.min(150,w*.35)),width=distance/metersPerPixel;
      const signature=`${distance}:${width.toFixed(1)}`;
      if(signature!==lastRuler){
        lastRuler=signature;ruler.style.width=`${width}px`;
        const labels=[0,.25,.5,1].map(f=>`<text x="${width*f}" y="11" text-anchor="${f===0?'start':f===1?'end':'middle'}">${+(distance*f/(distance>=1000?1000:1)).toPrecision(4)}${f===1?(distance>=1000?' km':' m'):''}</text>`).join('');
        const ticks=Array.from({length:21},(_,i)=>`M${width*i/20},30v-${i%5===0?11:5}`).join(' ');
        ruler.innerHTML=`<g fill="currentColor" font-family="system-ui" font-size="10">${labels}</g><path d="M0,30H${width} ${ticks}" fill="none" stroke="currentColor" stroke-width="1"/>`;
      }
    }
    const rect=hud.getBoundingClientRect();let bottom=52;
    for(const id of ['gpsReturnBtn','droggerOwnerActions','mapOverlayInfoStack']){
      const el=document.getElementById(id);if(!el||!el.getClientRects().length)continue;
      const r=el.getBoundingClientRect();
      if(r.height&&r.left<rect.left+190&&r.right>rect.left+24)bottom=Math.max(bottom,rect.bottom-r.top+8);
    }
    ruler.style.bottom=`${bottom}px`;
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
