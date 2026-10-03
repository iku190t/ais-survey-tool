# Viewport readout — 2026-10-03

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
