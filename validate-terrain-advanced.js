require('./terrain-advanced.js');

const rows=41,cols=41,points=[];
for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const x=row-20,y=col-20;
  let elevation=100+Math.sin(x/5)*1.8+Math.cos(y/6)*1.3-Math.hypot(x,y)*.03;
  if(row>=13&&row<=26&&col>=14&&col<=27)elevation=102.4+(row-13)*.005;
  elevation-=Math.exp(-Math.pow(col-row*.35-9,2)/5)*1.4;
  points.push({row,col,sx:8+col*4,sy:8+row*4,worldX:col*1000,worldY:row*1000,plane:{xNorth:row,yEast:col},elevation,source:'DEM1A'});
}
const grid={rows,cols,points,width:176,height:176,gridPurpose:'surface'};
const modes=[...globalThis.EzTerrainAdvanced.modes];

(async()=>{
  for(const mode of modes){
    const result=await globalThis.EzTerrainAdvanced.prepare(mode,grid,{inundationFraction:.3});
    if(!result||result.mode!==mode)throw new Error(`${mode}: result missing`);
    if(result.raster?.pixels?.length!==rows*cols*4)throw new Error(`${mode}: raster size mismatch`);
    let visible=0;
    for(let index=3;index<result.raster.pixels.length;index+=4)if(result.raster.pixels[index])visible++;
    if(!visible)throw new Error(`${mode}: no visible pixels`);
    const legend=globalThis.EzTerrainAdvanced.legend(mode,result);
    if(!legend)throw new Error(`${mode}: legend missing`);
  }
  console.log(`OK: ${modes.length} advanced terrain modes`);
})().catch(error=>{console.error(error);process.exitCode=1;});
