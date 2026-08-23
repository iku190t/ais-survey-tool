const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(__dirname+"/index.html","utf8");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(code=>code.trim());
for(let index=0;index<scripts.length;index++)new vm.Script(scripts[index],{filename:`inline-${index+1}.js`});

const context={window:{},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+"/drogger-owner-mode.js","utf8"),context);
const feature=context.window.DroggerOwnerMode;
if(!feature)throw new Error("Drogger owner module is not loaded");

const settings=feature.normalizeSettings({antennaHeight:1.5,nameTextSizeMm:3,elevationTextSizeMm:2});
const gps={lat:34.1,lon:134.5,zone:4,x:100.123,y:200.456,sfcX:200.456,sfcY:100.123,altitude:52.345,geoidHeight:37.1197,geoidModelName:"JPGEO2024",accuracy:.015,altitudeAccuracy:.025,timestamp:Date.now()};
const record=feature.createRecord(gps,settings,"K-1");
if(!record||Math.abs(record.elevation-13.725)>1e-9)throw new Error("geoid and antenna height correction failed");
const strokes=feature.createRegistrationStrokes(record,250,settings);
if(strokes.length!==5)throw new Error("registration must create circle, plus and two labels");
if(strokes[0].droggerLayerId!==feature.LAYERS.point||strokes[1].droggerLayerId!==feature.LAYERS.point||strokes[2].droggerLayerId!==feature.LAYERS.point||strokes[3].droggerLayerId!==feature.LAYERS.name||strokes[4].droggerLayerId!==feature.LAYERS.elevation)throw new Error("Drogger layers are not separated");
const circle=strokes[0].points;
const diameter=Math.hypot(circle[0].x-circle[24].x,circle[0].y-circle[24].y);
if(Math.abs(diameter-200)>1e-6||strokes[0].paperDiameterMm!==.8)throw new Error("registered circle is not 0.8 mm on paper");
if(Math.abs(strokes[0].worldWidthMm-.13/3)>1e-12)throw new Error("registered circle stroke is not one third of the former width");
const center={x:record.sfcX*1000,y:record.sfcY*1000};
if(strokes[1].points[0].x!==center.x-100||strokes[1].points[1].x!==center.x+100||strokes[2].points[0].y!==center.y-100||strokes[2].points[1].y!==center.y+100)throw new Error("center plus does not touch the 0.8 mm circle");
if(feature.recordsFromStrokes(strokes).length!==1)throw new Error("coordinate record extraction failed");
feature.updateTextStyles(strokes,{nameTextSizeMm:4,elevationTextSizeMm:5,antennaHeight:1.5});
if(strokes[3].photoTextLabel.heightMm!==4||strokes[4].photoTextLabel.heightMm!==5)throw new Error("label size update failed");
if(strokes[4].photoTextLabel.text!=="13.72")throw new Error("drawing elevation was not truncated to two decimals");
const csv=feature.buildCsv([record]);
for(const token of ["点名","平面直角X","アンテナ高","K-1","13.725"])if(!csv.includes(token))throw new Error(`CSV missing ${token}`);
if(csv.includes("標高誤差"))throw new Error("unused altitude-accuracy column remains in CSV");
if(feature.incrementPointName("P1",[{name:"P1"}])!=="P2"||feature.incrementPointName("P2",[{name:"P1"},{name:"P2"}])!=="P3")throw new Error("point-name increment failed");
const noAltitudeRecord=feature.createRecord({...gps,altitude:null},settings,"P3");
if(!noAltitudeRecord||noAltitudeRecord.elevation!==null||noAltitudeRecord.antennaAltitude!==null)throw new Error("coordinates without altitude must remain registerable");
const noAltitudeStrokes=feature.createRegistrationStrokes(noAltitudeRecord,250,settings);
if(noAltitudeStrokes[4].photoTextLabel.text!=="－")throw new Error("missing elevation label is not blank-safe");

const required=[
  'id="gpsTitle"',
  'id="droggerOwnerControls"',
  'id="droggerCoordinateModal"',
  'id="droggerOwnerMinimizeBtn"',
  'drogger-geoid-model.js?v=1',
  'drogger-owner-mode.js?v=2',
  'id="droggerGeoidModelBtn"',
  'const DROGGER_OWNER_LONG_PRESS_MS=3000',
  'handleDroggerTitlePointerDown',
  'function playDroggerRegisterBeep()',
  'gain.gain.setValueAtTime(1,start+.075)',
  'playDroggerRegisterBeep();',
  'Math.hypot(event.clientX-state.startX,event.clientY-state.startY)>12',
  'altitudeAccuracy = Number.isFinite(pos.coords.altitudeAccuracy)',
  'DROGGER_RELATED_LAYER_NAMES',
  'drawDroggerCadLabels()',
  'droggerRecord: s.droggerRecord ? {...s.droggerRecord} : null'
];
for(const token of required)if(!html.includes(token))throw new Error(`index integration missing: ${token}`);
for(const forbidden of ['Droggerから高度を受信できていません','測位データが古いため、Droggerの接続を確認してください','標高誤差:','id="droggerOwnerHint"'])if(html.includes(forbidden))throw new Error(`obsolete Drogger UI or registration gate remains: ${forbidden}`);
const registerBody=html.match(/function registerCurrentDroggerCoordinate\(\)\{([\s\S]*?)\n\}/)?.[1]||"";
if(!registerBody||registerBody.includes("hasLoadedDrawing"))throw new Error("Drogger registration still requires an SFC drawing");
console.log("OK: hidden Drogger coordinate registration, geoid correction, 0.8 mm plus marker, truncated drawing label and three-decimal CSV");
