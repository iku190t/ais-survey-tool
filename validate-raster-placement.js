const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(__dirname+"/index.html","utf8");
const start=html.indexOf("function getAerialRasterPaperCorners");
const end=html.indexOf("function addAerialImageReferenceToSfc",start);
if(start<0||end<=start)throw new Error("aerial raster corner helper is missing");
const assemblyStart=html.indexOf("function getSxfFeatureBlockBoundsAt");
if(assemblyStart<0||assemblyStart>=start)throw new Error("aerial raster assembly helper is missing");

const context={Math,Number};
context.planeToSfcWorld=(xNorth,yEast)=>({x:xNorth/1000,y:yEast/1000});
context.sxfAffinePoint=(matrix,x,y)=>[
  matrix.a*x+matrix.c*y+matrix.e,
  matrix.b*x+matrix.d*y+matrix.f
];
vm.createContext(context);
const colorStart=html.indexOf("const SXF_PREDEFINED_COLOR_NAMES_BY_CODE");
const colorEnd=html.indexOf("function adaptContrastColor",colorStart);
const widthStart=html.indexOf("const SXF_PREDEFINED_WIDTH_BY_CODE");
const widthEnd=html.indexOf("function parseSfcTextLegacyFallback",widthStart);
const parserStart=html.indexOf("function flattenSxfFeatureBlocks");
const parserEnd=html.indexOf("function buildMemoColorDefinitionText",parserStart);
if(colorStart<0||colorEnd<=colorStart||widthStart<0||widthEnd<=widthStart||parserStart<0||parserEnd<=parserStart){
  throw new Error("SXF definition helpers are missing");
}
vm.runInContext(html.slice(colorStart,colorEnd),context);
vm.runInContext(html.slice(widthStart,widthEnd),context);
vm.runInContext(html.slice(parserStart,parserEnd),context);
vm.runInContext(html.slice(assemblyStart,start),context);
vm.runInContext(html.slice(start,end),context);

const polygon=[
  {xNorth:10,yEast:20},
  {xNorth:30,yEast:20},
  {xNorth:30,yEast:50},
  {xNorth:10,yEast:50}
];
const angle=31*Math.PI/180;
const transform={a:Math.cos(angle),b:Math.sin(angle),c:-Math.sin(angle),d:Math.cos(angle),e:7,f:-4};
const bounds={minX:10,maxX:30,minY:20,maxY:50};
const actual=context.getAerialRasterPaperCorners(bounds,polygon,transform);
const expected=[...polygon,polygon[0]].map(point=>context.sxfAffinePoint(transform,point.xNorth,point.yEast));
if(actual.length!==expected.length)throw new Error("aerial raster boundary was not closed");
for(let index=0;index<expected.length;index++){
  if(Math.hypot(actual[index][0]-expected[index][0],actual[index][1]-expected[index][1])>1e-9){
    throw new Error(`aerial raster corner order changed at ${index}`);
  }
}
const fallback=context.getAerialRasterPaperCorners(bounds,null,transform);
if(fallback.length!==5||Math.hypot(fallback[0][0]-fallback[4][0],fallback[0][1]-fallback[4][1])>1e-9){
  throw new Error("aerial raster bounds fallback is not a closed boundary");
}
const exportGeometry=context.getAerialRasterExportGeometry(bounds,polygon,transform);
const rectangle=exportGeometry.paperCorners;
if(rectangle.length!==5||rectangle[0][0]!==rectangle[1][0]||rectangle[1][1]!==rectangle[2][1]
  ||rectangle[2][0]!==rectangle[3][0]||rectangle[3][1]!==rectangle[0][1]){
  throw new Error("external CAD raster boundary is not paper-horizontal");
}
if(!html.includes("prepareAerialRasterForSfcExport(entry,displayToPaper)"))throw new Error("raster pixels are not aligned before SFC export");
if(!html.includes("paperCorners:prepared.paperCorners"))throw new Error("prepared raster boundary is not used by SFC export");
if(!html.includes("rasterAxisVersion:3"))throw new Error("paper-aligned SFZ raster import is not enabled");
if(!html.includes("getAerialRasterPaperCorners(bounds,planePolygon,displayToPaper)"))throw new Error("single raster export lost its selection polygon");
if(!html.includes("getAerialRasterPaperCorners(spec.bounds,spec.planePolygon,displayToPaper)"))throw new Error("batch raster export lost its selection polygon");

const noBlackSource=[
  "/*SXF\n#10 = pre_defined_colour_feature(\\'green\\')\nSXF*/",
  "/*SXF\n#20 = pre_defined_colour_feature(\\'white\\')\nSXF*/",
  "/*SXF\n#30 = pre_defined_font_feature(\\'continuous\\')\nSXF*/",
  "/*SXF\n#40 = width_feature('0.130000')\nSXF*/",
  "/*SXF\n#45 = line_feature('1','1','1','1','0','0','5','5')\nSXF*/",
  "/*SXF\n#50 = line_feature('1','8','1','1','0','0','10','10')\nSXF*/"
].join("\n");
const noBlackStyle=context.getSxfRasterBoundaryStyle(noBlackSource);
if(noBlackStyle.colorCode!==8||noBlackStyle.lineTypeCode!==1||noBlackStyle.widthCode!==1){
  throw new Error("raster boundary did not reuse the valid source style when black is undefined");
}
const batchExporter=html.slice(html.indexOf("function addAerialImageReferencesToSfc"),html.indexOf("async function buildAerialSfcSidecarExport"));
if(/polyline_feature\('\$\{layerCode\}','1','1','1'/.test(batchExporter)){
  throw new Error("batch raster export still hard-codes SXF style code 1");
}
if(!batchExporter.includes("rasterStyle.colorCode")||!batchExporter.includes("rasterStyle.lineTypeCode")||!batchExporter.includes("rasterStyle.widthCode")){
  throw new Error("batch raster export does not use the validated source style");
}
const rasterStyleDeclaration=batchExporter.indexOf("const rasterStyle=getSxfRasterBoundaryStyle(text);");
const rasterStyleUse=batchExporter.indexOf("rasterStyle.colorCode");
if(rasterStyleDeclaration<0||rasterStyleUse<0||rasterStyleDeclaration>rasterStyleUse){
  throw new Error("batch raster style is not validated before use");
}

const source=[
  "/*SXF\n#1 = sfig_org_feature('MAIN','3')\nSXF*/",
  "/*SXF\n#2 = sfig_locate_feature('0','MAIN','0','0','0','1','1')\nSXF*/",
  "/*SXF\n#3 = drawing_sheet_feature('A3')\nSXF*/"
].join("\n");
const assembled=context.insertAerialSxfAssemblyRecords(source,["RASTER_DEFINITION"],["RASTER_PLACEMENT"]);
const order=["sfig_org_feature","RASTER_DEFINITION","RASTER_PLACEMENT","sfig_locate_feature","drawing_sheet_feature"].map(token=>assembled.indexOf(token));
if(order.some(index=>index<0)||order.some((index,item)=>item>0&&index<=order[item-1])){
  throw new Error("aerial raster SXF assembly order changed");
}

console.log("OK: aerial raster rotation, valid SXF style, corner order and assembly order are preserved");
