const fs=require("fs");

const source=fs.readFileSync("index.html","utf8");
const checks=[
  ["GPS詳細の透過率30%",/id="gpsBox"[\s\S]*background:rgba\(20,20,20,\.7\)/],
  ["1m未満だけ小数第2位",/function formatGpsAccuracyMeters\(value\)[\s\S]*accuracy<1\?accuracy\.toFixed\(2\):String\(Math\.round\(accuracy\)\)/],
  ["DEM1AからDEM5Aの順で取得",/for\(const source of PROFILE_DEM_SOURCES\)[\s\S]*source\.id!=="DEM1A"&&source\.id!=="DEM5A"[\s\S]*sampleDemElevationBilinear\(lat,lon,source\)/],
  ["DEM欠損時の連続再取得を抑制",/const fresh=cache\.checked===true&&distance<=3&&Date\.now\(\)-cache\.updatedAt<15000/],
  ["GPS標高をDEM標高へ変更",/const elevationLabel=gpsPosition\.demSource\?`\$\{gpsPosition\.demSource\}標高`:'DEM標高'/],
  ["GPS更新時にDEM取得",/applyCachedGpsDemElevation\(gpsPosition\);[\s\S]*void refreshGpsDemElevation\(lat,lon\);/],
  ["写真帳は拡張子と項目名なしでファイル名だけ表示",/if\(field==="fileName"\)return String\(item\.fileName\|\|""\)\.replace\(\/\\\.\[\^\.\]\+\$\/u,""\)/]
];
for(const [label,pattern] of checks)if(!pattern.test(source))throw new Error(`Missing: ${label}`);

const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(code=>code.trim());
for(const code of scripts)new Function(code);

console.log(`GPS detail DEM checks passed (${checks.length})`);
