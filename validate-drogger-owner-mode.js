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
const gps={lat:34.1,lon:134.5,zone:4,x:100.123,y:200.456,sfcX:200.456,sfcY:100.123,altitude:52.345,accuracy:.015,altitudeAccuracy:.025,timestamp:Date.now()};
const record=feature.createRecord(gps,settings,"K-1");
if(!record||Math.abs(record.elevation-50.845)>1e-9)throw new Error("antenna height correction failed");
const strokes=feature.createRegistrationStrokes(record,250,settings);
if(strokes.length!==3)throw new Error("registration must create three layers");
if(strokes[0].droggerLayerId!==feature.LAYERS.point||strokes[1].droggerLayerId!==feature.LAYERS.name||strokes[2].droggerLayerId!==feature.LAYERS.elevation)throw new Error("Drogger layers are not separated");
const circle=strokes[0].points;
const diameter=Math.hypot(circle[0].x-circle[24].x,circle[0].y-circle[24].y);
if(Math.abs(diameter-250)>1e-6||strokes[0].paperDiameterMm!==1)throw new Error("registered circle is not 1 mm on paper");
if(feature.recordsFromStrokes(strokes).length!==1)throw new Error("coordinate record extraction failed");
feature.updateTextStyles(strokes,{nameTextSizeMm:4,elevationTextSizeMm:5,antennaHeight:1.5});
if(strokes[1].photoTextLabel.heightMm!==4||strokes[2].photoTextLabel.heightMm!==5)throw new Error("label size update failed");
const csv=feature.buildCsv([record]);
for(const token of ["点名","平面直角X","アンテナ高","K-1","50.845"])if(!csv.includes(token))throw new Error(`CSV missing ${token}`);

const required=[
  'id="gpsTitle"',
  'id="droggerOwnerControls"',
  'id="droggerCoordinateModal"',
  'drogger-owner-mode.js?v=1',
  'const DROGGER_OWNER_LONG_PRESS_MS=5000',
  'handleDroggerTitlePointerDown',
  'Math.hypot(event.clientX-state.startX,event.clientY-state.startY)>12',
  'altitudeAccuracy = Number.isFinite(pos.coords.altitudeAccuracy)',
  'DROGGER_RELATED_LAYER_NAMES',
  'drawDroggerCadLabels()',
  'droggerRecord: s.droggerRecord ? {...s.droggerRecord} : null'
];
for(const token of required)if(!html.includes(token))throw new Error(`index integration missing: ${token}`);
console.log("OK: hidden Drogger coordinate registration, layers, correction and CSV");
