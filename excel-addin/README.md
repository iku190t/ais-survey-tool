# EZ SFC Excelアドイン

既存EZビューアのSFC解析・Canvas描画をそのまま利用し、選択したExcelセル範囲へ高解像度PNGを挿入するOfficeアドインです。

## 保護方針

- `../index.html` の解析・描画コードは変更しません。
- ビルド時にEZビューアを `viewer.html` としてコピーし、`viewer-bridge.js` と専用CSSだけを生成物へ追加します。
- Excel用の解析処理は実装しません。SFC読込は既存の `handleSelectedDrawingFile` を呼び出します。

## ビルド

```powershell
cd excel-addin
npm run build
npm test
```

公開中のEZビューアをそのまま基準にする場合は、その `index.html` を引数に指定します。

```powershell
node build.mjs C:\path\to\published-viewer\index.html
```

成果物は `excel-addin/dist` に生成されます。公開時はこのディレクトリを公開サイトの `/excel-addin/` に配置し、`manifest.xml` をExcelへ登録します。

## 操作

1. Excelで挿入先のセル範囲または結合セルを選択します。
2. 「Excelの選択範囲を取得」を押します。
3. SFCを選択し、X・Y座標と表示範囲を入力します。
4. プレビュー内で図面または赤い座標マーカーをドラッグし、ホイールで倍率を調整します。
5. 「選択範囲へ挿入」を押します。

挿入画像の代替テキストには基準座標、倍率、オフセット、元ファイル名をJSONで保存します。
