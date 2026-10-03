# 市区町村名称表

出典：国土地理院 https://maps.gsi.go.jp/js/muni.js （2026-10-03取得）を加工して作成。
利用条件：https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html

`GSI.MUNI_ARRAY[code]` の値をカンマ分割し、都道府県名（2列目）と市区町村名（4列目）を結合。全角空白を除去し、コードを5桁ゼロ埋めしたJSON。
1919件。住所の境界データや個人情報は含まない。コードが不明な場合は住所を推測せず取得失敗扱い。
APIは https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress を使用。市区町村表とAPIの更新時期の相違で取得できなくなる場合がある。
