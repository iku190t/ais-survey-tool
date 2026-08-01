const fs = require("fs");

const source = fs.readFileSync("index.html", "utf8");
const checks = [
  ["写真帳ボタン", /id="photoAlbumBtn"[^>]*>写真帳Excel</],
  ["6形式", /value="2"[\s\S]*value="3"[\s\S]*value="4"[\s\S]*value="6"[\s\S]*value="8"[\s\S]*value="spread"/],
  ["コメント3行", /id="photoAlbumComment1"[\s\S]*id="photoAlbumComment2"[\s\S]*id="photoAlbumComment3"/],
  ["豆図選択", /id="photoAlbumMiniMap"[^>]*type="checkbox"/],
  ["新規の既定コメント", /comment1:"number",comment2:"fileName",comment3:"capturedAt"/],
  ["撮影方向8方位", /const labels=\["北へ","北東へ","東へ","南東へ","南へ","南西へ","西へ","北西へ"\]/],
  ["6枚8枚の豆図無効化", /const disabled=layout==="6"\|\|layout==="8";[\s\S]*mini\.disabled=disabled/],
  ["6枚8枚では豆図を生成しない", /const useMiniMap=!!settings\.miniMap&&!compact/],
  ["豆図設定の保持", /dataset\.preferred=settings\.miniMap\?"true":"false"/],
  ["元写真のセッション保持", /const photoSourceFiles = new Map\(\)/],
  ["写真の縦横比維持", /function fitPhotoAlbumImage\(image,rect\)/],
  ["豆図の写真番号中央", /fillText\(String\(item\.number\|\|""\),width\/2,height\/2\+1\)/],
  ["豆図の撮影方向矢印", /const directionVector=photoDirectionWorldVector\(item\)/],
  ["豆図80パーセント", /width:area\.width\*\.8,height:area\.height\*\.8/],
  ["A4縦", /paperSize="9" orientation="portrait"/],
  ["グリッド線非表示", /showGridLines="0"/],
  ["行列見出し非表示", /showRowColHeaders="0"/],
  ["印刷ページ中央", /printOptions horizontalCentered="1" verticalCentered="1"/],
  ["手動改ページ", /<rowBreaks count=/],
  ["画像埋込み", /<xdr:twoCellAnchor editAs="oneCell">/],
  ["片面は写真左コメント右", /photoColStart=isSpread\?\(front\?1:6\):1,photoColEnd=isSpread\?\(front\?7:12\):7/],
  ["見開き表裏反転", /commentColStart=isSpread\?\(front\?8:1\):8,commentColEnd=isSpread\?\(front\?12:5\):12/],
  ["2枚から4枚は写真を枠いっぱいに配置", /merge\(slotTop\+1,photoColStart,slotBottom,photoColEnd,"",4\)/],
  ["コメント欄の点線", /bottom style="dotted"/],
  ["写真一覧のファイル名列を縮小", /nth-child\(3\)[^\n]*width:112px/],
  ["6枚8枚もコメント3行", /fields\.forEach\(\(field,line\)=>merge\(photoEnd\+1\+line/],
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
