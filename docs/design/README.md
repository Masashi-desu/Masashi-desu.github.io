# デザイン資料の状態

このディレクトリの Markdown は、現行実装とテストに同期して保守する画面仕様です。

- `home-philosophy.md`: ホーム Philosophy セクション
- `home-products.md`: ホーム Product セクション
- `product-catalog.md`: プロダクト一覧

## 歴史資料

`works.pen` は2026-04-19時点の7画面を再構成したテーマ比較ボードです。その後の `site/` へのソース移動、TypeFetchの再設計、Barticalの追加などを反映しておらず、画像参照も移動前の `products/` 配置を前提としています。

このファイルはデザイン履歴として保存しますが、現行画面の実装根拠や受け入れ基準には使用しません。現行仕様は上記Markdown、`docs/products/*.md`、`site/`、対応する自動テストを参照してください。`works.pen` を再び現行仕様へ昇格する場合は、Pencil CLIで現在の全対象画面とアセット参照を更新し、構造とプレビューを検証してから本項の状態を変更します。
