# 回帰テスト一覧

最終実行: 2026-08-22 / `44f1777`
実行方法: リポジトリ直下でNode.jsを使い `node <script>`。`validate-real-sfc-rendering.js` だけ入力SFCが必要。

## 変更領域ごとの必須テスト

|変更領域|最低限実行するテスト|
|---|---|
|法務局地図・境界|`validate-registry-progress-cancel.js`、`validate-registry-append-and-intersection.js`、`validate-registry-cad.js`、`validate-registry-layer-colors.js`|
|基盤地図2500|`validate-foundation-map-gml.js`、`validate-foundation-map-import.js`、`validate-base-map-toggle.js`|
|写真読込・削除・位置|`validate-photo-album.js`、`validate-photo-album-runtime.js`、`validate-photo-network-import.js`、`validate-photo-position-adjustment.js`|
|Excel写真帳・QR|`validate-photo-album.js`、`validate-photo-album-runtime.js`、`validate-google-maps-links.js`|
|パン・拡大縮小・ヒット|`validate-performance-indexes.js`、`validate-pc-object-interaction.js`、`validate-coordinate-inspect.js`|
|自動保存・レイヤー色・SFC保存|`validate-recovery-autosave.js`、`validate-real-sfc-rendering.js sample.sfc`|
|DEM・等高線・地形解析|`validate-terrain-advanced.js`、`validate-terrain-ui.js`、`validate-contour-text-horizontal.js`、`validate-contour-label-raster-quality.js`|
|現在地・GPS|`validate-gps-startup-mode.js`、`validate-gps-detail-dem.js`|
|スマホ方位追従・ホーム|`validate-compass-follow.js`、`validate-performance-indexes.js`、`validate-gps-startup-mode.js`|
|PCツールバー・ポップアップ|`validate-pc-map-toolbar.js`、`validate-pc-object-interaction.js`、`validate-text-layer-ui.js`|
|スマホタッチ|`validate-mobile-touch.js`、`validate-gps-startup-mode.js`|
|SFC/SFZ・ラスター|`validate-real-sfc-rendering.js <実ファイル>`、`validate-raster-placement.js`、`validate-ui.js`|
|広いUI変更|上記関連テストに加え `validate-ui.js`、`validate-real-sfc-rendering.js sample.sfc`|

## 2026-08-22 実行結果

### 成功

- `validate-registry-progress-cancel.js`
- `validate-registry-append-and-intersection.js`
- `validate-registry-cad.js`
- `validate-registry-layer-colors.js`
- `validate-recovery-autosave.js`
- `validate-performance-indexes.js`
- `validate-photo-album.js` — 70 checks
- `validate-photo-album-runtime.js`
- `validate-gps-startup-mode.js`
- `validate-compass-follow.js` — GPS非依存の初期開始、iPhoneのファイル選択時許可先取り、方位ボタンの直接ON/OFF、Android/WebViewの非absolute方位、45ms応答の滑らかな補間、ホーム停止と初期角度復帰を確認。3回連続成功。
- `validate-terrain-advanced.js` — 11 modes
- `validate-terrain-ui.js` — 16 buttons
- `validate-text-layer-ui.js`
- `validate-real-sfc-rendering.js sample.sfc`
- `validate-base-map-toggle.js`
- `validate-contour-label-raster-quality.js`
- `validate-contour-text-horizontal.js`
- `validate-control-point-buttons.js`
- `validate-coordinate-inspect.js`
- `validate-default-settings.js`
- `validate-foundation-map-gml.js`
- `validate-foundation-map-import.js`
- `validate-google-maps-links.js`
- `validate-map-attribution-registry.js`
- `validate-pc-map-toolbar.js`
- `validate-pc-object-interaction.js`
- `validate-photo-network-import.js`
- `validate-photo-position-adjustment.js`

### 既知の失敗・要調査

- `validate-gps-detail-dem.js` — ファイル名表示の古い正規表現。実行時写真帳テストは拡張子なしを確認。
- `validate-background-sxf.js` — 旧 `backgroundSxfOpenBtn` を要求。
- `validate-mobile-touch.js` — ソース改行の完全一致で停止。
- `validate-raster-placement.js` — テスト環境に `flattenSxfFeatureBlocks` が無く停止。
- `validate-ui.js` — 旧ラスター名テンプレートの完全一致で停止。

詳細は `PROJECT_STATE.md` と `INCIDENTS.md` の `INC-OPEN-01` を参照する。

## 実ファイル検証の原則

- SFC/SFZ互換修正では、構文チェックだけで完了にしない。
- 少なくともEZ Viewer再読込を行う。可能ならV-NASとTREND-ONEでも確認する。
- 文字角度、配置、ラスター、複合図形、ハッチは正常な他CAD出力との差分を確認する。
- 実ファイル名、図面内容、座標、画像はこの文書へ記録しない。

## 合格報告の書き方

- 実行したコマンドと終了コードを書く。
- 成功数だけでなく、失敗したテスト名と既存失敗か新規失敗かを書く。
- 実行していない確認を「問題なし」と書かない。
- 目視だけの場合は `観察`、自動テストと実データ確認まで行った場合は `検証済み` とする。
