(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.FoundationMapGml=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const FEATURE_SPECS=Object.freeze({
    AdmBdry:{kind:"admin",label:"行政界"},
    CommBdry:{kind:"community",label:"町字界"},
    SBBdry:{kind:"block",label:"街区線"},
    Cstline:{kind:"water",label:"海岸線"},
    WL:{kind:"water",label:"水涯線"},
    WStrL:{kind:"water",label:"水部構造物線"},
    RvrMgtBdry:{kind:"water",label:"河川区域界線"},
    LeveeEdge:{kind:"water",label:"河川堤防表肩法線"},
    BldL:{kind:"building",label:"建物外周線"},
    RdEdg:{kind:"road",label:"道路縁"},
    RdCompt:{kind:"road",label:"道路構成線"},
    RdASL:{kind:"road",label:"道路域分割線"},
    RdMgtBdry:{kind:"road",label:"道路区域界線"},
    RailCL:{kind:"rail",label:"軌道中心線"}
  });
  const FEATURE_NAMES=Object.keys(FEATURE_SPECS).join("|");
  const FEATURE_RE=new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?(${FEATURE_NAMES})\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?\\1\\s*>`,
    "g"
  );

  function tagText(source,localName){
    const re=new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${localName}\\s*>`,"i");
    const match=re.exec(String(source||""));
    return match?String(match[1]||"").replace(/<[^>]*>/g,"").trim():"";
  }
  function featureId(source){
    return tagText(source,"fid")||"";
  }
  function sourceLevel(source){
    const text=tagText(source,"orgGILvl");
    const match=String(text).match(/-?\d+(?:\.\d+)?/);
    return match?Number(match[0]):NaN;
  }
  function visibilityIsHidden(source){
    return tagText(source,"vis").normalize("NFKC").replace(/\s+/g,"")==="非表示";
  }
  function numberList(text){
    return String(text||"").trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  }
  function coordinatePairs(values,dimension){
    const dim=Number.isInteger(dimension)&&dimension>=2?dimension:2;
    const pairs=[];
    for(let index=0;index+1<values.length;index+=dim){
      const first=values[index],second=values[index+1];
      if(!Number.isFinite(first)||!Number.isFinite(second))continue;
      // Current Fundamental Geospatial Data is JGD2024/(B,L): latitude first.
      // Keep support for conventional lon/lat XML without guessing from scale.
      const lat=Math.abs(first)<=90&&Math.abs(second)<=180?first:second;
      const lon=Math.abs(first)<=90&&Math.abs(second)<=180?second:first;
      if(Math.abs(lat)<=90&&Math.abs(lon)<=180)pairs.push({lat,lon});
    }
    return pairs;
  }
  function geometrySequences(source){
    const sequences=[];
    const posListRe=/<(?:[A-Za-z_][\w.-]*:)?posList\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?posList\s*>/gi;
    let match;
    while((match=posListRe.exec(String(source||"")))!==null){
      const dimensionMatch=String(match[1]||"").match(/(?:srsDimension|dimension)\s*=\s*["'](\d+)["']/i);
      const points=coordinatePairs(numberList(String(match[2]||"").replace(/<[^>]*>/g," ")),dimensionMatch?Number(dimensionMatch[1]):2);
      if(points.length>=2)sequences.push(points);
    }
    if(sequences.length)return sequences;
    const positions=[];
    const posRe=/<(?:[A-Za-z_][\w.-]*:)?pos\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?pos\s*>/gi;
    while((match=posRe.exec(String(source||"")))!==null){
      const dimensionMatch=String(match[1]||"").match(/(?:srsDimension|dimension)\s*=\s*["'](\d+)["']/i);
      const points=coordinatePairs(numberList(String(match[2]||"").replace(/<[^>]*>/g," ")),dimensionMatch?Number(dimensionMatch[1]):2);
      if(points.length)positions.push(points[0]);
    }
    if(positions.length>=2)sequences.push(positions);
    return sequences;
  }

  function normalizePlane(point){
    if(!point)return null;
    const x=Number(point.xNorth!=null?point.xNorth:point.x);
    const y=Number(point.yEast!=null?point.yEast:point.y);
    return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
  }
  function clipSegment(a,b,bounds){
    if(!bounds)return {a,b};
    const dx=b.x-a.x,dy=b.y-a.y;
    let t0=0,t1=1;
    const tests=[[-dx,a.x-bounds.minX],[dx,bounds.maxX-a.x],[-dy,a.y-bounds.minY],[dy,bounds.maxY-a.y]];
    for(const [p,q] of tests){
      if(Math.abs(p)<1e-14){if(q<0)return null;continue;}
      const r=q/p;
      if(p<0){if(r>t1)return null;if(r>t0)t0=r;}
      else{if(r<t0)return null;if(r<t1)t1=r;}
    }
    return {
      a:{x:a.x+dx*t0,y:a.y+dy*t0},
      b:{x:a.x+dx*t1,y:a.y+dy*t1}
    };
  }
  function samePoint(a,b){
    return !!(a&&b&&Math.abs(a.x-b.x)<=1e-7&&Math.abs(a.y-b.y)<=1e-7);
  }
  function clipSequence(sequence,bounds,toPlane){
    const plane=sequence.map(point=>normalizePlane(toPlane(point.lat,point.lon))).filter(Boolean);
    if(plane.length<2)return [];
    const runs=[];
    let current=[];
    for(let index=1;index<plane.length;index++){
      const clipped=clipSegment(plane[index-1],plane[index],bounds);
      if(!clipped){if(current.length>=2)runs.push(current);current=[];continue;}
      if(!current.length)current=[clipped.a,clipped.b];
      else if(samePoint(current[current.length-1],clipped.a))current.push(clipped.b);
      else{if(current.length>=2)runs.push(current);current=[clipped.a,clipped.b];}
    }
    if(current.length>=2)runs.push(current);
    return runs;
  }

  function parseGmlText(xmlText,options={}){
    const source=String(xmlText||"");
    const maxSourceLevel=Number.isFinite(Number(options.maxSourceLevel))?Number(options.maxSourceLevel):2500;
    const bounds=options.bounds||null;
    const toPlane=typeof options.toPlane==="function"?options.toPlane:((lat,lon)=>({x:lat,y:lon}));
    const toWorld=typeof options.toWorld==="function"?options.toWorld:((x,y)=>({x,y}));
    const seen=options.seenFeatureIds instanceof Set?options.seenFeatureIds:new Set();
    const maxPaths=Math.max(1,Number(options.maxPaths)||120000);
    const strokes=[];
    const stats={features:0,acceptedFeatures:0,paths:0,skippedCoarse:0,skippedUnknownLevel:0,skippedHidden:0,skippedDuplicate:0};
    FEATURE_RE.lastIndex=0;
    let match;
    while((match=FEATURE_RE.exec(source))!==null){
      stats.features++;
      const type=match[1],body=match[2],id=featureId(body);
      if(id&&seen.has(id)){stats.skippedDuplicate++;continue;}
      if(id)seen.add(id);
      if(visibilityIsHidden(body)){stats.skippedHidden++;continue;}
      const level=sourceLevel(body);
      if(!Number.isFinite(level)){stats.skippedUnknownLevel++;continue;}
      if(level<0||level>maxSourceLevel){stats.skippedCoarse++;continue;}
      let accepted=false;
      for(const sequence of geometrySequences(body)){
        for(const run of clipSequence(sequence,bounds,toPlane)){
          const points=run.map(point=>toWorld(point.x,point.y)).map(point=>({x:Number(point&&point.x),y:Number(point&&point.y)})).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));
          if(points.length<2)continue;
          strokes.push({type,kind:FEATURE_SPECS[type].kind,label:FEATURE_SPECS[type].label,sourceLevel:level,sourceId:id,points});
          stats.paths++;accepted=true;
          if(strokes.length>maxPaths)throw new Error("基盤地図の線が多すぎます。表示範囲を狭くしてください");
        }
      }
      if(accepted)stats.acceptedFeatures++;
    }
    return {strokes,stats,seenFeatureIds:seen};
  }

  function secondMeshCodeFromIndices(row,col){
    const firstLat=Math.floor(row/8),firstLon=Math.floor(col/8);
    const secondLat=((row%8)+8)%8,secondLon=((col%8)+8)%8;
    return `${String(firstLat).padStart(2,"0")}${String(firstLon).padStart(2,"0")}${secondLat}${secondLon}`;
  }
  function secondMeshCode(lat,lon){
    const row=Math.floor(Number(lat)*12);
    const col=Math.floor((Number(lon)-100)*8);
    return secondMeshCodeFromIndices(row,col);
  }
  function meshCodesForBounds(bounds){
    if(!bounds)return [];
    const minLat=Math.min(Number(bounds.minLat),Number(bounds.maxLat));
    const maxLat=Math.max(Number(bounds.minLat),Number(bounds.maxLat));
    const minLon=Math.min(Number(bounds.minLon),Number(bounds.maxLon));
    const maxLon=Math.max(Number(bounds.minLon),Number(bounds.maxLon));
    if(![minLat,maxLat,minLon,maxLon].every(Number.isFinite))return [];
    const startRow=Math.floor(minLat*12),endRow=Math.floor((maxLat-1e-12)*12);
    const startCol=Math.floor((minLon-100)*8),endCol=Math.floor(((maxLon-1e-12)-100)*8);
    const codes=[];
    for(let row=startRow;row<=endRow;row++)for(let col=startCol;col<=endCol;col++)codes.push(secondMeshCodeFromIndices(row,col));
    return [...new Set(codes)];
  }

  return {FEATURE_SPECS,parseGmlText,secondMeshCode,meshCodesForBounds,clipSegment};
});
