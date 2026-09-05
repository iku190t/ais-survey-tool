# 回帰テスト一覧

最終実行: 2026-09-05 / `e70c5b2`
実行方法: リポジトリ直下でNode.jsを使い `node <script>`。`validate-real-sfc-rendering.js` だけ入力SFCが必要。

## 変更領域ごとの必須テスト

|変更領域|最低限実行するテスト|
|---|---|
|SFZ読込・最終SFC保存・写真の座標系・SIMA読込競合/復元・切替保存|`validate-audit-followup-regressions.js` と下記の各領域の既存テスト|
|SIMA背景・画地・水平文字|`validate-sima-import.js`、`validate-sima-performance.js`、`validate-compass-follow.js`、`validate-performance-indexes.js`、`validate-pc-object-interaction.js`、`validate-real-sfc-rendering.js sample.sfc`|
|法務局地図・境界|`validate-registry-progress-cancel.js`、`validate-registry-append-and-intersection.js`、`validate-registry-cad.js`、`validate-registry-layer-colors.js`|
|基盤地図2500|`validate-foundation-map-gml.js`、`validate-foundation-map-import.js`、`validate-base-map-toggle.js`|
|写真読込・削除・位置|`validate-photo-album.js`、`validate-photo-album-runtime.js`、`validate-photo-network-import.js`、`validate-photo-position-adjustment.js`|
|Excel写真帳・QR|`validate-photo-album.js`、`validate-photo-album-runtime.js`、`validate-google-maps-links.js`|
|パン・拡大縮小・ヒット|`validate-performance-indexes.js`、`validate-pc-object-interaction.js`、`validate-coordinate-inspect.js`|
|自動保存・前回作業復元・レイヤー色・SFC保存|`validate-recovery-autosave.js`、`validate-last-work-recovery.js`、`validate-real-sfc-rendering.js sample.sfc`|
|DEM・等高線・地形解析|`validate-terrain-advanced.js`、`validate-terrain-ui.js`、`validate-contour-text-horizontal.js`、`validate-contour-label-raster-quality.js`|
|現在地・GPS|`validate-gps-startup-mode.js`、`validate-gps-detail-dem.js`、`validate-japan-plane-zones.js`、`validate-japan-plane-zone-runtime.js`、`validate-audit-regressions.js`|
|Drogger座標登録・専用Android FIX|`validate-android-drogger-bridge.js`、`validate-drogger-geoid-model.js`、`validate-drogger-owner-mode.js`、`validate-drogger-owner-runtime.js`、`validate-gps-startup-mode.js`、`validate-recovery-autosave.js`、`validate-last-work-recovery.js`、`validate-real-sfc-rendering.js sample.sfc`|
|Android SFC・座標CSV共有|`validate-android-sfc-share.js`、`validate-drogger-owner-mode.js`、`validate-drogger-owner-runtime.js`、`validate-last-work-recovery.js`、`validate-real-sfc-rendering.js sample.sfc`。APK変更時は `gradlew.bat assembleDebug` 後、実機でループバックPOSTとAndroid `ChooserActivity` を確認する。|
|スマホ方位追従・ホーム|`validate-compass-follow.js`、`validate-performance-indexes.js`、`validate-gps-startup-mode.js`|
|PCツールバー・ポップアップ|`validate-pc-map-toolbar.js`、`validate-pc-object-interaction.js`、`validate-text-layer-ui.js`|
|PCの最近開いた図面|`validate-recent-drawings.js`、`validate-pc-map-toolbar.js`|
|スマホタッチ|`validate-mobile-touch.js`、`validate-gps-startup-mode.js`|
|スマホ縦・横画面|`validate-mobile-landscape.js`、`validate-gps-startup-mode.js`、`validate-compass-follow.js`、`validate-default-settings.js`、`validate-real-sfc-rendering.js sample.sfc`|
|SFC/SFZ・ラスター|`validate-real-sfc-rendering.js <実ファイル>`、`validate-raster-placement.js`、`validate-ui.js`|
|ライセンス・著作権表示|`validate-open-source-license.js`、`validate-real-sfc-rendering.js sample.sfc`|
|広いUI変更|上記関連テストに加え `validate-ui.js`、`validate-real-sfc-rendering.js sample.sfc`|

## 2026-09-05 追加監査8項目修正後の実行結果

- 全48本: 46成功、2失敗。旧 `backgroundSxfOpenBtn` と旧ラスター名等で停止する既存2本は同じ失敗。今回の新規失敗はなし。
- `validate-audit-followup-regressions.js`: 合成データ13ケースをPC・Android相当・iPhone相当で実行し39ケース成功。外部通信と実位置情報は使わない。モバイルはChromeの画面・タッチ・UA模擬で、実機Safari/Androidの検証ではない。
- 正常/不正/展開失敗SFZ、Drogger/法務局文字の最終保存、不正な件数不足の拒否、GPSのみの保存ボタンとAndroid共有ZIP準備、1/500の保存往復、標高2桁/登録3桁、写真系一致、SIMAの新旧読込競合とSFC切替取消、SFC＋SIMAの最新作業復元と同一SFC再読込、表示設定と元データ1回保存、即時図面切替のレイヤー保持、キー別保存待機を確認。
- `validate-drogger-owner-mode.js` の200,001標高値と既存Drogger実行時試験、写真・地形・現在地・方位・性能・同梱SFCも再実行。実Drogger・外部CAD・実メールアプリは未確認。
- `EZ_VIEWER_TEST_URL` を設定すると同じ追加監査の実行時試験を指定された配信URLで行える。通常はローカルサーバー。公開確認も新規の隔離ブラウザ内で合成データだけを使う。

## 2026-09-05 標高表示修正後の実行結果（先行修正）

- 全47本: 45成功、2失敗。旧 `backgroundSxfOpenBtn` と旧ラスター名等の前提で停止する2本は同じ失敗。今回の新規失敗はなし。
- `validate-drogger-owner-mode.js`: 200,001件のミリ単位標高を整数基準の期待値と照合。正負・欠測・ゼロ・切り捨て境界、新規ラベル2桁、登録値不変、CSV3桁を検証。
- `validate-drogger-owner-runtime.js`: 図面あり／なしの両方で、保存済みの誤ラベル `2.00` を登録値 `2.010` から `2.01` と描画する。登録情報・ラベル位置・寸法等が変更されないことをJSON比較で確認。
- 座標系、方位、パン、SIMA、写真、復元など既存回帰も実行。Drogger実信号・実端末は対象外。最終SFC保存の別不具合を成功扱いにする検証ではない。

## 2026-09-05 地域判定修正後の実行結果

- 全 `validate-*.js` 47本：45成功、2失敗。入力が必要な実SFC検証は同梱 `sample.sfc` を使用。
- 失敗は `validate-background-sxf.js`（旧 `backgroundSxfOpenBtn`）と `validate-ui.js`（旧ラスター名等の前提）。検証を省略・成功扱いにしていない。
- 新規 `validate-japan-plane-zones.js`：全19系76地点、座標データ未読込時、範囲外、実際の選択関数への接続を検証。外部通信を許さないVMでも成功。
- 新規 `validate-japan-plane-zone-runtime.js`：モバイル相当ブラウザのGPS単独III系、SFC手動IV系の保持、GPSの一時III系と解除時のIV系復帰、SFC元データ不変、パン等20回で地域判定0回。CPU4倍抑制で初回約26～30ms。
- 元の公開行政区域内に生成した9,668地点を別途照合し、系の不一致0。顧客データは検証記録へ保存していない。
- GPS詳細、タッチ、ラスター、Drogger版番号、写真の初期化待機の5本はテストハーネスの前提を修正し成功。アプリを旧UIへ戻していない。
- SIMA性能：800画地・6,400点で初回約213ms、全体描画約43ms、拡大描画約13ms。PC上の実測値であり実機保証ではない。
- `git diff --check` 成功。iPhone/Android/Drogger実機・外部CADは未実施。

## 2026-08-31 実行結果

### 成功

- `validate-mobile-landscape.js` — 縦固定メタ・マニフェスト・JavaScriptロックの解除、844×390横画面で遮断画面が出ないこと、PC専用の写真位置が非表示であること、左側2列ツールバーのボタン順・48px寸法・全高灰色領域・最下部ロゴ、図面と起動ポップアップの残り領域、レイヤー・詳細・Undo・Redo・現在地・方位・ストリートビューの上端配置を確認。縦画面から横画面、再び縦画面へ戻して従来の全幅配置へ復帰することも確認。
- `validate-sima-import.js` — 大文字 `.SIM` とバイナリMIME、D00種別2の地番除外、閉画地件数、SIMA単独ホーム、現在地解除時の表示復帰、37度・116度回転時の画面水平文字、境界線上の測点名が線外の最短候補へ移ることを確認。
- `validate-sima-performance.js` — 約1MB相当の800画地・6,400測点を読み込み、空間索引、全体表示時の点名段階表示、5倍拡大時の表示対象縮小を確認。並列回帰実行時に初回読込約0.29秒、全体描画約0.054秒、拡大後描画約0.016秒。
- `validate-gps-startup-mode.js` — SFC従来経路の現在地状態復元が維持されることを確認。
- `validate-compass-follow.js`
- `validate-performance-indexes.js`
- `validate-pc-object-interaction.js`
- `validate-pc-map-toolbar.js` — PCのSIMAボタン、画地境界＋測点アイコン、スマホでの非表示、スマホ背景内のSIMA導線を確認。
- `validate-default-settings.js`
- `validate-real-sfc-rendering.js sample.sfc`

### 新規失敗

- なし。

### 既知の既存失敗

- `validate-mobile-touch.js` — 既知のソース改行完全一致で失敗。今回変更したSIMA実行経路とは別で、製品不具合を示す新規失敗ではない。

### 未実施

- iPhone実機のFiles画面は自動テスト対象外。SFCと同じファイル選択MIME指定とブラウザ内の大文字 `.SIM` 読込まで検証済み。

## 2026-08-30 実行結果

### 成功

- `validate-sima-import.js` — 公式例に沿うA01/D00/B01の解析、引用符付き項目、画面内画地への地番名追従、37度回転時の地番名・点名の画面水平、PC・スマホ共通UIを確認。
- `validate-compass-follow.js`
- `validate-performance-indexes.js`
- `validate-pc-object-interaction.js`
- `validate-text-layer-ui.js`
- `validate-default-settings.js`
- `validate-registry-layer-colors.js`
- `validate-gps-startup-mode.js`
- `validate-pc-map-toolbar.js`
- `validate-map-attribution-registry.js`
- `validate-real-sfc-rendering.js sample.sfc`

### 新規失敗

- なし。

### 未実施

- 顧客・現場の実SIMAファイルは未提供のため、今回の検証では使用していない。実ファイル受領時に文字コード、画地件数、座標位置を追加確認する。

## 2026-08-28 実行結果

### 成功

- `validate-gps-startup-mode.js` — 現在地へ切り替えた地点で航空写真年代を1回だけ取得し、年代スライダーを有効化すること、GPS更新後も検索地点と手動選択年代を維持すること、年代確認失敗時は最新写真を残すことを確認。
- `validate-performance-indexes.js`
- `validate-default-settings.js`
- `validate-real-sfc-rendering.js sample.sfc`
- `validate-compass-follow.js` — 初回はアニメーションフレーム時刻の一時的なずれで失敗し、同一コードの再実行で成功。

### 新規失敗

- なし。

## 2026-08-23 実行結果

### 成功

- `validate-android-drogger-bridge.js` — 専用Android起動判定、端末内状態URL、1秒ポーリング、FIX情報の表示・登録連携を確認。

- `validate-android-sfc-share.js` — Android専用ボタン、SFCのZIP化、専用版の端末内ネイティブ共有、座標CSVの共通共有経路、「別名保存・送信」の非表示を確認。Android `1.0.3-private` は実機で共有POSTと標準共有画面の起動を確認。
- `validate-drogger-geoid-model.js` — ISG 2.0の厳密なヘッダー解析、北から南の行方向、双一次補間、範囲外のnullを確認。
- `validate-drogger-owner-mode.js` — ジオイド・アンテナ高補正、標高なし登録、紙面0.8mm丸、中心十字、3分の1線幅、3レイヤー、図面標高2桁切捨て、登録・CSV標高3桁、文字寸法更新、P番号増番、図面なし1/500相当の0.4m丸・0.9m文字を確認。
- `validate-drogger-owner-runtime.js` — Web Worker解析とIndexedDB再読込、短押し・移動時キャンセル、3秒長押しON/OFF、最小化中のRTK状態・水平誤差、ポップアップ外の登録・座標管理、図面なし1/500登録と旧登録点の自動再構成、利用者判断の登録、確認音、P1→P2→P3、標高なし登録、SFCメタデータ、関連3レイヤー削除とUndoをブラウザ上で確認。

- `validate-registry-progress-cancel.js` — 「国土地調査境界」から取得開始し、取得中は「キャンセル」、完了後は「表示」「非表示」へ切り替わることを確認。
- `validate-registry-append-and-intersection.js` — 未取得時の「国土地調査境界」表示と取得開始を確認。
- `validate-registry-cad.js`
- `validate-registry-layer-colors.js`
- `validate-map-attribution-registry.js` — 広域の安全区画分割、スマホ36区画上限、中央優先の筆・形状点制限、分割GeoJSON、SHP区画判定を確認。
- `validate-recovery-autosave.js`
- `validate-last-work-recovery.js` — 元SFCと編集差分をIndexedDBへ保存し、localStorageスナップショットなし・ブラウザ再読込後でも初回画面のボタンから復元できることを確認。
- `validate-performance-indexes.js`
- `validate-photo-album.js` — 70 checks
- `validate-photo-album-runtime.js`
- `validate-gps-startup-mode.js` — スマホ・PCの起動画面ボタンの寸法と配色統一、現在地詳細ポップアップの黒背景・白背景に応じた背景色と文字色、スマホの未設定図面へ最初の現在地系を保存すること、端末共通既定UIが無いこと、図面別手動指定の優先、主図面部分と離れた別配置を含む場合の距離、GPS一時状態に依存しないメッシュ変換、現在地中の保存済み図面航空写真抑止、GPS中の最新航空写真固定、終了時の状態復元を確認。
- `validate-compass-follow.js` — 初期OFF・ファイル読込時の許可要求なし、iPhone相当で方位ボタン押下時だけ許可要求、直接ON/OFF、黒背景・白背景の両方で外周と方位盤全体の青表示と`aria-pressed=true`、Android/WebViewの非absolute方位、28ms・88%の高速な補間、ホーム停止と初期角度復帰を確認。
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
- `validate-pc-map-toolbar.js` — PCツールバーとポップアップ配置、PC・スマホでレイヤー／Undo／Redoが同じ34px高であることに加え、SXF図面枠をホームでPC・スマホの有効表示領域へ収め、内側図形だけを誤って全体表示しないことを確認。
- `validate-recent-drawings.js` — 旧5件履歴を上位3件へ制限し、初回画面とファイルメニューの一致、新規図面を先頭へ移した後も3件を維持することを確認。
- `validate-pc-object-interaction.js`
- `validate-photo-network-import.js`
- `validate-photo-position-adjustment.js`
- `validate-open-source-license.js` — AGPL v3本文、追加条件、原作者表示、ソース導線、無保証、旧禁止表記の除去を確認。

### 2026-08-22時点の失敗と現在の扱い

- `validate-gps-detail-dem.js` — ファイル名表示の古い正規表現。`5fe131f` で現行仕様へ補修し成功。
- `validate-background-sxf.js` — 旧 `backgroundSxfOpenBtn` を要求。
- `validate-mobile-touch.js` — ソース改行の完全一致で停止していた。`5fe131f` で補修し実タッチ試験まで成功。
- `validate-raster-placement.js` — テスト環境に `flattenSxfFeatureBlocks` が無く停止していた。`5fe131f` で依存関数を読み込み成功。
- `validate-ui.js` — 旧ラスター名テンプレートの完全一致で停止。

詳細は `PROJECT_STATE.md` と `INCIDENTS.md` の `INC-OPEN-01` を参照する。

## 実ファイル検証の原則

- SFC/SFZ互換修正では、構文チェックだけで完了にしない。
- 少なくともEZ Viewer再読込を行う。可能ならV-NASとTREND-ONEでも確認する。
- 文字角度、配置、ラスター、複合図形、ハッチは正常な他CAD出力との差分を確認する。
- 実ファイル名、図面内容、座標、画像はこの文書へ記録しない。

## 合格報告の書き方

- 総合監査修正: `node validate-audit-regressions.js`。GPS/SIMAのみの作業を保存・ページ再読込・復元し、SFC文字レイヤー変更も再読込後に検証する。SIMA非表示時のスナップ無効、GPS解除後の図面座標系復帰も確認する。
- 2026-09-05 / `7c30b42`: 全45本を実行し40本成功。上記「既知の失敗・要調査」5本は同じ理由で失敗。最終調整後に追加監査、前回作業復元、GPS起動、Drogger実行時、SIMA性能を再実行し成功。

- 実行したコマンドと終了コードを書く。
- 成功数だけでなく、失敗したテスト名と既存失敗か新規失敗かを書く。
- 実行していない確認を「問題なし」と書かない。
- 目視だけの場合は `観察`、自動テストと実データ確認まで行った場合は `検証済み` とする。
