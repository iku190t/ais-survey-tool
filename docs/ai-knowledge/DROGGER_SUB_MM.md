# GPS登録点の0.1mm設定

## 2026-10-23 標高文字とGPS単独プレビューの寸法比

状態: 検証済み（自動テスト、実機未確認）。直前/戻し先: `e276a6e`。
変更コミット: `git log --grep="Match GPS preview dimensions"` で特定する。

- 旧コードのGPS単独プレビューは円直径が設定値×20px、0.1mmの文字は最小値補正で1px。0.1mm同士で円2px/文字1pxとなっていた。半径の保存計算は正しく、設定直径÷2だった。
- マークと点名・標高文字の固定プレビューを共通8px/mmへ統一。マーク線幅も小径では比例縮小し、固定1.2pxの線が小さな円を覆うことを防ぐ。画面上の実寸mmではなく紙面設定値の表示倍率であり、字形の実際の黒い領域とフォント公称高さは同一ではない。
- 標高文字もHTML/設定正規化の下限0.1mm、step0.1。既存設定/既定1.8mmを自動的に0.1へ置き換えない。図面ありの描画、登録座標、標高値、CSV、円の保存幾何、保存線幅は変更しない。
- 下記の旧「標高文字1～10mm」「マークと文字の別々の固定表示倍率」は廃止。SFCの既存縮尺変換は維持。
- 成功（終了コード0）: `validate-drogger-owner-mode.js`（0.1～1.0mmの両文字/直径と復元）、`validate-drogger-owner-runtime.js`（入力/メタデータ、0.1/0.2/0.8/1.8/4/10mmの実描画引数の寸法比、描画でデータ不変）、`validate-audit-followup-regressions.js`（39ケース、点名/標高0.1mmと直径0.1mmのSFC再保存で1/500の文字高50/半径25を確認）、`validate-android-drogger-bridge.js`、`validate-drogger-geoid-model.js`、`validate-gps-startup-mode.js`、`validate-recovery-autosave.js`、`validate-last-work-recovery.js`、`validate-real-sfc-rendering.js sample.sfc`。
- 描画試験の初回はCanvasのfloat32線幅0.8000000119と期待0.8の差で停止。比較許容値を1e-6へ修正し同じ製品コードで成功。実機Safari/Android・外部CADは未確認、APK変更なし。

## 初回の0.1mm対応（e276a6e）

状態: 検証済み（自動テスト、実機未確認）。基準/戻し先: ac516c6。
変更コミット: `git log --grep="Allow 0.1 mm GPS marker"` で特定する。

- 点名はHTMLとnormalizeSettings/labelPayloadで1mm下限だった。マーク直径は0.8mm固定、GPS単独の再構成も0.8mm固定だった。
- マーク直径欄を追加（0.1～10mm、step 0.1）。点名は0.1～10mm、step 0.1。既定0.8mm/1.8mmと標高文字の1～10mmは維持。
- 既存データは起動だけでサイズ変更しない。利用者がマーク径を変更した場合のみ登録点の円/十字を中心基準で拡縮。文字変更とマーク変更は独立。
- 紙面直径を登録情報・円に保存し、GPS単独1/500再構成とSFC出力でも維持。通常SFCの縮尺処理は従来どおり。
- 最終SFC文字書出しの0.5mm下限はDroggerだけ0.1mmへ変更。他の写真文字等の下限を変えない。
- GPS単独画面の固定表示マークも設定径に比例。文字の最小画面サイズも1mm未満の場合だけ比例縮小。0.1mmは小さく見えることがある。

成功した検証:
- validate-drogger-owner-mode.js: 0.1～1.0mmの10段階、モデル寸法、JSON再構成、元記録/CSV不変。
- validate-drogger-owner-runtime.js: 実入力change、0.1mm有効性、既存点変更、メタデータ保存、GPS単独再構成、CSV不変。
- validate-audit-followup-regressions.js: PC/Android/iPhone相当39ケース。0.1mmマーク/点名の最終SFC→再読込→再書出しで1/500の半径25mm/文字高50mmを追加確認。
- validate-android-drogger-bridge.js、validate-drogger-geoid-model.js、validate-gps-startup-mode.js、validate-recovery-autosave.js、validate-last-work-recovery.js、validate-real-sfc-rendering.js sample.sfc。
- git diff --check。

初回ブラウザ試験はローカル通信制限で停止、許可環境で再実行し成功。iPhone/Android実機、外部CADは未確認。APK変更なし。
