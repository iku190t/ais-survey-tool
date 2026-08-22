# 検証済み正常基準

「正常基準」は、記載した機能範囲の戻し先です。1機能の正常コミットをアプリ全体の万能な戻し先として扱わないでください。現在全体の基準は先頭のHEADです。

## 現在全体

### BASE-20260822-HEAD

- 状態: `検証済み`
- コミット: `0628582`
- ブランチ: `main`
- 内容: 2026-08-22時点の検証版。法務局データの容量先読み、現在地の航空写真保持、GPS非依存・方位ボタン手動開始のスマホ方位追従、直接ON/OFF、応答高速化、AGPL v3の公開ライセンスとアプリ内法的表示を含む。
- 成功した主要検証: 方位追従、法務局4本、写真帳2本、写真ネットワーク読込、写真位置調整、復元保存、性能、現在地起動、地形2本、等高線文字2本、基盤地図2本、Google連携、PC操作2本、実SFC読込。
- 注意: `PROJECT_STATE.md` の「未解決の検証課題」5本はこのHEADでも失敗する。全テスト成功とは記録しない。

## 機能別の正常基準

### BASE-OPEN-SOURCE-20260822

- 状態: `検証済み`
- コミット: `0628582`
- 対象: 公開ライセンス、原作者表示、ソース案内。
- 確認内容:
  - 標準のGNU AGPL v3本文を`LICENSE`へ収録し、`AGPL-3.0-only`として公開する。
  - 第7条(b)に基づく原作者表示条件を標準本文から分離して`ADDITIONAL_TERMS.md`へ記録する。
  - 改変版の製品名そのものは固定せず、ヘルプ・概要・法的表示等に原作品名と原作者表示を残す。
  - 旧「複製・改変・再配布禁止」と`All Rights Reserved`の矛盾表記を削除する。
  - アプリのヘルプからソース、標準ライセンス、追加条件を確認でき、無保証も表示する。
- 検証: `validate-open-source-license.js`、`validate-compass-follow.js`、`validate-gps-startup-mode.js`、`validate-performance-indexes.js`、`validate-default-settings.js`、`validate-real-sfc-rendering.js sample.sfc`。

### BASE-COMPASS-FOLLOW-20260822

- 状態: `検証済み`
- コミット: `cf87287`
- 対象: スマホの方位ボタン手動回転とホーム操作。
- 確認内容:
  - 図面読込時は回転OFFで、方位センサー許可も要求しない。
  - 方位ボタンは設定ポップアップを開かず、押した時だけ方位許可と回転を開始し、再押下で停止する。
  - Android/WebViewで `absolute=false` の方位イベントしか届かない場合も、有限なalpha値を回転入力として使用する。
  - 方位変化は最短回転方向へ指数補間する。応答時定数28ms・目標追従率88%とし、通常図面は最大60fps、大規模図面は既存の約32ms描画制限を使う。
  - ホームを押すと追従、補間フレーム、再開待ちを停止し、図面の読み込み時の角度へ戻す。
- 検証: `validate-compass-follow.js`（iPhone相当の権限APIモックを含め3回連続成功）、`validate-performance-indexes.js`、`validate-gps-startup-mode.js`、`validate-default-settings.js`、`validate-real-sfc-rendering.js sample.sfc`。

### BASE-GPS-AERIAL-20260822

- 状態: `検証済み`
- コミット: `cf87287`
- 対象: 図面から離れた現在地での航空写真自動表示。
- 確認内容:
  - 図面から500m以上離れた場合は現在地座標系と最新航空写真へ切り替える。
  - 図面距離を計算できない場合も、図面側へ誤って残らず現在地側へ切り替える。
  - 過去年代の確認用fetchが失敗しても、画像タイルとして表示する最新写真は維持する。
  - GPS終了時は開始前の座標系、表示、回転、航空写真状態へ戻す。
- 検証: `validate-gps-startup-mode.js`（年代確認通信失敗と距離計算不能を含む）、`validate-performance-indexes.js`、`validate-real-sfc-rendering.js sample.sfc`。

### BASE-REGISTRY-SIZE-20260822

- 状態: `検証済み`
- コミット: `4abdab7`
- 対象: 法務局データのダウンロード容量先読み。
- 確認内容:
  - スマホだけ、全取得前に容量を確認する。
  - CKANメタデータに容量が無ければHEADを試し、取得できなければ `Range: bytes=0-0` のレスポンス全体容量を使う。
  - プローブの本文はキャンセルし、承認前に全ファイルを取得しない。
  - PCは容量確認を出さない。
- 検証: `validate-registry-progress-cancel.js`。

### BASE-PHOTO-DROP-20260822

- 状態: `検証済み`
- コミット: `ffb3427`
- 対象: PCの写真ドラッグ＆ドロップ。
- 確認内容:
  - 新しい位置情報付き写真が1枚以上読めた場合、旧写真注記、元写真参照、選択、位置調整状態、プレビュー、写真関連Undo/Redoを置換する。
  - 新写真が1枚も有効でない場合は旧写真を破棄しない。
  - 写真選択ボタンによる読込は従来どおり追加・統合。
- 検証: `validate-photo-album.js`、`validate-photo-album-runtime.js`。

### BASE-VIEW-PERFORMANCE-20260822

- 状態: `検証済み`
- コミット: `48129bf`
- 対象: パン、ホイール拡大、ダブルクリック拡大、2本指変形、1本指上下拡大、GPS追従復帰、図面回転。
- 確認内容:
  - 表示だけの操作では完全復元スナップショットを生成しない。
  - 大規模図面のタッチ変形中は約32ms間隔で描画し、操作終了時に最終描画する。
- 検証: `validate-performance-indexes.js`、`validate-recovery-autosave.js`。

### BASE-PHOTO-SOURCE-20260822

- 状態: `検証済み`
- コミット: `f42ca33`
- 対象: 写真読込直後の写真帳Excel出力。
- 確認内容:
  - 読み込んだ `File` を実行中だけ写真項目へ非列挙で直接保持し、Mapも予備参照として使う。
  - 同じ起動中はドラッグ＆ドロップ後に元写真を選び直さず写真帳へ進める。
  - ファイル名欄は接頭語と拡張子なしの名前だけを返す。
- 検証: `validate-photo-album-runtime.js` で直接参照復元と `A.jpg` → `A` を確認。

### BASE-RECOVERY-20260822

- 状態: `検証済み`
- コミット: `dde4fac`
- 対象: 軽量自動復元とレイヤー色のSFC保存。
- 確認内容:
  - 実データ変更時に復元スナップショットをdirty化し、即時保存する。
  - 非表示化・ページ離脱時にも保存し、dirty状態は30秒監視する。
  - レイヤー色変更をSFC書出ベースへ反映する。
- 検証: `validate-recovery-autosave.js`。

### BASE-TERRAIN-DEM1-20260816

- 状態: `検証済み`
- コミット: `bb08104`（精度改善）、`dfafe1d`（高度地形解析の導入）
- 対象: DEM地形解析と等高線。
- 確認内容:
  - DEM1Aの有効値を保持し、欠損点だけDEM5Aで補う。
  - 広域表示時に格子間隔を調整しても、標高源の優先順はDEM1A → DEM5Aのまま。
  - 等高線はWebメルカトル画像方向ではなく平面座標格子を基準にする。
- 検証: `validate-terrain-ui.js`、`validate-terrain-advanced.js`、`validate-contour-text-horizontal.js`、`validate-contour-label-raster-quality.js`。

### BASE-POPUP-Z-ORDER-20260815

- 状態: `検証済み`
- コミット: `5df342b`
- 対象: 計測・手書きなどのポップアップと地図ボタンの重なり。
- 確認内容: ツールポップアップをStreet View等の地図ボタンより前面に表示する。
- 検証: `validate-gps-startup-mode.js`。

## 復元時の原則

1. いきなり古いコミット全体へ戻さない。
2. 対象機能の正常基準と現行HEADの差分を確認する。
3. 必要な変更だけを移植する。
4. 対象テストに加え、隣接機能のテストも実行する。
5. 実SFC/SFZや写真が必要な場合、顧客データを外部知能へ保存せず、その場の検証にだけ使う。
