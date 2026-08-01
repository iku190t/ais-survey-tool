const fs = require("fs");

const source = fs.readFileSync("index.html", "utf8");
const checks = [
  ["写真帳ボタン", /id="photoAlbumBtn"[^>]*>写真帳Excel</],
  ["6形式", /value="2"[\s\S]*value="3"[\s\S]*value="4"[\s\S]*value="6"[\s\S]*value="8"[\s\S]*value="spread"/],
  ["コメント3行", /id="photoAlbumComment1"[\s\S]*id="photoAlbumComment2"[\s\S]*id="photoAlbumComment3"/],
  ["豆図選択", /id="photoAlbumMiniMap"[^>]*type="checkbox"/],
  ["元写真のセッション保持", /const photoSourceFiles = new Map\(\)/],
  ["写真の縦横比維持", /function fitPhotoAlbumImage\(image,rect\)/],
  ["豆図の写真番号中央", /fillText\(String\(item\.number\|\|""\),width\/2,height\/2\+1\)/],
  ["A4縦", /paperSize="9" orientation="portrait"/],
  ["グリッド線非表示", /showGridLines="0"/],
  ["手動改ページ", /<rowBreaks count=/],
  ["画像埋込み", /<xdr:twoCellAnchor editAs="oneCell">/],
  ["見開き表裏反転", /const front=page%2===0,photoColStart=front\?1:7/],
  ["既存一覧Excel維持", /async function buildPhotoListXlsx\(\)/],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(source)) throw new Error(`Missing: ${label}`);
}

const start = source.indexOf("<script>", source.indexOf("shp.min.js"));
const end = source.indexOf("</script>", start);
if (start < 0 || end < 0) throw new Error("Main script not found");
new Function(source.slice(start + 8, end));

console.log(`photo album checks passed (${checks.length})`);
