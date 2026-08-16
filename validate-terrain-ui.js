const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(Boolean);
for(let index=0;index<scripts.length;index++)new vm.Script(scripts[index],{filename:`inline-${index+1}.js`});

const modes={
  elevation:'標高',slope:'傾斜角',contour:'等高線',flow:'流向',accumulation:'集水',volume:'概算土量',
  multihillshade:'多方向陰影',localrelief:'局所起伏',openness:'開度',curvature:'曲率強調',
  microterrain:'微地形合成',ridgevalley:'尾根・谷',flatland:'平坦面候補',artificial:'人工地形候補',
  viewshed:'見通し',inundation:'浸水参考'
};
for(const [mode,label] of Object.entries(modes)){
  if(!html.includes(`data-terrain-mode="${mode}"`))throw new Error(`${mode}: button missing`);
  if(!html.includes(`${mode}:"${label}"`))throw new Error(`${mode}: label missing`);
}
if(!html.includes('<script src="terrain-advanced.js?v=2"></script>'))throw new Error('advanced terrain script missing');
if(!html.includes('window.EzTerrainAdvanced?.draw?.(ctx,grid,terrainDerived,staleViewport,worldToScreen)'))throw new Error('advanced terrain draw hook missing');
if(!html.includes('gridPurpose:"advanced"'))throw new Error('meter-based advanced grid missing');
if(!html.includes('fillTerrainPointsByDemPriority(points,120)'))throw new Error('DEM1A-first advanced sampling missing');
if(!html.includes('terrainDerived=null'))throw new Error('single-result memory release missing');
if(!html.includes('terrainInundationSlider?.addEventListener("input"'))throw new Error('inundation control missing');
console.log(`OK: ${Object.keys(modes).length} terrain buttons and inline syntax`);
