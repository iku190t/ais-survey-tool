(function(global){
"use strict";

const ADVANCED_MODES=new Set([
  "multihillshade","localrelief","openness","curvature","microterrain",
  "accumulation","ridgevalley","flatland","artificial","viewshed","inundation"
]);
const DIRECTIONS=[[-1,0],[-1,1],[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1]];
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const finite=value=>Number.isFinite(value);
const sleep=()=>new Promise(resolve=>setTimeout(resolve,0));

function pointAt(grid,row,col){
  return row>=0&&row<grid.rows&&col>=0&&col<grid.cols?grid.points[row*grid.cols+col]:null;
}
function cellSpacing(grid){
  const distances=[];
  const row=Math.floor(grid.rows/2),col=Math.floor(grid.cols/2);
  for(const [r1,c1,r2,c2] of [[row,col,row,Math.min(grid.cols-1,col+1)],[row,col,Math.min(grid.rows-1,row+1),col]]){
    const a=pointAt(grid,r1,c1),b=pointAt(grid,r2,c2);
    if(a?.plane&&b?.plane){
      const distance=Math.hypot(b.plane.xNorth-a.plane.xNorth,b.plane.yEast-a.plane.yEast);
      if(distance>0)distances.push(distance);
    }
  }
  return distances.length?distances.reduce((sum,value)=>sum+value,0)/distances.length:1;
}
function elevations(grid){
  const values=new Float64Array(grid.points.length);
  for(let index=0;index<values.length;index++)values[index]=finite(grid.points[index]?.elevation)?grid.points[index].elevation:NaN;
  return values;
}
function robustAbsScale(values,fallback=.1,quantile=.94){
  const sample=[];
  for(const value of values)if(finite(value)&&Math.abs(value)>1e-10)sample.push(Math.abs(value));
  if(!sample.length)return fallback;
  sample.sort((a,b)=>a-b);
  return Math.max(fallback,sample[Math.min(sample.length-1,Math.floor((sample.length-1)*quantile))]);
}
function gradientMetrics(grid,z){
  const count=z.length,gx=new Float32Array(count),gy=new Float32Array(count),slope=new Float32Array(count),curvature=new Float32Array(count);
  gx.fill(NaN);gy.fill(NaN);slope.fill(NaN);curvature.fill(NaN);
  for(let row=1;row<grid.rows-1;row++)for(let col=1;col<grid.cols-1;col++){
    const index=row*grid.cols+col,left=index-1,right=index+1,top=index-grid.cols,bottom=index+grid.cols;
    if(![z[index],z[left],z[right],z[top],z[bottom]].every(finite))continue;
    const lp=grid.points[left].plane,rp=grid.points[right].plane,tp=grid.points[top].plane,bp=grid.points[bottom].plane;
    const dx=Math.hypot(rp.xNorth-lp.xNorth,rp.yEast-lp.yEast),dy=Math.hypot(bp.xNorth-tp.xNorth,bp.yEast-tp.yEast);
    if(!(dx>0&&dy>0))continue;
    gx[index]=(z[right]-z[left])/dx;
    gy[index]=(z[bottom]-z[top])/dy;
    slope[index]=Math.atan(Math.hypot(gx[index],gy[index]))*180/Math.PI;
    const hx=dx*.5,hy=dy*.5;
    curvature[index]=((2*z[index]-z[left]-z[right])/(hx*hx)+(2*z[index]-z[top]-z[bottom])/(hy*hy))*.5;
  }
  return {gx,gy,slope,curvature};
}
function integralMetrics(grid,z){
  const width=grid.cols+1,height=grid.rows+1,size=width*height;
  const sum=new Float64Array(size),sumSq=new Float64Array(size),count=new Uint32Array(size);
  for(let row=1;row<height;row++){
    let rowSum=0,rowSq=0,rowCount=0;
    for(let col=1;col<width;col++){
      const value=z[(row-1)*grid.cols+col-1];
      if(finite(value)){rowSum+=value;rowSq+=value*value;rowCount++;}
      const index=row*width+col,above=(row-1)*width+col;
      sum[index]=sum[above]+rowSum;sumSq[index]=sumSq[above]+rowSq;count[index]=count[above]+rowCount;
    }
  }
  const query=(array,row0,col0,row1,col1)=>{
    row0=Math.max(0,row0);col0=Math.max(0,col0);row1=Math.min(grid.rows-1,row1);col1=Math.min(grid.cols-1,col1);
    const a=row0*width+col0,b=row0*width+col1+1,c=(row1+1)*width+col0,d=(row1+1)*width+col1+1;
    return array[d]-array[b]-array[c]+array[a];
  };
  return {sum,sumSq,count,query};
}
function neighborhoodMetrics(grid,z,radius){
  const integral=integralMetrics(grid,z),relief=new Float32Array(z.length),roughness=new Float32Array(z.length);
  relief.fill(NaN);roughness.fill(NaN);
  for(let row=0;row<grid.rows;row++)for(let col=0;col<grid.cols;col++){
    const index=row*grid.cols+col;if(!finite(z[index]))continue;
    const n=integral.query(integral.count,row-radius,col-radius,row+radius,col+radius);
    if(n<3)continue;
    const sum=integral.query(integral.sum,row-radius,col-radius,row+radius,col+radius);
    const sumSq=integral.query(integral.sumSq,row-radius,col-radius,row+radius,col+radius);
    const mean=sum/n;
    relief[index]=z[index]-mean;
    roughness[index]=Math.sqrt(Math.max(0,sumSq/n-mean*mean));
  }
  return {relief,roughness};
}
async function opennessMetric(grid,z,radius,isCancelled,onProgress){
  const values=new Float32Array(z.length);values.fill(NaN);
  const spacing=cellSpacing(grid);
  for(let row=0;row<grid.rows;row++){
    if(isCancelled())return null;
    for(let col=0;col<grid.cols;col++){
      const index=row*grid.cols+col,z0=z[index];if(!finite(z0))continue;
      let positive=0,negative=0,used=0;
      for(const [dr,dc] of DIRECTIONS){
        let up=0,down=0,found=false;
        for(let step=1;step<=radius;step++){
          const rr=row+dr*step,cc=col+dc*step;
          if(rr<0||rr>=grid.rows||cc<0||cc>=grid.cols)break;
          const zn=z[rr*grid.cols+cc];if(!finite(zn))continue;
          const distance=spacing*step*Math.hypot(dr,dc),delta=zn-z0;
          up=Math.max(up,Math.atan2(delta,distance)*180/Math.PI);
          down=Math.max(down,Math.atan2(-delta,distance)*180/Math.PI);
          found=true;
        }
        if(found){positive+=90-up;negative+=90-down;used++;}
      }
      if(used)values[index]=positive/used-negative/used;
    }
    if(row%10===0){onProgress(row/grid.rows,"開度を計算中…");await sleep();}
  }
  return values;
}
function hillshade(metrics,index,azimuthDeg=315,altitudeDeg=42){
  const gx=metrics.gx[index],gy=metrics.gy[index];if(!finite(gx)||!finite(gy))return NaN;
  const length=Math.sqrt(gx*gx+gy*gy+1),nx=-gx/length,ny=-gy/length,nz=1/length;
  const azimuth=azimuthDeg*Math.PI/180,altitude=altitudeDeg*Math.PI/180;
  const lx=Math.sin(azimuth)*Math.cos(altitude),ly=-Math.cos(azimuth)*Math.cos(altitude),lz=Math.sin(altitude);
  return clamp(nx*lx+ny*ly+nz*lz);
}
function multidirectionalShade(metrics,index){
  let sum=0,max=0,used=0;
  for(let azimuth=0;azimuth<360;azimuth+=45){
    const value=hillshade(metrics,index,azimuth,42);if(!finite(value))continue;
    sum+=value;max=Math.max(max,value);used++;
  }
  return used?clamp((sum/used)*.42+max*.58):NaN;
}
function setPixel(pixels,index,r,g,b,a=205){
  const offset=index*4;pixels[offset]=clamp(Math.round(r),0,255);pixels[offset+1]=clamp(Math.round(g),0,255);pixels[offset+2]=clamp(Math.round(b),0,255);pixels[offset+3]=clamp(Math.round(a),0,255);
}
function divergingPixel(pixels,index,value,scale,negative=[35,120,235],positive=[235,85,45],alpha=190){
  const t=clamp(Math.abs(value)/Math.max(1e-9,scale));
  const target=value>=0?positive:negative;
  setPixel(pixels,index,245+(target[0]-245)*t,245+(target[1]-245)*t,245+(target[2]-245)*t,alpha*(.30+.70*t));
}
function makeRaster(grid,pixels){
  let canvas=null;
  try{
    canvas=typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(grid.cols,grid.rows):global.document?.createElement?.("canvas");
    if(canvas){
      canvas.width=grid.cols;canvas.height=grid.rows;
      const context=canvas.getContext("2d");
      const image=context.createImageData(grid.cols,grid.rows);image.data.set(pixels);context.putImageData(image,0,0);
    }
  }catch(_error){canvas=null;}
  const first=grid.points[0],last=grid.points[grid.points.length-1];
  return {canvas,pixels,left:first?.sx??8,top:first?.sy??8,right:last?.sx??Math.max(9,grid.width-8),bottom:last?.sy??Math.max(9,grid.height-8)};
}
async function flowAccumulation(grid,z,isCancelled,onProgress){
  const downstream=new Int32Array(z.length);downstream.fill(-1);
  const accumulation=new Float64Array(z.length);
  const order=[];
  const spacing=cellSpacing(grid);
  for(let row=0;row<grid.rows;row++)for(let col=0;col<grid.cols;col++){
    const index=row*grid.cols+col;if(!finite(z[index]))continue;
    accumulation[index]=1;order.push(index);
    let best=-1,bestDrop=0;
    for(const [dr,dc] of DIRECTIONS){
      const rr=row+dr,cc=col+dc;if(rr<0||rr>=grid.rows||cc<0||cc>=grid.cols)continue;
      const next=rr*grid.cols+cc;if(!finite(z[next]))continue;
      const drop=(z[index]-z[next])/(spacing*Math.hypot(dr,dc));
      if(drop>bestDrop){bestDrop=drop;best=next;}
    }
    downstream[index]=best;
  }
  order.sort((a,b)=>z[b]-z[a]);
  for(let position=0;position<order.length;position++){
    if(isCancelled())return null;
    const index=order[position],next=downstream[index];if(next>=0)accumulation[next]+=accumulation[index];
    if(position%5000===0){onProgress(position/Math.max(1,order.length),"集水量を計算中…");await sleep();}
  }
  return {accumulation,downstream};
}
async function viewshed(grid,z,isCancelled,onProgress){
  const result=new Uint8Array(z.length),observerRow=Math.floor(grid.rows/2),observerCol=Math.floor(grid.cols/2),observerIndex=observerRow*grid.cols+observerCol;
  if(!finite(z[observerIndex]))return {values:result,observerIndex};
  const observerElevation=z[observerIndex]+1.5,spacing=cellSpacing(grid);
  for(let row=0;row<grid.rows;row++){
    if(isCancelled())return null;
    for(let col=0;col<grid.cols;col++){
      const index=row*grid.cols+col;if(!finite(z[index]))continue;
      const dr=row-observerRow,dc=col-observerCol,steps=Math.max(Math.abs(dr),Math.abs(dc));
      if(!steps){result[index]=1;continue;}
      const targetDistance=spacing*Math.hypot(dr,dc),targetAngle=(z[index]-observerElevation)/Math.max(.001,targetDistance);
      let blocked=false;
      for(let step=1;step<steps;step++){
        const rr=Math.round(observerRow+dr*step/steps),cc=Math.round(observerCol+dc*step/steps),sample=rr*grid.cols+cc;
        if(!finite(z[sample]))continue;
        const distance=spacing*Math.hypot(rr-observerRow,cc-observerCol);
        if((z[sample]-observerElevation)/Math.max(.001,distance)>targetAngle+.002){blocked=true;break;}
      }
      result[index]=blocked?2:1;
    }
    if(row%8===0){onProgress(row/grid.rows,"見通しを計算中…");await sleep();}
  }
  return {values:result,observerIndex};
}
function connectedInundation(grid,z,threshold){
  const flooded=new Uint8Array(z.length),queue=new Int32Array(z.length);let head=0,tail=0;
  const add=index=>{if(index<0||index>=z.length||flooded[index]||!finite(z[index])||z[index]>threshold)return;flooded[index]=1;queue[tail++]=index;};
  for(let col=0;col<grid.cols;col++){add(col);add((grid.rows-1)*grid.cols+col);}
  for(let row=1;row<grid.rows-1;row++){add(row*grid.cols);add(row*grid.cols+grid.cols-1);}
  while(head<tail){
    const index=queue[head++],row=Math.floor(index/grid.cols),col=index%grid.cols;
    for(const [dr,dc] of DIRECTIONS){const rr=row+dr,cc=col+dc;if(rr>=0&&rr<grid.rows&&cc>=0&&cc<grid.cols)add(rr*grid.cols+cc);}
  }
  return flooded;
}
function renderForMode(mode,grid,z,metrics,neighborhood,extra,options){
  const pixels=new Uint8ClampedArray(z.length*4),relief=neighborhood?.relief,roughness=neighborhood?.roughness;
  const reliefScale=relief?robustAbsScale(relief,.15):1,curvatureScale=robustAbsScale(metrics.curvature,.002),opennessScale=extra?.openness?robustAbsScale(extra.openness,1):1;
  if(mode==="multihillshade"){
    for(let i=0;i<z.length;i++){const shade=multidirectionalShade(metrics,i);if(finite(shade)){const value=25+shade*225;setPixel(pixels,i,value,value,value,220);}}
  }else if(mode==="localrelief"){
    for(let i=0;i<z.length;i++)if(finite(relief[i]))divergingPixel(pixels,i,relief[i],reliefScale,[35,110,230],[235,75,40],205);
  }else if(mode==="openness"){
    for(let i=0;i<z.length;i++)if(finite(extra.openness[i]))divergingPixel(pixels,i,extra.openness[i],opennessScale,[35,115,225],[238,145,35],205);
  }else if(mode==="curvature"){
    for(let i=0;i<z.length;i++)if(finite(metrics.curvature[i]))divergingPixel(pixels,i,metrics.curvature[i],curvatureScale,[35,125,235],[238,72,48],200);
  }else if(mode==="microterrain"){
    for(let i=0;i<z.length;i++){
      const shade=multidirectionalShade(metrics,i);if(!finite(shade)||!finite(relief[i]))continue;
      const signed=clamp(relief[i]/reliefScale,-1,1),base=35+shade*190;
      const red=base+(signed>0?55*signed:0),blue=base+(signed<0?-60*signed:0),green=base-Math.abs(signed)*25;
      setPixel(pixels,i,red,green,blue,225);
    }
  }else if(mode==="accumulation"){
    let max=1;for(const value of extra.flow.accumulation)if(value>max)max=value;
    const logMax=Math.log1p(max);
    for(let i=0;i<z.length;i++)if(finite(z[i])){
      const t=Math.log1p(extra.flow.accumulation[i])/logMax;
      if(t>.18)setPixel(pixels,i,15,125+80*t,255,clamp((t-.12)*280,35,220));
    }
  }else if(mode==="ridgevalley"){
    for(let i=0;i<z.length;i++)if(finite(relief[i])&&finite(metrics.curvature[i])){
      const value=clamp(relief[i]/reliefScale*.68+metrics.curvature[i]/curvatureScale*.32,-1,1);
      divergingPixel(pixels,i,value,1,[25,120,240],[240,70,42],210);
    }
  }else if(mode==="flatland"){
    const roughScale=Math.max(.15,robustAbsScale(roughness,.2,.85));
    for(let i=0;i<z.length;i++)if(finite(metrics.slope[i])&&finite(roughness[i])){
      const score=clamp(1-metrics.slope[i]/8)*clamp(1-roughness[i]/roughScale);
      if(score>.18)setPixel(pixels,i,45,205,105,35+score*175);
    }
  }else if(mode==="artificial"){
    const roughScale=Math.max(.12,robustAbsScale(roughness,.2,.85));
    for(let row=1;row<grid.rows-1;row++)for(let col=1;col<grid.cols-1;col++){
      const i=row*grid.cols+col;if(!finite(metrics.slope[i])||!finite(roughness[i]))continue;
      const flat=clamp(1-metrics.slope[i]/12)*clamp(1-roughness[i]/roughScale);
      let edge=0;
      for(const [dr,dc] of DIRECTIONS){const q=(row+dr)*grid.cols+col+dc;if(finite(metrics.curvature[q]))edge=Math.max(edge,Math.abs(metrics.curvature[q])/curvatureScale);}
      const score=flat*clamp(edge);
      if(score>.16)setPixel(pixels,i,235,65,190,45+score*190);
    }
  }else if(mode==="viewshed"){
    for(let i=0;i<z.length;i++)if(extra.viewshed.values[i]===1)setPixel(pixels,i,45,205,105,110);else if(extra.viewshed.values[i]===2)setPixel(pixels,i,225,75,60,90);
  }else if(mode==="inundation"){
    for(let i=0;i<z.length;i++)if(extra.flooded[i])setPixel(pixels,i,20,125,245,175);
  }
  return makeRaster(grid,pixels);
}

async function prepare(mode,grid,options={}){
  if(!ADVANCED_MODES.has(mode)||!grid)return null;
  const isCancelled=typeof options.isCancelled==="function"?options.isCancelled:()=>false;
  const onProgress=typeof options.onProgress==="function"?options.onProgress:()=>{};
  const z=elevations(grid),metrics=gradientMetrics(grid,z),spacing=cellSpacing(grid);
  const localRadius=clamp(Math.round(20/Math.max(.25,spacing)),2,18);
  let neighborhood=null,extra={};
  if(["localrelief","microterrain","ridgevalley","flatland","artificial"].includes(mode)){
    const radius=["flatland","artificial"].includes(mode)?clamp(Math.round(3/Math.max(.25,spacing)),1,5):localRadius;
    onProgress(.12,"局所地形を計算中…");neighborhood=neighborhoodMetrics(grid,z,radius);await sleep();
  }
  if(mode==="openness"){
    const radius=clamp(Math.round(30/Math.max(.25,spacing)),3,18);
    extra.openness=await opennessMetric(grid,z,radius,isCancelled,onProgress);if(!extra.openness)return null;
  }
  if(mode==="accumulation"){
    extra.flow=await flowAccumulation(grid,z,isCancelled,onProgress);if(!extra.flow)return null;
  }
  if(mode==="viewshed"){
    extra.viewshed=await viewshed(grid,z,isCancelled,onProgress);if(!extra.viewshed)return null;
  }
  let threshold=null;
  if(mode==="inundation"){
    let min=Infinity,max=-Infinity;for(const value of z)if(finite(value)){min=Math.min(min,value);max=Math.max(max,value);}
    const fraction=clamp(Number(options.inundationFraction)||.2,.01,.99);
    threshold=min+(max-min)*fraction;extra.flooded=connectedInundation(grid,z,threshold);
  }
  if(isCancelled())return null;
  onProgress(.92,"表示を作成中…");
  const raster=renderForMode(mode,grid,z,metrics,neighborhood,extra,options);
  await sleep();
  return {mode,raster,threshold,observerIndex:extra.viewshed?.observerIndex??null,createdAt:Date.now()};
}
function draw(context,grid,result,staleViewport=false){
  if(!context||!grid||!result?.raster||staleViewport)return;
  const raster=result.raster;
  if(raster.canvas){
    context.imageSmoothingEnabled=true;
    context.drawImage(raster.canvas,raster.left,raster.top,Math.max(1,raster.right-raster.left),Math.max(1,raster.bottom-raster.top));
  }
  if(result.mode==="viewshed"&&Number.isInteger(result.observerIndex)){
    const point=grid.points[result.observerIndex];
    if(point&&finite(point.sx)&&finite(point.sy)){
      context.beginPath();context.arc(point.sx,point.sy,6,0,Math.PI*2);context.fillStyle="#ffe04d";context.fill();context.lineWidth=2;context.strokeStyle="#111";context.stroke();
    }
  }
}
function legend(mode,result){
  const legends={
    multihillshade:'<span class="terrainGradient terrainGray"></span> 多方向から照らした立体表現',
    localrelief:'<span class="terrainGradient terrainBlueRed"></span> 青：周囲より低い　赤：周囲より高い',
    openness:'<span class="terrainGradient terrainBlueOrange"></span> 青：谷・窪地　橙：尾根・盛土',
    curvature:'<span class="terrainGradient terrainBlueRed"></span> 青：凹地形　赤：凸地形',
    microterrain:'<span class="terrainGradient terrainMicro"></span> 陰影＋局所起伏を合成',
    accumulation:'<span class="terrainSwatch" style="background:#158cff"></span> 濃い青ほど水が集まりやすい',
    ridgevalley:'<span class="terrainGradient terrainBlueRed"></span> 青：谷　赤：尾根',
    flatland:'<span class="terrainSwatch" style="background:#2dcd69"></span> 緑：平坦面候補',
    artificial:'<span class="terrainSwatch" style="background:#eb41be"></span> 紫：人工的な平場・段差の候補',
    viewshed:'<span class="terrainSwatch" style="background:#2dcd69"></span>見える <span class="terrainSwatch" style="background:#e14b3c"></span>隠れる　黄点：画面中央の視点（高さ1.5m）',
    inundation:`<span class="terrainSwatch" style="background:#147df5"></span> 外周から連続する標高 ${finite(result?.threshold)?result.threshold.toFixed(1):"－"}m 以下`
  };
  return legends[mode]||"";
}

global.EzTerrainAdvanced={modes:ADVANCED_MODES,prepare,draw,legend};
})(typeof window!=="undefined"?window:globalThis);
