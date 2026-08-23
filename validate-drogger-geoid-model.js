const fs=require("fs");
const vm=require("vm");

const context={window:{},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+"/drogger-geoid-model.js","utf8"),context);
const feature=context.window.DroggerGeoidModel;
if(!feature)throw new Error("Drogger geoid module is not loaded");

const source=`begin_of_head
model name = TEST-GEOID
lat min = 34
lat max = 35
lon min = 134
lon max = 135
delta lat = 0.5
delta lon = 0.5
nrows = 3
ncols = 3
end_of_head
30 31 32
20 21 22
10 11 12`;
const model=feature.parseIsgText(source,"fallback.isg");
if(model.name!=="TEST-GEOID"||model.rows!==3||model.columns!==3)throw new Error("ISG header parsing failed");
const center=feature.interpolate(model,34.5,134.5);
if(Math.abs(center-21)>1e-9)throw new Error(`exact grid lookup failed: ${center}`);
const interpolated=feature.interpolate(model,34.75,134.25);
if(Math.abs(interpolated-25.5)>1e-9)throw new Error(`north-to-south bilinear interpolation failed: ${interpolated}`);
if(feature.interpolate(model,36,134.5)!==null)throw new Error("out-of-range lookup must not return a geoid height");

console.log("OK: Drogger ISG 2.0 parsing and north-to-south bilinear interpolation");
