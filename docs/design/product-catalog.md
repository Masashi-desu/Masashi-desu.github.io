# プロダクト一覧

## 一覧ページネーション

- プロダクト一覧は、フィルタと並び順を適用した結果を1ページ最大5件で表示する。
- 初期表示とフィルタ／並び順の変更時は1ページ目を表示する。
- 前後ボタンでページを切り替えると、選択ページのプロダクトsectionだけをDOMへ描画する。非選択ページを下方へ並べたままにしない。
- プロダクトsectionのDOMを差し替えた直後にLiquidGLのスナップショットを更新し、前面のセグメントへ切り替え前の製品背景を残さない。
- ナビゲーション番号と各sectionの `NN / NN` は、ページ内番号ではなくフィルタ結果全体の通番を維持する。
- ページ状態、前後ボタンの有効状態、表示件数は、フィルタ後の件数と現在ページに同期する。

## 製品メディア

- `site/products/index.json`（公開URLは `/products/index.json`）に `video` がある製品は、ホームの製品カードと同じ動画を一覧sectionの背景にも使用する。
- `header` は動画のposterとして使用し、動画はミュート・ループ・インラインで自動再生する。
- 一覧でアニメーションを使うBartical、TypeFetch、WinKinesisはH.264 MP4を動画経路へ統一する。元GIFは各製品の既存用途とposterに残し、LiquidGL内ではvideo frameをリアルタイム合成する。
- `prefers-reduced-motion: reduce` では自動再生を停止し、posterを表示する。実行中の設定変更にも追従する。
- Barticalは `site/products/Bartical/BarticalCardDemo.mp4` と `site/products/Bartical/screenshot.png` をホームカードと一覧で共有する。
- 製品一覧のBartical背景動画はレスポンシブ時も上端を基準に切り抜き、拡大時を含めて映像上端のメニューバーが表示範囲から押し出されないようにする。
- Barticalの一覧アイコンは、正式256pxアプリアイコンから透明な光学余白だけを除いた `BarticalCatalogIcon.png` を使う。表示領域内に余白を作らず、追加の角丸やボックスシャドウも重ねない。
- Aboutとホームカードでは、macOS上の実アプリ表示を再現するため、光学余白を維持した `BarticalAppIcon.png` を引き続き使う。

## LiquidGL

- `site/vendor/liquidGL.js` は upstream `naughtyduk/liquidGL` v2.0.1（commit `28e7c1a64a96c46449e9f494acee98c8490d9824`）を基準とし、内蔵NaughtyDOM rasteriserを使用する。`html2canvas`には依存しない。
- リポジトリ固有差分として、Mobile SafariのWebGL context復帰、snapshot timeout、WKWebView履歴復帰時の座標補正、DOM差し替え後のvideo再検出、`object-fit: cover` / `object-position`同期を維持する。
- 一覧のLiquidGLセグメントパネルは屈折像の上に現在のcontent stopとテーマに応じたtintを重ねる。製品section上と、その製品を `contentAnchor` とするページネーション／フッター、および暗色テーマでは `rgba(5, 4, 14, 0.62)` を維持する。明色テーマの検索sectionだけは `rgba(255, 253, 247, 0.28)` とし、補助stopへ到達しただけで白いパネルへ切り替わらないようにする。
- 検索sectionと製品content間でtintが切り替わる場合は、segmented scrollの `settleMs` と同じ640ms linearの `background-color` transitionで補間する。短時間にstopが切り替わった場合も現在の中間色から次の色へ連続させ、`prefers-reduced-motion: reduce` では補間を無効にする。

## 回帰テスト

- `npm run test:liquidgl-return-position`: X内蔵ブラウザなどの `WKWebView` で履歴復帰後も古い `visualViewport` offsetへ引きずられず、LiquidGLの描画矩形が固定ナビのDOM矩形と一致することを検証する。
- `npm run test:liquidgl-segment-mobile`: iOS Mobile Safari相当のWebKitで、内蔵NaughtyDOM rasteriserの画像読込がsnapshot中に滞留する条件とWebGL context破棄を再現し、CSS fallbackからLiquidGL描画へ復帰することを検証する。
- `npm run test:native-media`: macOS Chromium／WebKitで実MP4をデコードし、一覧の3動画がLiquidGL textureへ登録されて実時間frameを更新することと、Barticalのテーマ別動画が再生されることを検証する。Linux WebKitのcodecや仮想GPUでは代替しない。
