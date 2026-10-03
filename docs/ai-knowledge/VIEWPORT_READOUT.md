# Viewport readout — 2026-10-03

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
