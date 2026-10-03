# Viewport readout — 2026-10-03

## Initial zone preparation

状態: 検証済み（Chromium模擬端末・モック座標解決、実機未確認）。戻し先269e3cd。
変更コミット: `git log --grep="Initialize viewport coordinate zone"`。
原因: HUDはmanual/profileZoneの値を読むだけで、長押しのopenCoordinateInspectModalが呼ぶresolveProfileZoneを実行していなかった。
未設定時は既存resolveProfileZoneを呼ぶ。戻り値を独自代入せず既存の図面切替ガード/手動優先を維持。同時1回、未解決は30秒間隔、図面revision変更時は再試行可能。
投影ライブラリ未準備時はDEMを完了扱いにしない。GPS追従を開始せず、既存座標解決と同じ位置情報許可を求める場合がある。
validate-viewport-readout.jsで初回/次図面の未準備から長押しなしで住所・DEMが表示されること、PC非実行、縦横配置・通信失敗を確認。
validate-coordinate-inspect.js、validate-compass-follow.js成功。保存/図面描画のコードは変更なし。

## Center address revision

状態: 検証済み（対象自動テストと公開地点API応答。全地域の住所精度/実機未確認）。戻し先2c4d9dc。
変更コミット: `git log --grep="Use GSI center address"`。
観察: ユーザーより住所精度不足。再現済み: 東京駅付近の公開座標で旧APIは近隣ビル階名候補、GSIは丸の内一丁目を返した。
HeartRails代表点候補選択を廃止し、既存法務局取得でも使用しているGSI LonLatToAddressのmuniCd/lv01Nmを採用。
中心住所は大字・丁目まで。GSI内部のポリゴン判定方式を独自検証したものではなく、全国の包含区域/地番の正確性は保証しない。
取得不能で旧検索へフォールバックしない。町域欠落は市区町村＋町域不明。キャッシュキー7桁へ変更し境界付近の約1m単位の使い回しを避ける（精度保証ではない）。
国土地理院muni.jsから市区町村名1919件をJSON化し同梱。出典は data/GSI_MUNICIPALITY_NAMES.md。
公開3地点（東京駅/東京タワー/徳島市役所）の応答と公開Origin付きCORSを確認。顧客位置情報は使用していない。
validate-viewport-readout.js、validate-mobile-landscape.js、validate-compass-follow.js成功。レイアウト/描画/保存処理は維持。
GSI動的サービスは予告なく変更/停止される可能性がある。https://github.com/gsi-cyberjapan/gsimaps の留意点参照。

## Nearby address

状態: 検証済み（Chromium縦横・PC、実機未確認）。戻し先47bd291。
変更コミットは `git log --grep="Add throttled nearby address"` で特定する。
HeartRails Geo APIから中心座標付近の町域を取得、座標欄の上に1行表示。地番や包含区域の確定値ではない。
800ms停止後・最短5秒間隔・6秒タイムアウト。メモリ内128件、成功10分/失敗1分キャッシュ。永続保存なし。
古い位置の返答は表示しない。PC/作業なし/座標系なしでは問い合わせない。エラーでもXYや図面操作は継続。
住所行13px分だけ下部ボタンを上げる。出典・外部中心座標送信・精度の限界をヘルプに記載。
公開APIのCORS許可ヘッダーとJSON応答を公開地点で確認。位置代表点候補に建物階名が含まれる場合もあり、同距離では短い町域名を優先。正確な地番取得とは扱わない。
validate-viewport-readout.js: モック成功、キャッシュ、古い応答無視、503時再試行抑止、系なし、縦横配置、テーマ、PC通信なしを確認。
validate-mobile-landscape.js、validate-compass-follow.js成功。保存/描画/GPS本体は変更なし。
API仕様 https://geoapi.heartrails.com/api.html 、規約 https://www.heartrails.com/ja/company/terms 。高負荷は禁止、無制限利用は保証しない。

## Full-width mask and left-aligned scale

状態: 検証済み（Chromium、実機未確認）。基準2eda9a9。
マスクalpha .75→.95（親opacity .7維持、合成後.665）。疑似要素を左右28px延長して図面表示領域の全幅を覆う。
文字の左右余白・中央位置・高さは維持。スケールは現在地に戻るボタンの実測左端へ一致、高さ計算は変更なし。
validate-viewport-readout.jsで縦横の左右端一致、マスク色/濃度、ボタン左端一致、非重複、PC非表示を確認。
validate-mobile-landscape.jsも成功。

## Stronger coordinate mask

基準647970d。座標マスクの背景alphaを0.5から0.75へ変更（親HUDのopacity 0.7は維持、合成後の背景不透明度は0.35→0.525）。位置・文字・スケール・保存処理は変更なし。
validate-viewport-readout.jsで白黒両背景のalphaと既存配置・PC非表示を検証。

## Centered scale and readout mask revision

状態: 検証済み（Chromium、実機未確認）。基準 f3618a5。
スケールは座標欄と同じ水平中心へ移動、座標欄の2px上までの範囲で少し下げる。
ラベルはtoFixed(1)で四捨五入し末尾の.0を省略。XY小数3桁・DEM小数2桁は維持。
座標欄全体にテーマ同色の50%半透明マスクを追加。
座標を1em下げる要求はsafe-area下端で制限するため、旧2px余白からの実移動は最大2px。
ホームバー領域へ押し込まない。スマホ専用、固定幅2/3、操作透過を維持。
validate-viewport-readout.jsにマスク色、中央一致、1桁ラベル、下端見切れなしを追加して成功。
validate-mobile-landscape.jsも成功。

## Compact mobile revision

状態: 検証済み（Chromiumタッチ端末エミュレーション）。基準 da206e7。
従来のPC表示・可変幅E型目盛りは廃止。isTouchMobileLike()のスマホ判定時のみ表示。
スケールは現在地へ戻るボタン実測幅の2/3、非表示時は直近幅（初期112px基準）を使用。
ズームで変わるのは距離ラベルのみ。両端と基線だけの18px高、ラベルは1つ。
座標は安全領域+2pxまで下げ、13px行高。スケールはボタン下端と座標上端の中間。
現在地へ戻るボタンの位置はda206e7から変更しない。
validate-viewport-readout.jsで固定幅、距離変化、幅比2/3、上下配置、単一ラベル、PC非表示を追加検証。
validate-mobile-landscape.js、validate-compass-follow.jsも成功。実機未確認。

## Initial revision (historical)

状態: 検証済み（ローカルChromium）。iPhone/Android実機は未検証。

基準コミット: 5aa7b2b。変更は viewport-readout.js と index.html の読込1行に分離。
中央十字は画面固定。XYはscreenToWorld→sfcWorldToPlaneを使用し、パン仮表示の移動量も補正。
E型スケールは画面横方向100pxの平面座標差から実距離を計算。
座標とDEM標高は下部中央、安全余白内に配置。白黒背景で色を反転、塗りつぶしなし。
現在地へ戻る・登録/座標管理・出典を下部表示から退避。スケールは左側の既存表示の上へ配置。
保存データ、描画データ、GPS設定は変更しない。pointer-events:none。
XY表示は100ms周期、DEMは中心位置が250ms安定した後に既存キャッシュ経由で取得。
座標系未設定・取得不可はダッシュ表示。過去位置の非同期結果は破棄。DEMは測量観測標高ではない。

検証コマンド（すべて成功）:
- node validate-viewport-readout.js — 390×844、844×390、1280×800、色反転、XY追従、DEM表示（モック）、ボタン重なりなし、タッチ透過
- node validate-mobile-landscape.js
- node validate-compass-follow.js
- node validate-sima-performance.js
- node validate-recovery-autosave.js
- node validate-real-sfc-rendering.js sample.sfc
- node validate-coordinate-inspect.js

公開前の確認はモックDEMと既存DEM呼出し経路の接続検証。実ネットワークで全地域のDEM取得を保証しない。
戻す場合はindex.htmlのviewport-readout.js読込だけを取り除く。他機能を巻き戻さない。
