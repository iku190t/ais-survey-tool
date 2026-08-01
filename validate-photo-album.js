const fs = require("fs");

const source = fs.readFileSync("index.html", "utf8");
const checks = [
  ["Excel出力の2択", /id="photoExcelBtn"[^>]*>Excel出力<[\s\S]*id="photoExcelListChoiceBtn"[^>]*>一覧表を出力<[\s\S]*id="photoExcelAlbumChoiceBtn"[^>]*>写真帳を出力</],
  ["6形式", /value="2"[\s\S]*value="3"[\s\S]*value="4"[\s\S]*value="6"[\s\S]*value="8"[\s\S]*value="spread"/],
  ["コメント3行", /id="photoAlbumComment1"[\s\S]*id="photoAlbumComment2"[\s\S]*id="photoAlbumComment3"/],
  ["自由入力3行", /id="photoAlbumCustom1"[\s\S]*id="photoAlbumCustom2"[\s\S]*id="photoAlbumCustom3"/],
  ["自由入力欄の切替", /function updatePhotoAlbumCustomInputVisibility\(focusInput=false\)[\s\S]*const visible=select\.value==="blank"/],
  ["自由入力を全写真へ反映", /if\(field==="blank"\)return String\(customText\|\|""\)/],
  ["豆図選択", /id="photoAlbumMiniMap"[^>]*type="checkbox"/],
  ["新規の既定コメント", /comment1:"number",comment2:"fileName",comment3:"capturedAt"/],
  ["撮影方向8方位", /const labels=\["北へ","北東へ","東へ","南東へ","南へ","南西へ","西へ","北西へ"\]/],
  ["6枚8枚の豆図無効化", /const disabled=layout==="6"\|\|layout==="8";[\s\S]*mini\.disabled=disabled/],
  ["3枚と見開きでも豆図を生成", /const miniMapAllowed=isSpread\|\|photosPerPage<=4;[\s\S]*const useMiniMap=!!settings\.miniMap&&miniMapAllowed/],
  ["豆図設定の保持", /dataset\.preferred=settings\.miniMap\?"true":"false"/],
  ["元写真のセッション保持", /const photoSourceFiles = new Map\(\)/],
  ["写真の縦横比維持", /function fitPhotoAlbumImage\(image,rect\)/],
  ["豆図の写真番号中央", /fillText\(String\(item\.number\|\|""\),width\/2,height\/2\+1\)/],
  ["豆図の撮影方向矢印", /const directionVector=photoDirectionWorldVector\(item\)/],
  ["豆図を配置数に応じて拡大", /const marginRatio=rowsPerPage<=2\?\.025:rowsPerPage<=3\?\.04:\.065/],
  ["豆図を高解像度生成", /Math\.max\(720,Math\.round\(miniRect\.width\*3\)\)/],
  ["豆図を濃く鮮明に描画", /strokeStyle="#26313b"/],
  ["A4縦", /paperSize="9" orientation="portrait"/],
  ["グリッド線非表示", /showGridLines="0"/],
  ["行列見出し非表示", /showRowColHeaders="0"/],
  ["印刷ページ中央", /printOptions horizontalCentered="1" verticalCentered="1"/],
  ["手動改ページ", /<rowBreaks count=/],
  ["画像埋込み", /<xdr:twoCellAnchor editAs="oneCell">/],
  ["片面は写真左コメント右", /photoColStart=isSpread\?\(front\?1:11\):\(front\?1:8\)/],
  ["見開き表裏で大きい写真欄を反転", /photoColEnd=isSpread\?\(front\?15:25\)[\s\S]*commentColStart=isSpread\?\(front\?17:1\)[\s\S]*commentColEnd=isSpread\?\(front\?25:9\)/],
  ["3枚は写真欄をさらに拡大", /const threePhotoLayout=!isSpread&&photosPerPage===3;[\s\S]*photoColumnPx=threePhotoLayout\?78:[\s\S]*commentColumnPx=threePhotoLayout\?42:/],
  ["見開きは25列で写真欄を拡大", /const spreadColumnWidthsPx=\[\.\.\.Array\(9\)\.fill\(28\),13,\.\.\.Array\(5\)\.fill\(40\),13,\.\.\.Array\(9\)\.fill\(28\)\]/],
  ["2枚3枚は上下余白を縮小", /const photoInsetY=photosPerPage<=3\?1:photosPerPage===4\?4:2/],
  ["4枚は写真間隔を拡大", /photosPerPage===4\?4:2/],
  ["2枚から4枚の写真セル罫線を除去", /merge\(slotTop\+1,photoColStart,slotBottom,photoColEnd,"",1\)/],
  ["写真とコメントの1ミリ間隔列", /<col min="7" max="7" width="1" customWidth="1"\/>/],
  ["写真画像に黒0.5pt枠", /<a:ln w="6350"><a:solidFill><a:srgbClr val="000000"\/>/],
  ["コメントの塗りつぶしなし", /<fills count="2">/],
  ["コメント点線を結合範囲全体へ適用", /const mergeComment=[\s\S]*for\(let row=row1;row<=row2;row\+\+\)for\(let col=col1;col<=col2;col\+\+\)/],
  ["コメント欄の点線", /bottom style="dotted"/],
  ["写真一覧のファイル名列を縮小", /nth-child\(3\)[^\n]*width:112px/],
  ["6枚8枚もコメント3行", /fields\.forEach\(\(field,line\)=>mergeComment\(photoEnd\+1\+line/],
  ["既存一覧Excel維持", /async function buildPhotoListXlsx\(\)/],
  ["PC専用写真位置調整", /function photoPositionAdjustIsActive\(\)[\s\S]*isDesktopPhotoTool\(\)/],
  ["写真位置を座標へ反映", /function applyPhotoAdjustedWorldPosition\(item,worldX,worldY\)[\s\S]*item\.xNorth=plane\.xNorth;item\.yEast=plane\.yEast/],
  ["矢印先端で方向回転", /item\.direction=\(\(Math\.atan2\(dy,dx\)\*180\/Math\.PI\)\%360\+360\)\%360/],
  ["調整後の8方向を一覧Excelへ出力", /["番号","ファイル名","撮影時間","X座標","Y座標","DEM標高","使用DEM","撮影方向"]/],
  ["保存先を生成前に指定", /let saveHandle=null;[\s\S]*showSaveFilePicker[\s\S]*showBusy\("写真帳を作成中…"\)[\s\S]*buildPhotoAlbumXlsx\(settings\)/],
  ["保存先選択失敗時に自動ダウンロードしない", /showToast\("保存先を選択できませんでした",3200\);return;/],
];

for (const [label, pattern] of checks) {
  if (!pattern.test(source)) throw new Error(`Missing: ${label}`);
}

const start = source.indexOf("<script>", source.indexOf("shp.min.js"));
const end = source.indexOf("</script>", start);
if (start < 0 || end < 0) throw new Error("Main script not found");
new Function(source.slice(start + 8, end));

console.log(`photo album checks passed (${checks.length})`);
