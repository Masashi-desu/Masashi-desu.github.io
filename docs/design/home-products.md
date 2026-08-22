# ホーム Product セクション

## レスポンシブレイアウト

- Product セクションは、ラベルとタイトルだけの見出し、プロダクトカルーセル、「プロダクト一覧」CTA を1つのコンテンツ群として表示領域の縦中央に配置する。見出し下に説明キャプションは置かない。
- 幅 `36rem` 以下のスマホ表示でも縦中央配置を維持し、コンテンツ下側だけに大きな空白を残さない。
- 高さの低い表示では、見出しキャプションを置かないことでカードの高さを確保し、カード内の説明を2行まで表示する。CTA はカルーセルより下に置き、カードやCTAを重ねず、横方向のオーバーフローを発生させない。

## カード映像

- `site/products/index.json`（公開URLは `/products/index.json`）に `video` があるプロダクトは、`header` の静止画をposterとして保ちながら、カードのメディア領域でミュート・インライン・自動ループ再生する。
- Barticalカードは640×388、30fps、H.264 High Profile、YUV 4:2:0、音声なし、faststartの `site/products/Bartical/BarticalCardDemo.mp4` を使用する。変換元など継続保守に不要な素材を残す場合は `.temp/` で管理し、公開対象や仕様上の必須入力にしない。
- TypeFetchとWinKinesisは既存GIFを30fps、H.264、YUV 4:2:0、音声なし、faststartのMP4へ変換し、それぞれ `site/products/TypeFetch/TypeFetchCatalog.mp4` と `site/products/WinKinesis/winkinesis.mp4` をカード映像に使用する。元GIFはposterと既存用途のために維持する。
- Barticalカードの映像はレスポンシブ時も上端を基準に切り抜き、映像上端のメニューバーを優先して表示範囲へ収める。
- `prefers-reduced-motion: reduce` ではカード映像を自動再生せず、posterの静止表示を維持する。設定が実行中に変わった場合も、映像とカルーセルの自動移動を同時に停止・再開する。

## カードアイコン

- カード内のアイコンは、アプリごとの画像内余白を考慮し、見えているアイコン本体の大きさを揃える。
- BarticalはmacOS上の実アプリ表示と同じ光学余白を持つ `BarticalAppIcon.png` を維持しつつ、256px画像内の222pxの不透明領域が他アプリと同寸になるよう、ホームカード内だけ `256 / 222` 倍に拡大表示する。
