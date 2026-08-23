# 検証済み正常基準

「正常基準」は、記載した機能範囲の戻し先です。1機能の正常コミットをアプリ全体の万能な戻し先として扱わないでください。現在全体の基準は先頭のHEADです。

## 現在全体

### BASE-20260823-HEAD

- 状態: `検証済み`
- コミット: `ac93f4d`
- ブランチ: `main`
- 内容: 2026-08-23時点の検証版。従来の検証済み機能に加え、Android専用のSFC ZIP共有、現在地題名の3秒長押しで開くDrogger座標登録、図面なしの固定画面寸法、SFC出力時の0.8mm丸・1.8mm既定文字への再構成、公式ISGによるジオイド補正、最小化、利用者判断による登録、確認音、P番号の自動増番、専用AndroidアプリからのRTK FIX/FLOAT表示と記録を含む。
- 成功した主要検証: 方位追従、法務局4本、写真帳2本、写真ネットワーク読込、写真位置調整、復元保存、性能、現在地起動、地形2本、等高線文字2本、基盤地図2本、Google連携、PC操作2本、実SFC読込。
- 注意: `PROJECT_STATE.md` の「未解決の検証課題」5本はこのHEADでも失敗する。全テスト成功とは記録しない。

## 機能別の正常基準

### BASE-ANDROID-DROGGER-FIX-20260823

- 状態: `検証済み`
- Webコミット: `ac93f4d`。
- Androidコミット: `8bdbc02`（受信サービス本体 `5e78e20`）、バージョン `1.0.1-private`。
- 対象: 所有者専用Android版のDrogger RTK状態連携。
- 確認内容:
  - Androidアプリ内のループバック `127.0.0.1:38471` だけでNMEAを受け、GGA品質4をFIXED、5をFLOATとして判定する。
  - 状態取得は端末内HTTP `127.0.0.1:38472` に限定し、外部サーバーへ座標を送らない。
  - `?source=android_app` のAndroid版だけ1秒ごとに状態を読み、一般Web版では接続しない。
  - 専用画面へFIXED/FLOAT/受信停止を表示し、登録時の状態を座標記録・CSVの「RTK状態」へ保存する。FIX状態では登録を制限しない。
- 実機検証: USB接続のAndroid 12端末へ上書きインストールし、品質4→FIXED、品質5→FLOAT、5秒超の無受信→STALEを確認。
- Web検証: `validate-android-drogger-bridge.js`、`validate-drogger-owner-mode.js`、`validate-drogger-owner-runtime.js`、Drogger/GPS/復元/実SFCの関連回帰。
- 必要設定: Drogger GPSのTCP Clientをホスト `127.0.0.1`、ポート `38471`、GGA出力ありにする。

### BASE-DROGGER-OWNER-20260823

- 状態: `検証済み`
- コミット: `55707a7`
- 対象: 現在地詳細から入る隠しDrogger座標登録。
- 確認内容:
  - 「現在地」の題名を動かさず3秒長押しすると専用画面をON/OFFする。短押し、途中で指を離した場合、12pxを超えて動かした場合は起動しない。通常起動時は表示しない。
  - ブラウザGeolocationへDrogger GPSが供給した緯度経度、平面直角X・Y、楕円体高、水平誤差を使用し、標高誤差は表示・CSV項目にしない。
  - 右上ボタンで最小化し、最小化中は「水平誤差 ±○○m」だけを表示する。「登録」「座標管理」は専用ポップアップの外へ出し、画面左下の「現在地に戻る」の上へ固定する。専用モード中は最小化状態でも表示し、専用モード終了時だけ非表示にする。
  - 公式ISG 2.0ジオイドモデルを専用画面から選択し、Web Workerで解析してIndexedDBへ保存・再利用する。
  - 杭打ちアプリと同じ「楕円体高－ジオイド高－入力アンテナ高」を補正標高として登録する。モデル未設定・範囲外・高度未取得では標高を「－」とし、登録自体は許可する。
  - FIX状態、高度有無、受信経過時間では登録を止めず、表示誤差を見て利用者が判断する。高度未取得は「－」で保持し、0.000へ誤変換しない。
  - 登録成功時に最大ゲインの短い確認音を鳴らし、P1を登録した後はP2、P3へ自動増番する。
  - SFC図面の有無を登録条件にせず、「現在地で開く」の図面なし状態でも3レイヤーへ登録する。
  - 登録点は紙面直径0.8mm、従来の3分の1の線幅の丸と、丸端まで届く中心十字にする。点名、補正標高を3つの赤色レイヤーへ分離し、通常のレイヤー色変更、SFC保存、前回作業復元へ載せる。
  - 補正標高は登録情報とCSVへ小数第3位まで保存し、図面上の標高文字は小数第2位で切り捨てる。
  - 点名・標高文字寸法を変更でき、座標管理から個別削除、Undo、UTF-8 CSV共有ができる。
  - Drogger関連レイヤーのどれかをレイヤー画面から削除すると、3レイヤーと登録情報をまとめて削除する。
- 検証: `validate-drogger-geoid-model.js`、`validate-drogger-owner-mode.js`、`validate-drogger-owner-runtime.js`、`validate-gps-startup-mode.js`、`validate-recovery-autosave.js`、`validate-last-work-recovery.js`、`validate-performance-indexes.js`、`validate-pc-map-toolbar.js`、`validate-text-layer-ui.js`、`validate-default-settings.js`、`validate-real-sfc-rendering.js sample.sfc`。
- 制限: 通常のWeb Geolocation APIはRTK FIX/FLOAT状態を返さないため、EZ ViewerはFIX状態を独自判定しない。

### BASE-ANDROID-SHARE-DROGGER-SIZE-20260823

- 状態: `検証済み`
- コミット: `92273dd`
- 対象: AndroidのSFC共有と、図面なしDrogger登録の表示・SFC出力寸法。
- 確認内容:
  - Androidだけファイルメニューへ「共有・メール送信」を表示し、SFCをZIP化して準備完了後のボタンからAndroid共有画面を直接開く。
  - ZIPのMIME候補を順に試し、通常保存・PC・iPhoneの経路は維持する。
  - 図面なしの点記号は画面上で直径16pxの一定表示とし、点名・標高も一定の画面文字寸法で表示する。
  - SFC書出では保存座標から点記号を再作成し、紙面0.8mm丸と中心十字、既定1.8mmの点名・標高文字へ図面縮尺に合わせる。利用者が文字寸法を変更した場合は保存済み設定を使う。
- 検証: `validate-android-sfc-share.js`、`validate-drogger-owner-mode.js`、`validate-drogger-geoid-model.js`、`validate-gps-startup-mode.js`、`validate-last-work-recovery.js`、`validate-drogger-owner-runtime.js`、`validate-real-sfc-rendering.js sample.sfc`。
- 制限: Android実機の共有候補にGmailが表示されるかは、端末・Chrome・インストール済みアプリに依存するため実機確認が必要。

### BASE-RECENT-DRAWINGS-20260823

- 状態: `検証済み`
- コミット: `b0e2284`
- 対象: PC版の「最近開いた図面」。
- 確認内容:
  - 初回画面とファイルメニューは、同じ履歴から最新3件だけを表示する。
  - 端末に旧上限の5件が残っていても、読込時に上位3件へ制限する。
  - 新しく開いた図面または再度開いた図面を先頭へ移し、合計3件を維持する。
  - スマホでは従来どおり履歴を表示しない。
- 検証: `validate-recent-drawings.js`、`validate-pc-map-toolbar.js`、`validate-gps-startup-mode.js`、`validate-last-work-recovery.js`、`validate-default-settings.js`、`validate-real-sfc-rendering.js sample.sfc`。

### BASE-EDIT-BUTTON-HEIGHT-20260823

- 状態: `検証済み`
- コミット: `ec18727`
- 対象: 図面左上の「レイヤー」、Undo、Redoボタン。
- 確認内容:
  - 内容量任せだった「レイヤー」の高さをUndo・Redoと同じ34pxへ固定する。
  - レイヤーの横幅、文字、位置、機能とUndo・Redoの寸法・機能は変更しない。
  - PCと390×844スマホ表示の両方で3ボタンの実寸高さが一致する。
- 検証: `validate-pc-map-toolbar.js`、`validate-gps-startup-mode.js`、`validate-default-settings.js`、`validate-compass-follow.js`、`validate-real-sfc-rendering.js sample.sfc`。

### BASE-HOME-SHEET-FIT-20260823

- 状態: `検証済み`
- コミット: `d9de98d`
- 対象: ホームによる図面全体表示。
- 確認内容:
  - SXF用紙・主部分図配置が有効なら、用紙四隅から図面枠全体の回転後範囲を計算する。
  - スマホとPCの両方で、図面枠をツールバー・フローティングボタンの下から画面下端までへ収める。
  - 用紙情報が無いSFCだけ、従来の図形範囲・外れ図形除外処理へ退避する。
- 検証: `validate-pc-map-toolbar.js`（PCと390×844スマホの用紙四隅、内側図形を誤って全体表示しないこと）、`validate-compass-follow.js`、`validate-real-sfc-rendering.js sample.sfc`、`validate-gps-startup-mode.js`、`validate-last-work-recovery.js`。

### BASE-STARTUP-UI-20260823

- 状態: `検証済み`
- コミット: `7179fe4`
- 対象: 最初のファイル選択画面。
- 確認内容:
  - ファイル、現在地、前回作業復元、サンプル、動画の各ボタンを同じ230px幅、最低38px高、濃いグレー背景、白文字へ統一する。
  - スマホでは5ボタン、PCでは現在地を除く4ボタンの寸法と配色が一致する。
  - ボタンの機能、無効状態、スマホ専用の現在地表示条件は変更しない。
- 検証: `validate-gps-startup-mode.js`、`validate-last-work-recovery.js`、`validate-default-settings.js`、`validate-compass-follow.js`、`validate-real-sfc-rendering.js sample.sfc`。

### BASE-LAST-WORK-RECOVERY-20260822

- 状態: `検証済み`
- コミット: `2f1214d`
- 対象: ブラウザを閉じた後の前回作業復元。
- 確認内容:
  - 初回画面に「前回の作業を復元」を表示し、復元可能なデータがある時だけ有効にする。
  - 元SFCは図面・内容ごとに1回だけIndexedDBの専用ストアへ保存し、手書き、レイヤー表示・色、削除、写真位置などは従来の差分スナップショットへ保存する。
  - 大きな写真でlocalStorageの上限を超えても、復元索引とIndexedDB保存を継続する。
  - 元のOneDriveパスやFileハンドルが無くても、元SFC複製と最新差分から復元する。
  - 元JPEGはブラウザの永続File参照ではないため、写真帳再作成時などに再接続が必要な場合がある。
- 検証: `validate-last-work-recovery.js` で1,179,645文字のサンプルSFC、手書き、レイヤー色を保存し、localStorage側のスナップショットを消してブラウザ再読込後にIndexedDBだけから復元。`validate-recovery-autosave.js`、`validate-performance-indexes.js`、`validate-default-settings.js`、`validate-real-sfc-rendering.js sample.sfc`、`validate-gps-startup-mode.js`、`validate-compass-follow.js` も成功。

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
- コミット: `3c1b8f4`
- 対象: スマホの方位ボタン手動回転とホーム操作。
- 確認内容:
  - 図面読込時は回転OFFで、方位センサー許可も要求しない。
  - 方位ボタンは設定ポップアップを開かず、押した時だけ方位許可と回転を開始し、再押下で停止する。
  - Android/WebViewで `absolute=false` の方位イベントしか届かない場合も、有限なalpha値を回転入力として使用する。
  - 方位変化は最短回転方向へ指数補間する。応答時定数28ms・目標追従率88%とし、通常図面は最大60fps、大規模図面は既存の約32ms描画制限を使う。
  - ホームを押すと追従、補間フレーム、再開待ちを停止し、図面の読み込み時の角度へ戻す。
  - 追従中は方位ボタンへ `following` 状態を付け、黒背景・白背景のどちらでも外周と内側方位盤を青いグラデーションと枠・発光で表示し、`aria-pressed=true` にする。停止時は解除する。
- 検証: `3c1b8f4` の `validate-compass-follow.js` で黒背景・白背景のボタンと方位盤の実際の計算済み色を確認。iPhone相当の権限APIモック、`validate-gps-startup-mode.js`、`validate-default-settings.js`、`validate-last-work-recovery.js`、`validate-real-sfc-rendering.js sample.sfc` も成功。

### BASE-GPS-AERIAL-20260822

- 状態: `検証済み`
- コミット: `b261d32`
- 対象: 図面から離れた現在地での航空写真自動表示。
- 確認内容:
  - 図面から500m以上離れた場合は現在地座標系と最新航空写真へ切り替える。
  - スマホで座標系未設定の図面に対して最初にGPSを取得した時、現在地の系をその図面へ保存し、距離計算へ使用する。
  - 保存は図面単位で1回だけ行い、別の場所へ移動しても自動上書きしない。県外図面などの例外は「この図面の座標系」で手動変更する。
  - 端末共通の「新しい図面の既定座標系」は廃止し、設定画面にも表示しない。PCでは現在地による図面座標系の自動保存を行わない。
  - GPS中の航空写真は現在地の最新写真1種類へ固定する。GPSの座標揺れで過去年代検索を繰り返し、写真一覧を空にしない。
  - 複数の部分図・外れ図形を含むSFCでは主図面部分の範囲を距離判定へ使い、全体外接矩形による過小距離を防ぐ。
  - 距離計算用の座標変換はGPS一時座標系の表示状態に影響されない固定変換を使う。
  - 現在地座標系への一時切替中は、SFCに保存された図面側航空写真ラスターを描かず、現在地タイルとの交互表示を防ぐ。GPS終了後は復元する。
  - 過去年代の確認用fetchが失敗しても、画像タイルとして表示する最新写真は維持する。
  - GPS終了時は開始前の座標系、表示、回転、航空写真状態へ戻す。
- 検証: `validate-gps-startup-mode.js`（スマホ現在地の第4系を未設定図面へ保存、端末共通既定UIの不存在、図面別手動指定、主図面範囲、固定メッシュ変換、保存済み別地点ラスター抑止、現在地の最新航空写真固定、GPS終了時の復元を含む）、`validate-performance-indexes.js`、`validate-compass-follow.js`、`validate-default-settings.js`、`validate-last-work-recovery.js`、`validate-real-sfc-rendering.js sample.sfc`。

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

### BASE-REGISTRY-LABEL-20260823

- 状態: `検証済み`
- コミット: `cef92f8`
- 対象: 法務局地図・境界の取得開始ボタン。
- 確認内容: 初期表示、キャンセル後の復帰、未取得時の案内、ヘルプを「国土地調査境界」へ統一する。取得後の「表示」「非表示」と取得中の「キャンセル」は従来どおり。
- 検証: `validate-registry-progress-cancel.js`、`validate-registry-append-and-intersection.js`、`validate-registry-cad.js`、`validate-pc-map-toolbar.js`。

### BASE-REGISTRY-WIDE-20260823

- 状態: `検証済み`
- コミット: `dcb28de`
- 対象: 広い範囲・高密度地域の法務局地図自動取得。
- 確認内容:
  - 従来の広域事前上限へ達する前に、スマホ約900m、PC約1,600m単位の安全区画へ自動分割する。
  - 区画は図面中央に近い順で優先し、極端に広い図面はスマホ36区画、PC64区画までに制限する。
  - SHP/GeoJSONはダウンロード済みデータを分割範囲で選別し、筆12,000/30,000件、形状点36万/90万点の端末別上限へ達した場合も全消去せず、中央側の取得済みデータを保持する。
  - 一部取得時は取得区画数を状態欄と完了メッセージに表示し、解析進捗には分割区画数を表示する。
  - 取得後の表示・非表示、キャンセル、レイヤー色、範囲CAD化、SFC表示は変更しない。
- 検証: `validate-map-attribution-registry.js`（6区画分割、36区画上限、中央優先12,000件保持、分割GeoJSON、SHP範囲判定）、`validate-registry-progress-cancel.js`、`validate-registry-append-and-intersection.js`、`validate-registry-cad.js`、`validate-registry-layer-colors.js`、`validate-pc-map-toolbar.js`、`validate-real-sfc-rendering.js sample.sfc`、`validate-last-work-recovery.js`。

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

### BASE-GPS-DETAIL-THEME-20260823

- 状態: `検証済み`
- コミット: `fc24db3`
- 対象: 現在地の詳細情報ポップアップ。
- 確認内容:
  - 黒背景では従来の黒い半透明パネルと白文字を維持する。
  - 白背景では白い半透明パネルと黒文字へ切り替え、航空写真上でも情報を読めるようにする。
  - GPS、航空写真、座標・DEM表示内容には変更を加えない。
- 検証: `validate-gps-startup-mode.js` で黒背景・白背景それぞれの計算済み背景色と文字色を確認。`validate-default-settings.js`、`validate-compass-follow.js`、`validate-last-work-recovery.js`、`validate-real-sfc-rendering.js sample.sfc` も成功。

## 復元時の原則

1. いきなり古いコミット全体へ戻さない。
2. 対象機能の正常基準と現行HEADの差分を確認する。
3. 必要な変更だけを移植する。
4. 対象テストに加え、隣接機能のテストも実行する。
5. 実SFC/SFZや写真が必要な場合、顧客データを外部知能へ保存せず、その場の検証にだけ使う。
