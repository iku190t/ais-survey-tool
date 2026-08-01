const fs=require("fs");
const vm=require("vm");

const html=fs.readFileSync(__dirname+"/index.html","utf8");
const start=html.indexOf("function getAerialRasterPaperCorners");
const end=html.indexOf("function addAerialImageReferenceToSfc",start);
if(start<0||end<=start)throw new Error("aerial raster corner helper is missing");

const context={Math,Number};
context.planeToSfcWorld=(xNorth,yEast)=>({x:xNorth/1000,y:yEast/1000});
context.sxfAffinePoint=(matrix,x,y)=>[
  matrix.a*x+matrix.c*y+matrix.e,
  matrix.b*x+matrix.d*y+matrix.f
];
vm.createContext(context);
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
if(!html.includes("getAerialRasterPaperCorners(bounds,planePolygon,displayToPaper)"))throw new Error("single raster export lost its selection polygon");
if(!html.includes("getAerialRasterPaperCorners(spec.bounds,spec.planePolygon,displayToPaper)"))throw new Error("batch raster export lost its selection polygon");

console.log("OK: aerial raster rotation and corner order are preserved");
