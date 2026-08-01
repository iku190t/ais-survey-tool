const fs=require("fs");

const html=fs.readFileSync("index.html","utf8");
const requireText=(needle,message)=>{if(!html.includes(needle))throw new Error(message);};

const displayStart=html.indexOf("function drawTerrainContours(grid,staleViewport)");
const displayEnd=html.indexOf("function drawTerrainOverlay()",displayStart);
const cadStart=html.indexOf("function drawTerrainCadLabels()");
const cadEnd=html.indexOf("async function finishTerrainCadSelection()",cadStart);
const parserStart=html.indexOf("function parseSfcText(srcText, fileName)");
const parserEnd=html.indexOf("function setRenderBounds",parserStart);
const exportStart=html.indexOf("function getGeneratedHorizontalSxfTextAngle(baseText,points)");
const exportEnd=html.indexOf("function buildGeneratedTextFontDefinition",exportStart);

if([displayStart,displayEnd,cadStart,cadEnd,parserStart,parserEnd,exportStart,exportEnd].some(value=>value<0)){
  throw new Error("contour text implementation blocks were not found");
}

const displayBlock=html.slice(displayStart,displayEnd);
const cadBlock=html.slice(cadStart,cadEnd);
const parserBlock=html.slice(parserStart,parserEnd);
const exportBlock=html.slice(exportStart,exportEnd);

requireText(
  "/^等高線_(?:DEM1A_|DEM5A_)?計曲線$/.test(name)",
  "reloaded contour label layers are not identified"
);
if(displayBlock.includes("ctx.rotate(item.angle)")){
  throw new Error("terrain-analysis labels still follow contour segment angles");
}
if(!displayBlock.includes("ctx.rotate(-(rotationDeg||0)*Math.PI/180)")){
  throw new Error("terrain-analysis labels are not horizontal to the drawing");
}
if(!cadBlock.includes("ctx.rotate(-(rotationDeg||0)*Math.PI/180)")){
  throw new Error("CAD contour labels are not horizontal to the drawing");
}
if(!parserBlock.includes("angle:forceHorizontal?0:Math.atan2(tx.y,tx.x)*180/Math.PI")){
  throw new Error("reloaded CAD contour labels can inherit partial-figure rotation");
}
if(!parserBlock.includes("align2:forceHorizontal?1:")){
  throw new Error("reloaded CAD contour labels are not forced to horizontal writing");
}
if(!exportBlock.includes("return normalizeSxfTextAngle(-(Number.isFinite(placementOrientation)")){
  throw new Error("SXF export does not cancel partial-figure placement rotation");
}
requireText("const verticalFont=/^@/.test(canonical);","vertical font detection is missing");
requireText("if(!verticalFont&&(normalized.includes","vertical fonts can still be selected for horizontal labels");

const fontStart=html.indexOf("function buildGeneratedTextFontDefinition(baseText,startId)");
const fontEnd=html.indexOf("function buildInkPolylineFeatureText(baseText)",fontStart);
if(fontStart<0||fontEnd<0)throw new Error("generated text font helper was not found");
const fontFactory=new Function("records",`
  const parseSxfFeatureRecords=()=>records;
  const getFlatSxfText=value=>value;
  const decodeShiftJisFromLatin1=value=>value;
  const unquoteSxfValue=value=>String(value).replace(/^['\"]|['\"]$/g,"");
  const encodeSfcText=value=>value;
  ${html.slice(fontStart,fontEnd)}
  return buildGeneratedTextFontDefinition('test',100);
`);
const verticalResult=fontFactory([{name:"text_font_feature",args:["'@ＭＳ ゴシック'"]}]);
const horizontalResult=fontFactory([{name:"text_font_feature",args:["'ＭＳ ゴシック'"]}]);
if(verticalResult.fontCode!=="2"||!verticalResult.fontText.includes("text_font_feature")){
  throw new Error("vertical @ font was incorrectly reused for horizontal contour text");
}
if(horizontalResult.fontCode!=="1"||horizontalResult.fontText){
  throw new Error("existing horizontal MS Gothic font is not reused");
}

// The supplied regression file uses a 310-degree partial-figure placement and
// a 50-degree text angle.  SXF composes them to 360 degrees (drawing horizontal).
const normalize=angle=>((angle%360)+360)%360;
if(Math.abs(normalize(310+50))>1e-9){
  throw new Error("SXF partial-figure/text angle composition regression");
}

console.log("OK: terrain contour labels remain horizontal in display, export and reload paths");
