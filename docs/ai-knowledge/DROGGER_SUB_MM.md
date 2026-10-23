# GPS登録点の0.1mm設定

## 2026-10-23 小径・小文字の視認性回復

状態: 検証済み（ブラウザ自動試験・描画画像確認。実機未確認）。直前: `81bfdde`（不可視に近くなる不具合版であり正常基準ではない）。
変更コミット: `git log --grep="Keep sub-mm GPS previews visible"` で特定する。

- 再現済み: 81bfddeでGPS単独0.1mmの円直径/文字高が0.8px、線幅0.1px。新しい最低視認寸法テストがこの値で失敗。旧テストは寸法比と保存値だけを確認し、読める描画サイズを検証していなかった。
- 修正: GPS単独表示だけ、円直径と点名/標高文字の公称高さを共通の `max(10px, 設定mm×8)` とする。円線幅1.2pxへ復帰。大きいマークではラベルを円の右側へ避ける。
- 最低表示サイズの範囲では異なる小さい設定値も同じ表示サイズになる。これは画面表示の補助で、設定値/紙面寸法/登録座標/標高/CSV/既存メタデータを上書きしない。0.1mm設定、標高文字0.1mm対応、SFCの1/500寸法は維持。図面ありの描画は変更なし。
- 成功（全て終了コード0）: `validate-drogger-owner-runtime.js`（0.1～10mmの表示値、実Canvasの不透明画素数、データ不変）、`validate-drogger-owner-mode.js`、`validate-android-drogger-bridge.js`、`validate-drogger-geoid-model.js`、`validate-gps-startup-mode.js`、`validate-recovery-autosave.js`、`validate-last-work-recovery.js`、`validate-real-sfc-rendering.js sample.sfc`、`validate-audit-followup-regressions.js`（39ケース）。`git diff --check`成功。
- 0.1mmの実描画は円/十字57画素、点名＋標高48～58画素がalpha128以上。白黒の背景へ合成した画像で円/十字・P1・2.01を確認。合成背景は実地図/実機表示そのものの検証ではない。
- 戻す場合はこの表示差分だけを戻す。81bfddeへ戻すと不可視問題も戻る。APK変更なし、iPhone/Android実機・外部CAD未確認。

## 2026-10-23 標高文字とGPS単独プレビューの寸法比

状態: 保存/寸法比は検証済み。ただし最低サイズなしの表示仕様は視認性不足のため廃止（上記で修正）。直前: `e276a6e`。
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
