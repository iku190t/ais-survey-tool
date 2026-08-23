(function(global){
  "use strict";

  const LAYERS=Object.freeze({
    point:"drogger:point",
    name:"drogger:name",
    elevation:"drogger:elevation"
  });
  const DEFAULT_SETTINGS=Object.freeze({
    antennaHeight:0,
    nameTextSizeMm:2.5,
    elevationTextSizeMm:2.5
  });

  const finite=(value,fallback=null)=>(value===null||value===undefined||value==="")?fallback:Number.isFinite(+value)?+value:fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function normalizeSettings(value){
    const input=value&&typeof value==="object"?value:{};
    return {
      antennaHeight:clamp(finite(input.antennaHeight,DEFAULT_SETTINGS.antennaHeight),-20,100),
      nameTextSizeMm:clamp(finite(input.nameTextSizeMm,DEFAULT_SETTINGS.nameTextSizeMm),1,10),
      elevationTextSizeMm:clamp(finite(input.elevationTextSizeMm,DEFAULT_SETTINGS.elevationTextSizeMm),1,10)
    };
  }
  function correctedElevation(altitude,antennaHeight){
    const a=finite(altitude),h=finite(antennaHeight);
    return a==null||h==null?null:a-h;
  }
  function nextPointName(records){
    const used=new Set((records||[]).map(item=>String(item&&item.name||"").trim()));
    let number=1;
    while(used.has(`P${number}`))number++;
    return `P${number}`;
  }
  function incrementPointName(currentName,records){
    const current=String(currentName||"").trim();
    const match=current.match(/^(.*?)(\d+)$/u);
    if(!match)return nextPointName(records);
    const used=new Set((records||[]).map(item=>String(item&&item.name||"").trim()));
    const prefix=match[1];
    const width=match[2].length;
    let number=Number(match[2])+1;
    let candidate;
    do{candidate=`${prefix}${String(number++).padStart(width,"0")}`;}while(used.has(candidate));
    return candidate;
  }
  function createRecord(gps,settings,name){
    if(!gps||![gps.lat,gps.lon,gps.x,gps.y,gps.sfcX,gps.sfcY].every(Number.isFinite))return null;
    const normalized=normalizeSettings(settings);
    const now=Date.now();
    return {
      id:`DG-${now}-${Math.random().toString(36).slice(2,8)}`,
      name:String(name||"").trim()||"P1",
      lat:+gps.lat,
      lon:+gps.lon,
      zone:finite(gps.zone),
      x:+gps.x,
      y:+gps.y,
      sfcX:+gps.sfcX,
      sfcY:+gps.sfcY,
      antennaAltitude:finite(gps.altitude),
      antennaHeight:normalized.antennaHeight,
      elevation:correctedElevation(gps.altitude,normalized.antennaHeight),
      accuracy:finite(gps.accuracy),
      altitudeAccuracy:finite(gps.altitudeAccuracy),
      sourceTimestamp:finite(gps.timestamp,now),
      registeredAt:now
    };
  }
  function labelPayload(text,x,y,heightMm){
    const value=String(text||"");
    const height=clamp(finite(heightMm,2.5),1,10);
    return {text:value,x,y,heightMm:height,widthMm:Math.max(height,value.length*height*.95),align1:4,align2:0};
  }
  function createRegistrationStrokes(record,worldUnitsPerPaperMm,settings){
    if(!record)return [];
    const units=Math.max(1e-9,finite(worldUnitsPerPaperMm,1));
    const normalized=normalizeSettings(settings);
    const cx=record.sfcX*1000,cy=record.sfcY*1000;
    const radius=.5*units;
    const points=[];
    for(let i=0;i<=48;i++){
      const angle=Math.PI*2*i/48;
      points.push({x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius});
    }
    const base={type:"freehand",color:"#ff3030",opacity:1,eraser:false,screenWidthPx:null,worldWidthMm:.13,width:10,droggerPointId:record.id};
    const textX=cx+1.05*units;
    const nameY=cy+.78*units;
    const elevationY=cy-.78*units;
    return [
      {...base,droggerLayerId:LAYERS.point,droggerRecord:{...record},isCircleMemo:true,paperDiameterMm:1,circleGeometryVersion:2,points},
      {...base,droggerLayerId:LAYERS.name,worldWidthMm:.006,width:1,photoTextLabel:labelPayload(record.name,textX,nameY,normalized.nameTextSizeMm),points:[{x:textX,y:nameY},{x:textX,y:nameY}]},
      {...base,droggerLayerId:LAYERS.elevation,worldWidthMm:.006,width:1,photoTextLabel:labelPayload(record.elevation==null?"－":Number(record.elevation).toFixed(3),textX,elevationY,normalized.elevationTextSizeMm),points:[{x:textX,y:elevationY},{x:textX,y:elevationY}]}
    ];
  }
  function recordsFromStrokes(strokes){
    return (strokes||[]).filter(stroke=>stroke&&stroke.droggerLayerId===LAYERS.point&&stroke.droggerRecord).map(stroke=>({...stroke.droggerRecord})).sort((a,b)=>(+a.registeredAt||0)-(+b.registeredAt||0));
  }
  function updateTextStyles(strokes,settings){
    const normalized=normalizeSettings(settings);
    for(const stroke of strokes||[]){
      if(!stroke||!stroke.photoTextLabel)continue;
      const size=stroke.droggerLayerId===LAYERS.name?normalized.nameTextSizeMm:stroke.droggerLayerId===LAYERS.elevation?normalized.elevationTextSizeMm:null;
      if(size==null)continue;
      stroke.photoTextLabel.heightMm=size;
      stroke.photoTextLabel.widthMm=Math.max(size,String(stroke.photoTextLabel.text||"").length*size*.95);
    }
    return normalized;
  }
  function csvValue(value){
    let text=value==null?"":String(value);
    if(/^[=+\-@]/.test(text))text="'"+text;
    return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
  }
  function buildCsv(records){
    const headers=["点名","平面直角X","平面直角Y","標高","アンテナ標高","アンテナ高","水平誤差","系番号","緯度","経度","登録日時"];
    const rows=(records||[]).map(record=>[
      record.name,finite(record.x),finite(record.y),finite(record.elevation),finite(record.antennaAltitude),finite(record.antennaHeight),finite(record.accuracy),finite(record.zone),finite(record.lat),finite(record.lon),record.registeredAt?new Date(record.registeredAt).toLocaleString("ja-JP"):""
    ]);
    return [headers,...rows].map(row=>row.map(csvValue).join(",")).join("\r\n");
  }

  global.DroggerOwnerMode=Object.freeze({LAYERS,DEFAULT_SETTINGS,normalizeSettings,correctedElevation,nextPointName,incrementPointName,createRecord,createRegistrationStrokes,recordsFromStrokes,updateTextStyles,buildCsv});
})(window);
