const fs=require("fs");

const html=fs.readFileSync(__dirname+"/index.html","utf8");

const requireText=(text,message)=>{
  if(!html.includes(text))throw new Error(message);
};

requireText(
  "function getAerialPhotoZoomForCurrentView(source,latitude)",
  "shared aerial-photo zoom helper is missing"
);
const drawStart=html.indexOf("function drawAerialPhoto(w,h)");
const drawEnd=html.indexOf("function overlayTileUrl",drawStart);
const cadStart=html.indexOf("async function renderVisibleAerialPhotoForSfc");
const cadEnd=html.indexOf("function getNextAerialImageSerial",cadStart);
const exportStart=html.indexOf("async function prepareAerialRasterForSfcExport");
const exportEnd=html.indexOf("function getSxfRasterBoundaryStyle",exportStart+20);
if([drawStart,drawEnd,cadStart,cadEnd,exportStart,exportEnd].some(value=>value<0)){
  throw new Error("aerial-photo functions could not be isolated");
}
const drawBlock=html.slice(drawStart,drawEnd);
const cadBlock=html.slice(cadStart,cadEnd);
const exportBlock=html.slice(exportStart,exportEnd);
if(!drawBlock.includes("getAerialPhotoZoomForCurrentView(source,centerLl.lat)")){
  throw new Error("screen aerial photo does not use the shared zoom");
}
if(!cadBlock.includes("getAerialPhotoZoomForCurrentView(source,centerLatLon.lat)")){
  throw new Error("CAD aerial photo does not use the screen zoom");
}
if(!cadBlock.includes("const resolution=tileResolution;")){
  throw new Error("CAD aerial photo still changes native tile resolution");
}
if(/maxSide\s*=\s*1800/.test(cadBlock)||/maxSide\s*=\s*1800/.test(exportBlock)){
  throw new Error("aerial raster is still downscaled to 1800 pixels");
}
if(!cadBlock.includes('canvasToBlobAsync(output,"image/jpeg",1)')||
   !exportBlock.includes('canvasToBlobAsync(output,"image/jpeg",1)')){
  throw new Error("aerial raster is not encoded at maximum JPEG quality");
}

const labelStart=html.indexOf("function terrainCadLabelForPolyline");
const labelEnd=html.indexOf("function setTerrainCadSelectionOpen",labelStart);
const annotationStart=html.indexOf("function buildInkPolylineFeatureText");
const annotationEnd=html.indexOf("function stripEmbeddedAnnotations",annotationStart);
if(labelStart<0||labelEnd<0||annotationStart<0||annotationEnd<0){
  throw new Error("contour label functions could not be isolated");
}
const labelBlock=html.slice(labelStart,labelEnd);
const annotationBlock=html.slice(annotationStart,annotationEnd);
if(!labelBlock.includes("align1:5,align2:1")){
  throw new Error("contour labels are not created with a centre anchor");
}
if(!annotationBlock.includes("Math.round(+label.align1||5)")){
  throw new Error("SFC contour labels do not default to the centre anchor");
}
if(!annotationBlock.includes("'${anchor}','${direction}'")){
  throw new Error("SFC contour label anchor is not written to text_string_feature");
}

console.log("OK: contour labels are centre-anchored and aerial rasters keep displayed tile resolution");
