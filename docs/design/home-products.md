# ホーム Product セクション

## レスポンシブレイアウト

- Product セクションは、見出し、プロダクトカルーセル、「プロダクト一覧」CTA を1つのコンテンツ群として表示領域の縦中央に配置する。
- 幅 `36rem` 以下のスマホ表示でも縦中央配置を維持し、コンテンツ下側だけに大きな空白を残さない。
- 高さの低い横長表示では、コンテンツを表示領域内に収めることを優先する。CTA はカルーセルより下に置き、カードやCTAを重ねず、横方向のオーバーフローを発生させない。

## カード映像

- `products/index.json` に `video` があるプロダクトは、`header` の静止画をposterとして保ちながら、カードのメディア領域でミュート・インライン・自動ループ再生する。
- Barticalカードは `.temp/bartical/demo.mov` を640×388、30fps、H.264 High Profile、YUV 4:2:0、音声なし、faststartで圧縮した `site/products/Bartical/BarticalCardDemo.mp4` を使用する。MOVは入力素材のまま `.temp/` に保持し、公開対象へ含めない。
- `prefers-reduced-motion: reduce` ではカード映像を自動再生せず、posterの静止表示を維持する。設定が実行中に変わった場合も、映像とカルーセルの自動移動を同時に停止・再開する。
