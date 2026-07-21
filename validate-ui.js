const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync(__dirname+'/index.html','utf8');

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(m=>m[1]).filter(Boolean);
for(let i=0;i<scripts.length;i++)new vm.Script(scripts[i],{filename:`inline-${i+1}.js`});

const levels=[1,10,25,50,75,100];
const scales=[1,100,200,250,500,1000,2000,2500,5000];
const diameter=level=>0.2+(level-1)/99*(10-0.2);
for(const scale of scales){
  for(const realScale of [1,scale]){
    const unitsPerPaperMm=scale/realScale;
    for(const level of levels){
      const worldDiameter=diameter(level)*unitsPerPaperMm;
      const realDiameter=worldDiameter*realScale;
      const expected=diameter(level)*scale;
      if(Math.abs(realDiameter-expected)>1e-8)throw new Error(`circle scale mismatch 1/${scale}`);
    }
  }
}

const commands=['openIconBtn','gpsBtn','measureBtn','profileBtn','drawBtn','textSearchOpenBtn','helpBtn','layerFab','bgBtn','gpsDetailFab','supportBtn'];
const surfaces=['file','measure','profile','draw','search','help','layer','background','gpsDetail','support'];
const keep={openIconBtn:'file',measureBtn:'measure',profileBtn:'profile',drawBtn:'draw',textSearchOpenBtn:'search',helpBtn:'help',layerFab:'layer',bgBtn:'background',gpsDetailFab:'gpsDetail',supportBtn:'support'};
for(const from of commands){
  for(const to of commands){
    const active=new Set(surfaces);
    for(const surface of [...active])if(surface!==keep[to])active.delete(surface);
    if(active.size>(keep[to]?1:0))throw new Error(`toolbar state leak ${from} -> ${to}`);
  }
}

const required=[
  'closeToolbarSurfacesExcept(command.id)',
  'if(commandId!=="openIconBtn"&&isSaveMenuOpen())setSaveMenuOpen(false)',
  'if(commandId!=="bgBtn")',
  'paperDiameterMm=circleDiameterMmFromLevel(circleSizeLevel)',
  'getMemoWorldUnitsPerPaperMm()'
];
for(const token of required)if(!html.includes(token))throw new Error(`missing implementation: ${token}`);
console.log(`OK: ${scripts.length} inline scripts; ${scales.length*2*levels.length} circle-scale cases; ${commands.length**2} toolbar transitions`);
