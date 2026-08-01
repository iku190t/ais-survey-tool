const fs=require("fs");

const html=fs.readFileSync(__dirname+"/index.html","utf8");

const requireText=(text,message)=>{
  if(!html.includes(text))throw new Error(message);
};

requireText(
  "function getAerialPhotoZoomForCurrentView(source,latitude)",
  "screen aerial-photo zoom helper is missing"
);
requireText(
  "function getAerialPhotoExportZoom(source)",
  "native-resolution aerial-photo export helper is missing"
);
requireText(
  "async function resolveAerialPhotoExportZoom(source,latitude,longitude)",
  "available maximum aerial-photo zoom resolver is missing"
);
const exportZoomStart=html.indexOf("function getAerialPhotoExportZoom(source)");
const exportZoomEnd=html.indexOf("function drawAerialPhoto",exportZoomStart);
const getExportZoom=new Function(`${html.slice(exportZoomStart,exportZoomEnd)};return getAerialPhotoExportZoom;`)();
if(getExportZoom({minZ:14,maxZ:18})!==18||getExportZoom({minZ:10,maxZ:17})!==17){
  throw new Error("CAD aerial photo export does not select the source maximum zoom");
}
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
if(!cadBlock.includes("const z=await resolveAerialPhotoExportZoom(source,centerLatLon.lat,centerLatLon.lon);")){
  throw new Error("CAD aerial photo does not resolve the highest available source zoom");
}
if(cadBlock.includes("getAerialPhotoZoomForCurrentView(source,centerLatLon.lat)")){
  throw new Error("CAD aerial photo still depends on the current screen zoom");
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
if(labelBlock.includes("total<8000")){
  throw new Error("short index contours still suppress their elevation label");
}
requireText(
  "function createTerrainCadStrokesFromGroups(groups)",
  "contour labels are not linked to the exported polyline chunks"
);
requireText(
  "target.terrainLabel=label",
  "contour label is not attached to its nearest exported polyline chunk"
);
requireText(
  "function buildTerrainCadChunkSpecs(worldPolygon,chunkSize=220,overlap=2)",
  "wide contour CAD export is not divided into overlapping chunks"
);
requireText(
  "function terrainCadSegmentDedupKey(a,b)",
  "chunked contour CAD export does not remove duplicate segments"
);
if(!annotationBlock.includes("Math.round(+label.align1||5)")){
  throw new Error("SFC contour labels do not default to the centre anchor");
}
if(!annotationBlock.includes("'${anchor}','${direction}'")){
  throw new Error("SFC contour label anchor is not written to text_string_feature");
}

console.log("OK: contour labels are centre-anchored and aerial rasters use the source maximum resolution");
