const assert=require("assert");
const foundation=require("./foundation-map-gml.js");

assert.strictEqual(foundation.secondMeshCode(34.0700,134.5500),"513404");
assert.deepStrictEqual(
  foundation.meshCodesForBounds({minLat:34.07,maxLat:34.071,minLon:134.55,maxLon:134.551}),
  ["513404"]
);

const xml=`<?xml version="1.0" encoding="UTF-8"?>
<Dataset xmlns="http://fgd.gsi.go.jp/spec/2008/FGD_GMLSchema" xmlns:gml="http://www.opengis.net/gml/3.2">
  <RdEdg><fid>road-2500</fid><orgGILvl>2500</orgGILvl><loc><gml:Curve><gml:segments><gml:LineStringSegment><gml:posList>34.0000 134.0000 34.0100 134.0100</gml:posList></gml:LineStringSegment></gml:segments></gml:Curve></loc></RdEdg>
  <BldL><fid>building-25000</fid><orgGILvl>25000</orgGILvl><loc><gml:Curve><gml:segments><gml:LineStringSegment><gml:posList>34.0000 134.0000 34.0100 134.0100</gml:posList></gml:LineStringSegment></gml:segments></gml:Curve></loc></BldL>
  <RailCL><fid>rail-unknown</fid><loc><gml:Curve><gml:segments><gml:LineStringSegment><gml:posList>34.0000 134.0000 34.0100 134.0100</gml:posList></gml:LineStringSegment></gml:segments></gml:Curve></loc></RailCL>
</Dataset>`;

const seen=new Set();
const parsed=foundation.parseGmlText(xml,{
  maxSourceLevel:2500,
  bounds:{minX:34.002,minY:134.002,maxX:34.008,maxY:134.008},
  toPlane:(lat,lon)=>({x:lat,y:lon}),
  toWorld:(x,y)=>({x:x*1000,y:y*1000}),
  seenFeatureIds:seen
});
assert.strictEqual(parsed.strokes.length,1);
assert.strictEqual(parsed.strokes[0].kind,"road");
assert.ok(Math.abs(parsed.strokes[0].points[0].x-34002)<1e-6);
assert.ok(Math.abs(parsed.strokes[0].points.at(-1).y-134008)<1e-6);
assert.strictEqual(parsed.stats.skippedCoarse,1);
assert.strictEqual(parsed.stats.skippedUnknownLevel,1);

const duplicate=foundation.parseGmlText(xml,{
  maxSourceLevel:2500,
  bounds:{minX:34,minY:134,maxX:35,maxY:135},
  toPlane:(lat,lon)=>({x:lat,y:lon}),
  toWorld:(x,y)=>({x,y}),
  seenFeatureIds:seen
});
assert.strictEqual(duplicate.strokes.length,0);
assert.strictEqual(duplicate.stats.skippedDuplicate,3);

console.log("Foundation GML 2500 parser validation passed.");
