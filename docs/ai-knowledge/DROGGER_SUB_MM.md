# GPS登録点の0.1mm設定

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
