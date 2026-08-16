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
function paintNeutralBase(pixels,z,metrics,withShade=false){
  for(let index=0;index<z.length;index++){
    if(!finite(z[index])){
      // NoDataを透明にすると黒背景が穴として見える。解析値ではなく中立色で示す。
      setPixel(pixels,index,205,205,205,238);
      continue;
    }
    if(withShade){
      const shade=multidirectionalShade(metrics,index);
      const value=finite(shade)?55+shade*190:220;
      setPixel(pixels,index,value,value,value,244);
    }else setPixel(pixels,index,242,242,242,238);
  }
}
function thinBinary(input,rows,cols,maxPasses=20){
  const data=new Uint8Array(input),remove=new Uint8Array(input.length);
  const transitions=neighbors=>{
    let count=0;
    for(let index=0;index<neighbors.length;index++)if(!neighbors[index]&&neighbors[(index+1)%neighbors.length])count++;
    return count;
  };
  for(let pass=0;pass<maxPasses;pass++){
    let changed=false;
    for(let phase=0;phase<2;phase++){
      remove.fill(0);
      for(let row=1;row<rows-1;row++)for(let col=1;col<cols-1;col++){
        const index=row*cols+col;if(!data[index])continue;
        const p2=data[index-cols],p3=data[index-cols+1],p4=data[index+1],p5=data[index+cols+1];
        const p6=data[index+cols],p7=data[index+cols-1],p8=data[index-1],p9=data[index-cols-1];
        const neighbors=[p2,p3,p4,p5,p6,p7,p8,p9],sum=neighbors.reduce((total,value)=>total+value,0);
        if(sum<2||sum>6||transitions(neighbors)!==1)continue;
        const first=phase===0?p2*p4*p6:p2*p4*p8;
        const second=phase===0?p4*p6*p8:p2*p6*p8;
        if(first===0&&second===0)remove[index]=1;
      }
      for(let index=0;index<data.length;index++)if(remove[index]){data[index]=0;changed=true;}
    }
    if(!changed)break;
  }
  return data;
}
function removeShortComponents(mask,rows,cols,minCells){
  const result=new Uint8Array(mask),visited=new Uint8Array(mask.length),queue=new Int32Array(mask.length);
  for(let start=0;start<mask.length;start++){
    if(!mask[start]||visited[start])continue;
    let head=0,tail=0;queue[tail++]=start;visited[start]=1;
    while(head<tail){
      const index=queue[head++],row=Math.floor(index/cols),col=index%cols;
      for(const [dr,dc] of DIRECTIONS){
        const rr=row+dr,cc=col+dc;if(rr<0||rr>=rows||cc<0||cc>=cols)continue;
        const next=rr*cols+cc;if(mask[next]&&!visited[next]){visited[next]=1;queue[tail++]=next;}
      }
    }
    if(tail<minCells)for(let position=0;position<tail;position++)result[queue[position]]=0;
  }
  return result;
}
function artificialLineMask(grid,z,metrics,neighborhood){
  const spacing=Math.max(.25,cellSpacing(grid)),raw=new Uint8Array(z.length);
  const relief=neighborhood?.relief;
  for(let row=1;row<grid.rows-1;row++)for(let col=1;col<grid.cols-1;col++){
    const index=row*grid.cols+col;
    if(!finite(z[index])||!finite(metrics.curvature[index])||!finite(metrics.slope[index])||!finite(relief?.[index]))continue;
    let slopeJump=0;
    for(const [dr,dc] of DIRECTIONS){
      const next=(row+dr)*grid.cols+col+dc;
      if(finite(metrics.slope[next]))slopeJump=Math.max(slopeJump,Math.abs(metrics.slope[index]-metrics.slope[next]));
    }
    // 0.3 m級の標高ノイズだけでは線にならない固定しきい値を使用する。
    // 画面ごとの自動伸張は行わず、段差・法肩・旧道などの連続した変化だけを残す。
    const curvatureHeight=Math.abs(metrics.curvature[index])*spacing*spacing;
    const localHeight=Math.abs(relief[index]);
    const score=.46*clamp(curvatureHeight/.18)+.34*clamp(slopeJump/12)+.20*clamp(localHeight/.45);
    if(score>=.70&&(curvatureHeight>=.08||slopeJump>=7)&&localHeight>=.12)raw[index]=1;
  }
  const thinned=thinBinary(raw,grid.rows,grid.cols);
  return removeShortComponents(thinned,grid.rows,grid.cols,Math.max(4,Math.round(6/spacing)));
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
  const spacing=Math.max(.25,cellSpacing(grid));
  // DEM1Aの標高精度以下の揺らぎを色域いっぱいに拡大しない。
  const reliefScale=relief?robustAbsScale(relief,.75):1;
  const curvatureScale=robustAbsScale(metrics.curvature,.03/Math.max(1,spacing));
  const opennessScale=extra?.openness?robustAbsScale(extra.openness,4):1;
  if(mode==="multihillshade"){
    paintNeutralBase(pixels,z,metrics,true);
  }else if(mode==="localrelief"){
    paintNeutralBase(pixels,z,metrics,false);
    for(let i=0;i<z.length;i++)if(finite(relief[i]))divergingPixel(pixels,i,relief[i],reliefScale,[35,110,230],[235,75,40],242);
  }else if(mode==="openness"){
    paintNeutralBase(pixels,z,metrics,false);
    for(let i=0;i<z.length;i++)if(finite(extra.openness[i]))divergingPixel(pixels,i,extra.openness[i],opennessScale,[35,115,225],[238,145,35],242);
  }else if(mode==="curvature"){
    paintNeutralBase(pixels,z,metrics,false);
    for(let i=0;i<z.length;i++)if(finite(metrics.curvature[i]))divergingPixel(pixels,i,metrics.curvature[i],curvatureScale,[35,125,235],[238,72,48],242);
  }else if(mode==="microterrain"){
    paintNeutralBase(pixels,z,metrics,true);
    for(let i=0;i<z.length;i++){
      const shade=multidirectionalShade(metrics,i);if(!finite(shade)||!finite(relief[i]))continue;
      const signed=clamp(relief[i]/reliefScale,-1,1),base=35+shade*190;
      const red=base+(signed>0?55*signed:0),blue=base+(signed<0?-60*signed:0),green=base-Math.abs(signed)*25;
      setPixel(pixels,i,red,green,blue,244);
    }
  }else if(mode==="accumulation"){
    paintNeutralBase(pixels,z,metrics,true);
    let max=1;for(const value of extra.flow.accumulation)if(value>max)max=value;
    const logMax=Math.log1p(max);
    for(let i=0;i<z.length;i++)if(finite(z[i])){
      const t=Math.log1p(extra.flow.accumulation[i])/logMax;
      if(t>.18)setPixel(pixels,i,15,125+80*t,255,clamp((t-.12)*280,35,220));
    }
  }else if(mode==="ridgevalley"){
    paintNeutralBase(pixels,z,metrics,false);
    for(let i=0;i<z.length;i++)if(finite(relief[i])&&finite(metrics.curvature[i])){
      const value=clamp(relief[i]/reliefScale*.68+metrics.curvature[i]/curvatureScale*.32,-1,1);
      divergingPixel(pixels,i,value,1,[25,120,240],[240,70,42],210);
    }
  }else if(mode==="flatland"){
    paintNeutralBase(pixels,z,metrics,true);
    const roughScale=Math.max(.15,robustAbsScale(roughness,.2,.85));
    for(let i=0;i<z.length;i++)if(finite(metrics.slope[i])&&finite(roughness[i])){
      const score=clamp(1-metrics.slope[i]/8)*clamp(1-roughness[i]/roughScale);
      if(score>.18)setPixel(pixels,i,45,205,105,35+score*175);
    }
  }else if(mode==="artificial"){
    paintNeutralBase(pixels,z,metrics,true);
    const lineMask=extra.artificialLines||artificialLineMask(grid,z,metrics,neighborhood);
    for(let i=0;i<lineMask.length;i++)if(lineMask[i])setPixel(pixels,i,245,28,35,255);
  }else if(mode==="viewshed"){
    paintNeutralBase(pixels,z,metrics,true);
    for(let i=0;i<z.length;i++)if(extra.viewshed.values[i]===1)setPixel(pixels,i,45,205,105,110);else if(extra.viewshed.values[i]===2)setPixel(pixels,i,225,75,60,90);
  }else if(mode==="inundation"){
    paintNeutralBase(pixels,z,metrics,true);
    for(let i=0;i<z.length;i++)if(extra.flooded[i])setPixel(pixels,i,20,125,245,175);
  }
  return makeRaster(grid,pixels);
}

async function prepare(mode,grid,options={}){
  if(!ADVANCED_MODES.has(mode)||!grid)return null;
  const isCancelled=typeof options.isCancelled==="function"?options.isCancelled:()=>false;
  const onProgress=typeof options.onProgress==="function"?options.onProgress:()=>{};
  const z=elevations(grid),metrics=gradientMetrics(grid,z),spacing=cellSpacing(grid);
  const localRadius=clamp(Math.round(20/Math.max(.25,spacing)),2,24);
  let neighborhood=null,extra={};
  if(["localrelief","microterrain","ridgevalley","flatland","artificial"].includes(mode)){
    const radius=mode==="artificial"?clamp(Math.round(6/Math.max(.25,spacing)),2,10):mode==="flatland"?clamp(Math.round(3/Math.max(.25,spacing)),1,5):localRadius;
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
  let candidateCount=0;
  if(mode==="artificial")for(let index=0;index<raster.pixels.length;index+=4)if(raster.pixels[index]>240&&raster.pixels[index+1]<50)candidateCount++;
  return {mode,raster,threshold,observerIndex:extra.viewshed?.observerIndex??null,spacing,candidateCount,createdAt:Date.now()};
}
function draw(context,grid,result,staleViewport=false,toScreen=null){
  if(!context||!grid||!result?.raster||staleViewport)return;
  const raster=result.raster;
  if(raster.canvas){
    context.imageSmoothingEnabled=true;
    const aligned=grid.advancedTerrainGrid;
    if(aligned&&typeof toScreen==="function"&&grid.cols>1&&grid.rows>1){
      const topLeft=toScreen(grid.points[0].worldX,grid.points[0].worldY);
      const topRight=toScreen(grid.points[grid.cols-1].worldX,grid.points[grid.cols-1].worldY);
      const bottomLeft=toScreen(grid.points[(grid.rows-1)*grid.cols].worldX,grid.points[(grid.rows-1)*grid.cols].worldY);
      const a=(topRight[0]-topLeft[0])/(grid.cols-1),b=(topRight[1]-topLeft[1])/(grid.cols-1);
      const c=(bottomLeft[0]-topLeft[0])/(grid.rows-1),d=(bottomLeft[1]-topLeft[1])/(grid.rows-1);
      context.save();context.transform(a,b,c,d,topLeft[0]-(a+c)*.5,topLeft[1]-(b+d)*.5);
      context.drawImage(raster.canvas,0,0,grid.cols,grid.rows);context.restore();
    }else context.drawImage(raster.canvas,raster.left,raster.top,Math.max(1,raster.right-raster.left),Math.max(1,raster.bottom-raster.top));
  }
  if(result.mode==="viewshed"&&Number.isInteger(result.observerIndex)){
    const point=grid.points[result.observerIndex],screen=point&&(finite(point.sx)&&finite(point.sy)?[point.sx,point.sy]:typeof toScreen==="function"?toScreen(point.worldX,point.worldY):null);
    if(screen){
      context.beginPath();context.arc(screen[0],screen[1],6,0,Math.PI*2);context.fillStyle="#ffe04d";context.fill();context.lineWidth=2;context.strokeStyle="#111";context.stroke();
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
    artificial:'<span class="terrainSwatch" style="background:#f51c23"></span> 赤線：連続する段差・法肩・旧道などの候補（現地確認が必要）',
    viewshed:'<span class="terrainSwatch" style="background:#2dcd69"></span>見える <span class="terrainSwatch" style="background:#e14b3c"></span>隠れる　黄点：画面中央の視点（高さ1.5m）',
    inundation:`<span class="terrainSwatch" style="background:#147df5"></span> 外周から連続する標高 ${finite(result?.threshold)?result.threshold.toFixed(1):"－"}m 以下`
  };
  return legends[mode]||"";
}

global.EzTerrainAdvanced={modes:ADVANCED_MODES,prepare,draw,legend};
})(typeof window!=="undefined"?window:globalThis);
