(function(global){
  "use strict";

  const DB_NAME="ezviewer_drogger_geoid_v1";
  const STORE_NAME="models";
  const ACTIVE_KEY="active";

  function parseIsgText(text,fallbackName){
    const lines=String(text||"").split(/\r?\n/);
    const begin=lines.findIndex(line=>/begin_of_head/i.test(line));
    if(begin<0)throw new Error("ISG 2.0のヘッダーがありません");
    let end=-1;
    for(let index=begin;index<lines.length;index++)if(/end_of_head/i.test(lines[index])){end=index;break;}
    if(end<0)throw new Error("ISG 2.0のヘッダーがありません");
    const fields=new Map();
    for(const line of lines.slice(begin,end+1)){
      const equal=line.indexOf("=");
      const colon=line.indexOf(":");
      const separators=[equal,colon].filter(value=>value>=0);
      if(!separators.length)continue;
      const separator=Math.min(...separators);
      const key=line.slice(0,separator).trim().toLowerCase().replace(/\s+/g," ");
      fields.set(key,line.slice(separator+1).trim());
    }
    const numberPattern=/[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/;
    function headerNumber(label){
      const match=String(fields.get(label)||"").match(numberPattern);
      const value=match?Number(match[0]):NaN;
      return Number.isFinite(value)?value:null;
    }
    function headerAngle(label){
      const source=String(fields.get(label)||"");
      const match=source.match(/([-+]?\d+)\s*°\s*(\d+)\s*'\s*(\d+(?:\.\d+)?)\s*"?/);
      if(!match)return headerNumber(label);
      const degrees=Number(match[1]);
      const magnitude=Math.abs(degrees)+Number(match[2])/60+Number(match[3])/3600;
      return degrees<0?-magnitude:magnitude;
    }
    const minLatitude=headerAngle("lat min");
    const maxLatitude=headerAngle("lat max");
    const minLongitude=headerAngle("lon min");
    const maxLongitude=headerAngle("lon max");
    const latitudeStep=Math.abs(headerAngle("delta lat"));
    const longitudeStep=Math.abs(headerAngle("delta lon"));
    if(![minLatitude,maxLatitude,minLongitude,maxLongitude,latitudeStep,longitudeStep].every(Number.isFinite))throw new Error("ISGヘッダーの格子情報が不足しています");
    if(!(latitudeStep>0&&longitudeStep>0&&maxLatitude>minLatitude&&maxLongitude>minLongitude))throw new Error("ISGヘッダーの格子範囲が不正です");
    const calculatedRows=Math.round((maxLatitude-minLatitude)/latitudeStep)+1;
    const calculatedColumns=Math.round((maxLongitude-minLongitude)/longitudeStep)+1;
    const headerRows=Math.round(headerNumber("nrows"));
    const headerColumns=Math.round(headerNumber("ncols"));
    const rows=headerRows>=2?headerRows:calculatedRows;
    const columns=headerColumns>=2?headerColumns:calculatedColumns;
    if(Math.abs(rows-calculatedRows)>1||Math.abs(columns-calculatedColumns)>1)throw new Error("ISGヘッダーの範囲と格子数が一致しません");
    const expected=rows*columns;
    if(!Number.isSafeInteger(expected)||expected<4||expected>20000000)throw new Error(`ISGの格子数が不正です（${rows} 行 × ${columns} 列）`);
    const values=new Float32Array(expected);
    let count=0;
    const valuePattern=/[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/g;
    for(const line of lines.slice(end+1)){
      const matches=line.match(valuePattern)||[];
      for(const token of matches){
        if(count>=expected)throw new Error(`格子数が多すぎます（必要 ${expected}）`);
        values[count++]=Number(token);
      }
    }
    if(count!==expected)throw new Error(`格子数が一致しません（必要 ${expected}、読込 ${count}）`);
    return {
      name:String(fields.get("model name")||fallbackName||"ジオイドモデル"),
      minLatitude,maxLatitude,minLongitude,maxLongitude,latitudeStep,longitudeStep,rows,columns,values
    };
  }

  function interpolate(model,latitude,longitude){
    if(!model||!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;
    if(latitude<model.minLatitude||latitude>model.maxLatitude||longitude<model.minLongitude||longitude>model.maxLongitude)return null;
    const rowPosition=(model.maxLatitude-latitude)/model.latitudeStep;
    const columnPosition=(longitude-model.minLongitude)/model.longitudeStep;
    const row0=Math.max(0,Math.min(model.rows-1,Math.floor(rowPosition)));
    const column0=Math.max(0,Math.min(model.columns-1,Math.floor(columnPosition)));
    const row1=Math.min(model.rows-1,row0+1);
    const column1=Math.min(model.columns-1,column0+1);
    const t=Math.max(0,Math.min(1,rowPosition-row0));
    const u=Math.max(0,Math.min(1,columnPosition-column0));
    const values=model.values instanceof Float32Array?model.values:new Float32Array(model.values);
    const z00=values[row0*model.columns+column0];
    const z01=values[row0*model.columns+column1];
    const z10=values[row1*model.columns+column0];
    const z11=values[row1*model.columns+column1];
    if([z00,z01,z10,z11].some(value=>!Number.isFinite(value)||value<=-9990))return null;
    return (1-t)*(1-u)*z00+(1-t)*u*z01+t*(1-u)*z10+t*u*z11;
  }

  function openDatabase(){
    return new Promise((resolve,reject)=>{
      if(!global.indexedDB){reject(new Error("このブラウザはジオイドモデルの保存に対応していません"));return;}
      const request=global.indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME);};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("ジオイドモデル保存領域を開けません"));
    });
  }
  async function saveActiveModel(model){
    const db=await openDatabase();
    try{
      const stored={...model,values:model.values instanceof Float32Array?model.values:new Float32Array(model.values)};
      await new Promise((resolve,reject)=>{
        const transaction=db.transaction(STORE_NAME,"readwrite");
        transaction.objectStore(STORE_NAME).put(stored,ACTIVE_KEY);
        transaction.oncomplete=resolve;
        transaction.onerror=()=>reject(transaction.error||new Error("ジオイドモデルを保存できません"));
        transaction.onabort=()=>reject(transaction.error||new Error("ジオイドモデルの保存を中断しました"));
      });
    }finally{db.close();}
  }
  async function loadActiveModel(){
    const db=await openDatabase();
    try{
      const model=await new Promise((resolve,reject)=>{
        const request=db.transaction(STORE_NAME,"readonly").objectStore(STORE_NAME).get(ACTIVE_KEY);
        request.onsuccess=()=>resolve(request.result||null);
        request.onerror=()=>reject(request.error||new Error("ジオイドモデルを読み込めません"));
      });
      if(model&&!(model.values instanceof Float32Array))model.values=new Float32Array(model.values);
      return model;
    }finally{db.close();}
  }
  async function parseFile(file){
    if(!file)throw new Error("ジオイドファイルが選択されていません");
    if(!global.Worker||!global.Blob||!global.URL?.createObjectURL)return parseIsgText(await file.text(),file.name);
    const workerSource=`const parseIsgText=${parseIsgText.toString()};self.onmessage=async event=>{try{const file=event.data;const model=parseIsgText(await file.text(),file.name);self.postMessage({ok:true,model},[model.values.buffer]);}catch(error){self.postMessage({ok:false,message:error&&error.message||String(error)});}};`;
    const url=global.URL.createObjectURL(new Blob([workerSource],{type:"text/javascript"}));
    try{
      return await new Promise((resolve,reject)=>{
        const worker=new Worker(url);
        worker.onmessage=event=>{
          worker.terminate();
          if(!event.data?.ok){reject(new Error(event.data?.message||"ジオイドモデルを解析できません"));return;}
          const model=event.data.model;
          model.values=model.values instanceof Float32Array?model.values:new Float32Array(model.values);
          resolve(model);
        };
        worker.onerror=event=>{worker.terminate();reject(new Error(event.message||"ジオイドモデルを解析できません"));};
        worker.postMessage(file);
      });
    }finally{global.URL.revokeObjectURL(url);}
  }

  global.DroggerGeoidModel=Object.freeze({parseIsgText,parseFile,interpolate,saveActiveModel,loadActiveModel});
})(window);
