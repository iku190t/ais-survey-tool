(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.EzSimaImport=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  function parseCsvLine(line){
    const fields=[];
    let value="",quoted=false;
    for(let i=0;i<String(line||"").length;i++){
      const ch=line[i];
      if(quoted){
        if(ch==='"'&&line[i+1]==='"'){value+='"';i++;}
        else if(ch==='"')quoted=false;
        else value+=ch;
      }else if(ch==='"')quoted=true;
      else if(ch===','){fields.push(value.trim());value="";}
      else value+=ch;
    }
    fields.push(value.trim());
    return fields;
  }

  function parse(text){
    const pointsById=new Map(),pointsByName=new Map(),parcels=[],warnings=[];
    let currentParcel=null,lineNumber=0;
    const finishParcel=()=>{
      if(!currentParcel)return;
      const resolved=[];
      for(const ref of currentParcel.refs){
        const point=pointsById.get(ref.id)||pointsByName.get(ref.name);
        if(point)resolved.push(point);
        else warnings.push(`${currentParcel.name||currentParcel.id}: 構成点 ${ref.id||ref.name} が見つかりません`);
      }
      if(resolved.length>=2)parcels.push({...currentParcel,points:resolved});
      else warnings.push(`${currentParcel.name||currentParcel.id||"画地"}: 構成点が不足しています`);
      currentParcel=null;
    };
    const lines=String(text||"").replace(/^\uFEFF/,"").replace(/\0/g,"").split(/\r?\n/);
    for(const rawLine of lines){
      lineNumber++;
      const fields=parseCsvLine(rawLine);
      const kind=String(fields[0]||"").trim().toUpperCase();
      if(!kind||kind.startsWith("/*")||kind==="Z00"||kind==="Z01")continue;
      if(kind==="A01"){
        const id=String(fields[1]||"").trim();
        const name=String(fields[2]||id).trim();
        const xText=String(fields[3]||"").trim(),yText=String(fields[4]||"").trim(),zText=String(fields[5]||"").trim();
        const xNorth=Number(xText),yEast=Number(yText),z=zText===""?NaN:Number(zText);
        if(!id||!xText||!yText||!Number.isFinite(xNorth)||!Number.isFinite(yEast)){
          warnings.push(`${lineNumber}行目: 座標点を読み飛ばしました`);
          continue;
        }
        const point={id,name,xNorth,yEast,z:Number.isFinite(z)?z:null};
        pointsById.set(id,point);
        if(name)pointsByName.set(name,point);
      }else if(kind==="D00"){
        finishParcel();
        currentParcel={
          id:String(fields[1]||"").trim(),
          name:String(fields[2]||fields[1]||"").trim(),
          type:String(fields[3]||"1").trim(),
          refs:[]
        };
      }else if(kind==="B01"&&currentParcel){
        currentParcel.refs.push({id:String(fields[1]||"").trim(),name:String(fields[2]||"").trim()});
      }else if(kind==="D99")finishParcel();
    }
    finishParcel();
    const points=[...pointsById.values()];
    if(!points.length)throw new Error("SIMAの座標データ（A01）がありません");
    return {points,parcels,warnings};
  }

  function pointInPolygon(point,ring){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];
      if(((a.y>point.y)!==(b.y>point.y))&&point.x<(b.x-a.x)*(point.y-a.y)/((b.y-a.y)||1e-12)+a.x)inside=!inside;
    }
    return inside;
  }

  function clipEdge(points,inside,intersection){
    const output=[];
    if(!points.length)return output;
    let previous=points[points.length-1],previousInside=inside(previous);
    for(const current of points){
      const currentInside=inside(current);
      if(currentInside){
        if(!previousInside)output.push(intersection(previous,current));
        output.push(current);
      }else if(previousInside)output.push(intersection(previous,current));
      previous=current;previousInside=currentInside;
    }
    return output;
  }

  function clipPolygonToRect(ring,rect){
    let points=(ring||[]).map(point=>({x:Number(point.x),y:Number(point.y)})).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));
    const vertical=(x,a,b)=>({x,y:a.y+(b.y-a.y)*(x-a.x)/((b.x-a.x)||1e-12)});
    const horizontal=(y,a,b)=>({x:a.x+(b.x-a.x)*(y-a.y)/((b.y-a.y)||1e-12),y});
    points=clipEdge(points,p=>p.x>=rect.left,(a,b)=>vertical(rect.left,a,b));
    points=clipEdge(points,p=>p.x<=rect.right,(a,b)=>vertical(rect.right,a,b));
    points=clipEdge(points,p=>p.y>=rect.top,(a,b)=>horizontal(rect.top,a,b));
    points=clipEdge(points,p=>p.y<=rect.bottom,(a,b)=>horizontal(rect.bottom,a,b));
    return points;
  }

  function polygonCentroid(ring){
    let twiceArea=0,cx=0,cy=0;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const cross=ring[j].x*ring[i].y-ring[i].x*ring[j].y;
      twiceArea+=cross;cx+=(ring[j].x+ring[i].x)*cross;cy+=(ring[j].y+ring[i].y)*cross;
    }
    if(Math.abs(twiceArea)<1e-7)return ring.reduce((sum,p)=>({x:sum.x+p.x/ring.length,y:sum.y+p.y/ring.length}),{x:0,y:0});
    return {x:cx/(3*twiceArea),y:cy/(3*twiceArea)};
  }

  function distanceToSegment(point,a,b){
    const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
    const t=length2?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length2)):0;
    return Math.hypot(point.x-(a.x+dx*t),point.y-(a.y+dy*t));
  }

  function visibleLabelPoint(ring,width,height,margin){
    const inset=Math.max(2,Number(margin)||8);
    const clipped=clipPolygonToRect(ring,{left:inset,top:inset,right:Math.max(inset,width-inset),bottom:Math.max(inset,height-inset)});
    if(clipped.length<3)return null;
    const xs=clipped.map(p=>p.x),ys=clipped.map(p=>p.y);
    const bounds={minx:Math.min(...xs),maxx:Math.max(...xs),miny:Math.min(...ys),maxy:Math.max(...ys)};
    const candidates=[polygonCentroid(clipped),{x:(bounds.minx+bounds.maxx)/2,y:(bounds.miny+bounds.maxy)/2}];
    for(let gy=1;gy<=5;gy++)for(let gx=1;gx<=5;gx++)candidates.push({
      x:bounds.minx+(bounds.maxx-bounds.minx)*gx/6,
      y:bounds.miny+(bounds.maxy-bounds.miny)*gy/6
    });
    let best=null,bestDistance=-1;
    for(const candidate of candidates){
      if(!pointInPolygon(candidate,clipped))continue;
      let distance=Infinity;
      for(let i=0,j=clipped.length-1;i<clipped.length;j=i++)distance=Math.min(distance,distanceToSegment(candidate,clipped[j],clipped[i]));
      if(distance>bestDistance){best=candidate;bestDistance=distance;}
    }
    return best||polygonCentroid(clipped);
  }

  return {parse,parseCsvLine,clipPolygonToRect,visibleLabelPoint,pointInPolygon};
});
