(function(global){
  "use strict";

  const LAYERS=Object.freeze({
    point:"drogger:point",
    name:"drogger:name",
    elevation:"drogger:elevation"
  });
  const DEFAULT_SETTINGS=Object.freeze({
    antennaHeight:0,
    nameTextSizeMm:1.8,
    elevationTextSizeMm:1.8
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
  function correctedElevation(ellipsoidHeight,geoidHeight,antennaHeight){
    const ellipsoid=finite(ellipsoidHeight),geoid=finite(geoidHeight),antenna=finite(antennaHeight);
    return ellipsoid==null||geoid==null||antenna==null?null:ellipsoid-geoid-antenna;
  }
  function roundedElevation(value){
    const numeric=finite(value);
    return numeric==null?null:Math.round(numeric*1000)/1000;
  }
  function drawingElevationText(value){
    const numeric=finite(value);
    if(numeric==null)return "－";
    if(Math.abs(numeric)<.01)return "0.00";
    if(Math.abs(numeric)>=1e21)return numeric.toFixed(2);
    // Truncate decimal digits directly: 2.01 * 100 can be 200.99999999999997.
    const [whole,fraction=""]=String(numeric).split(".");
    return `${whole}.${(fraction+"00").slice(0,2)}`;
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
      geoidHeight:finite(gps.geoidHeight),
      geoidModelName:String(gps.geoidModelName||""),
      antennaHeight:normalized.antennaHeight,
      nameTextSizeMm:normalized.nameTextSizeMm,
      elevationTextSizeMm:normalized.elevationTextSizeMm,
      elevation:roundedElevation(correctedElevation(gps.altitude,gps.geoidHeight,normalized.antennaHeight)),
      accuracy:finite(gps.accuracy),
      altitudeAccuracy:finite(gps.altitudeAccuracy),
      fixMode:String(gps.fixMode||""),
      fixQuality:finite(gps.fixQuality),
      fixAgeMs:finite(gps.fixAgeMs),
      sourceTimestamp:finite(gps.timestamp,now),
      registeredAt:now
    };
  }
  function labelPayload(text,x,y,heightMm){
    const value=String(text||"");
    const height=clamp(finite(heightMm,DEFAULT_SETTINGS.nameTextSizeMm),1,10);
    return {text:value,x,y,heightMm:height,widthMm:Math.max(height,value.length*height*.95),align1:4,align2:0};
  }
  function createRegistrationStrokes(record,worldUnitsPerPaperMm,settings){
    if(!record)return [];
    const units=Math.max(1e-9,finite(worldUnitsPerPaperMm,1));
    const normalized=normalizeSettings(settings);
    const cx=record.sfcX*1000,cy=record.sfcY*1000;
    const radius=.4*units;
    const points=[];
    for(let i=0;i<=48;i++){
      const angle=Math.PI*2*i/48;
      points.push({x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius});
    }
    const markerWidthMm=.13/3;
    const base={type:"freehand",color:"#ff3030",opacity:1,eraser:false,screenWidthPx:null,worldWidthMm:markerWidthMm,width:10,droggerPointId:record.id};
    const textX=cx+1.05*units;
    const nameY=cy+.78*units;
    const elevationY=cy-.78*units;
    return [
      {...base,droggerLayerId:LAYERS.point,droggerRecord:{...record},isCircleMemo:true,paperDiameterMm:.8,circleGeometryVersion:2,points},
      {...base,droggerLayerId:LAYERS.point,points:[{x:cx-radius,y:cy},{x:cx+radius,y:cy}]},
      {...base,droggerLayerId:LAYERS.point,points:[{x:cx,y:cy-radius},{x:cx,y:cy+radius}]},
      {...base,droggerLayerId:LAYERS.name,worldWidthMm:.006,width:1,photoTextLabel:labelPayload(record.name,textX,nameY,normalized.nameTextSizeMm),points:[{x:textX,y:nameY},{x:textX,y:nameY}]},
      {...base,droggerLayerId:LAYERS.elevation,worldWidthMm:.006,width:1,photoTextLabel:labelPayload(drawingElevationText(record.elevation),textX,elevationY,normalized.elevationTextSizeMm),points:[{x:textX,y:elevationY},{x:textX,y:elevationY}]}
    ];
  }
  function recordsFromStrokes(strokes){
    return (strokes||[]).filter(stroke=>stroke&&stroke.droggerLayerId===LAYERS.point&&stroke.droggerRecord).map(stroke=>({...stroke.droggerRecord})).sort((a,b)=>(+a.registeredAt||0)-(+b.registeredAt||0));
  }
  function updateTextStyles(strokes,settings){
    const normalized=normalizeSettings(settings);
    const updatedPointIds=new Set();
    for(const stroke of strokes||[]){
      if(stroke?.droggerRecord&&stroke?.droggerPointId){
        stroke.droggerRecord.nameTextSizeMm=normalized.nameTextSizeMm;
        stroke.droggerRecord.elevationTextSizeMm=normalized.elevationTextSizeMm;
        updatedPointIds.add(stroke.droggerPointId);
      }
      if(!stroke||!stroke.photoTextLabel)continue;
      const size=stroke.droggerLayerId===LAYERS.name?normalized.nameTextSizeMm:stroke.droggerLayerId===LAYERS.elevation?normalized.elevationTextSizeMm:null;
      if(size==null)continue;
      stroke.photoTextLabel.heightMm=size;
      stroke.photoTextLabel.widthMm=Math.max(size,String(stroke.photoTextLabel.text||"").length*size*.95);
    }
    if(updatedPointIds.size){
      for(const stroke of strokes||[]){
        if(!updatedPointIds.has(stroke?.droggerPointId)||!stroke?.droggerRecord)continue;
        stroke.droggerRecord.nameTextSizeMm=normalized.nameTextSizeMm;
        stroke.droggerRecord.elevationTextSizeMm=normalized.elevationTextSizeMm;
      }
    }
    return normalized;
  }
  function prepareRegistrationStrokesForPaper(strokes,worldUnitsPerPaperMm){
    const source=Array.isArray(strokes)?strokes:[];
    const groups=new Map();
    for(const stroke of source){
      const id=stroke&&stroke.droggerPointId;
      if(!id)continue;
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(stroke);
    }
    const rebuilt=new Map();
    for(const [id,group] of groups){
      const recordStroke=group.find(stroke=>stroke&&stroke.droggerRecord);
      if(!recordStroke)continue;
      const record={...recordStroke.droggerRecord};
      const nameLabel=group.find(stroke=>stroke?.droggerLayerId===LAYERS.name&&stroke.photoTextLabel)?.photoTextLabel;
      const elevationLabel=group.find(stroke=>stroke?.droggerLayerId===LAYERS.elevation&&stroke.photoTextLabel)?.photoTextLabel;
      const settings=normalizeSettings({
        antennaHeight:record.antennaHeight,
        nameTextSizeMm:finite(nameLabel?.heightMm,finite(record.nameTextSizeMm,DEFAULT_SETTINGS.nameTextSizeMm)),
        elevationTextSizeMm:finite(elevationLabel?.heightMm,finite(record.elevationTextSizeMm,DEFAULT_SETTINGS.elevationTextSizeMm))
      });
      rebuilt.set(id,createRegistrationStrokes(record,worldUnitsPerPaperMm,settings));
    }
    const emitted=new Set(),result=[];
    for(const stroke of source){
      const id=stroke&&stroke.droggerPointId;
      if(!id||!rebuilt.has(id)){result.push(stroke);continue;}
      if(emitted.has(id))continue;
      emitted.add(id);
      result.push(...rebuilt.get(id));
    }
    return result;
  }
  function csvValue(value,numeric=false){
    let text=value==null?"":String(value);
    if(!numeric&&/^[=+\-@]/.test(text))text="'"+text;
    return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
  }
  function buildCsv(records){
    const headers=["点名","平面直角X","平面直角Y","標高","アンテナ標高","アンテナ高","水平誤差","RTK状態","系番号","緯度","経度","登録日時"];
    const rows=(records||[]).map(record=>[
      record.name,finite(record.x),finite(record.y),finite(record.elevation)==null?null:Number(record.elevation).toFixed(3),finite(record.antennaAltitude),finite(record.antennaHeight),finite(record.accuracy),record.fixMode||"",finite(record.zone),finite(record.lat),finite(record.lon),record.registeredAt?new Date(record.registeredAt).toLocaleString("ja-JP"):""
    ]);
    return [headers.map(value=>csvValue(value)).join(","),...rows.map(row=>row.map((value,index)=>csvValue(value,[1,2,3,4,5,6,8,9,10].includes(index))).join(","))].join("\r\n");
  }

  global.DroggerOwnerMode=Object.freeze({LAYERS,DEFAULT_SETTINGS,normalizeSettings,correctedElevation,drawingElevationText,nextPointName,incrementPointName,createRecord,createRegistrationStrokes,prepareRegistrationStrokesForPaper,recordsFromStrokes,updateTextStyles,buildCsv});
})(window);
