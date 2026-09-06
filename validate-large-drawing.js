// Synthetic 20 MiB+ SFC; does not read or modify any customer drawing.
const assert=require('node:assert/strict');
const {createHarness,profiles}=require('./tests/audit-harness.js');
(async()=>{
 const h=await createHarness('ez-large-drawing');
 try{for(const profile of [profiles[0],profiles[2]])await h.run('L01 large SFC chunked load, viewport changes and export preserve geometry',async page=>{
  const result=await page.evaluate(async()=>{
   const count=210000,parts=[auditSource.slice(0,auditSource.indexOf('/*SXF\n#50'))];
   for(let i=0;i<count;i++){
    const x=100000000+(i%1000)*10,y=200000000+Math.floor(i/1000)*10;
    parts.push(`/*SXF\n#${100+i} = line_feature('1','1','1','1','${x.toFixed(3)}','${y.toFixed(3)}','${(x+8).toFixed(3)}','${(y+6).toFixed(3)}')\nSXF*/`);
   }
   const source=parts.join('\n'),file=new File([source],'synthetic-large.sfc');
   const started=performance.now(),ok=await handleSelectedDrawingFile(file),loadMs=performance.now()-started;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const first=data.lines[0].slice(0,4),last=data.lines.at(-1).slice(0,4),drawStarted=performance.now();
   for(const angle of [0,37,90]){setDrawingRotationPreserveCenter(angle);setScaleAroundScreenPoint(canvas.clientWidth/2,canvas.clientHeight/2,view.scale*1.3);draw();}
   const drawMs=performance.now()-drawStarted;
   const bounds=getVisibleWorldBounds(0),visibleLines=data.lines.filter(line=>Math.max(line[0],line[2])>=bounds.minx&&Math.min(line[0],line[2])<=bounds.maxx&&Math.max(line[1],line[3])>=bounds.miny&&Math.min(line[1],line[3])<=bounds.maxy).length;
   inkStrokes=[{type:'freehand',color:'#123456',worldWidthMm:.13,points:[{x:100000000,y:200000000},{x:100000008,y:200000006}]}];
   const exportStarted=performance.now(),out=await buildSfcExportBlobAndNameAsync(),exportMs=performance.now()-exportStarted;
   return window.auditDetails={ok,bytes:file.size,lines:data.lines.length,visibleLines,loadMs,drawMs,exportMs,exportOk:out.ok,sourceUnchanged:loadedSfcText===source,first,last,expectedLast:[100009990,200002090,100009998,200002096],keptFirst:out.ok&&out.text.includes(parts[1]),keptLast:out.ok&&out.text.includes(parts.at(-1)),memoCount:out.ok?parseMemoMetaPayload(out.text).strokes.length:0};
  });
  assert(result.bytes>=20*1024*1024);assert.equal(result.ok,true);assert.equal(result.lines,210000);assert.equal(result.sourceUnchanged,true);
  assert(result.visibleLines>0,'view transforms moved all geometry off screen');
  assert.deepEqual(result.first,[100000000,200000000,100000008,200000006]);assert.deepEqual(result.last,result.expectedLast);
  assert(result.exportOk&&result.keptFirst&&result.keptLast);assert.equal(result.memoCount,1);return result;
 },profile);}finally{await h.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
