## Webトップページ

https://masashi-desu.github.io/

# Masahi Desu User Site

## 開発とビルド

- ローカル開発: `npm run dev`
- 本番ビルド: `npm run build`
- ビルド成果物の確認: `npm run preview`

公開サイトのソースは `site/` 配下に配置しています。Vite は `site/` 内の HTML を入力として `dist/` を生成し、GitHub Actions は生成された `dist/` を Pages artifact としてアップロードします。

GitHub Pages ではユーザーサイトとしてルート配下に公開されるため、Vite の本番ビルドでは `base` を `/` に設定しています。

## TypeFetch Sparkle appcast

TypeFetch の更新情報は `site/products/TypeFetch/appcast.xml` を正本として、GitHub Pages の次の 2 URL に配信します。

- 正式 URL: `https://masashi-desu.github.io/products/TypeFetch/appcast.xml`
- 旧バージョン互換 URL: `https://masashi-desu.github.io/works/products/TypeFetch/appcast.xml`

旧 URL は TypeFetch 1.1.0 が参照しているため、Vite build で正式 appcast と同一内容を複製します。2 ファイルを手作業で管理しません。

TypeFetch の itch.io 公開前は `.github/workflows/sync-typefetch-appcast.yml` が `operation=preflight` で呼ばれ、version、build、配布 URL、TypeFetch の source SHA、同期要求を一意にする request ID と生成器の実行可否を検証します。preflight は読み取り権限だけを持ち、現行 appcast を runner の一時領域へコピーして生成するため、リポジトリや Pages を変更しません。

itch.io 公開後は同じ workflow が `operation=sync` で呼ばれ、同じ入力検証を通過した場合だけ appcast を生成します。`dc:identifier` に `TypeFetch@<source_sha>` を記録し、build の巻き戻しと、同一 build の別 version／source への再割り当ては拒否します。appcast の生成・単体検証が成功した場合だけ正本を `main` へコミットし、書き込み権限を持たない別 job がその commit を Vite build して、同じ workflow run で Pages artifact をデプロイします。

TypeFetch 側は request ID を含む run 名から今回の同期だけを特定し、Pages deploy の成功終了を待ってから正式／互換 URL の公開 XML を検証します。

ローカルでは次のコマンドで生成規則と正式／互換出力の一致を検証できます。このコマンドは公開処理を行いません。

```sh
npm run test:typefetch-appcast
```

## ローカル検証・一時成果物

公開サイトから参照されない検証資料や作業用生成物は、Git 管理対象外の `.temp/` 配下に作成します。

- 対象例: `design-qa.md`、デザイン比較画像、ブラウザ検証スクリーンショット、オーバーレイ画像、ログ、トレース、レンダー出力、作業用ダウンロード、キャッシュ。
- 配置は `.temp/<task-slug>/` を基本とし、必要に応じて `reports/`、`evidence/`、`downloads/` などへ分けます。
- リポジトリ直下や `site/` 配下へ一時成果物を作成せず、リリース時にステージしません。
- 製品コード、実行時アセット、テストフィクスチャ、継続的に保守する文書として必要な場合だけ、目的を明示して追跡対象へ移します。
- エージェントは `.agents/skills/use-repo-temp-artifacts/SKILL.md` の手順を適用します。

## 長文テキストの改行ポリシー

製品ページなどの長文説明では、HTML の `<br>` ではなく改行コード (`\n`) と `white-space: pre-line;` を組み合わせて改行を表現します。

- 対象の要素には `whitespace-pre-line`（Tailwind）など、改行コードを反映するクラスを付与してください。
- 翻訳/文言テーブルの文字列には必要な位置に `\n` を挿入します。
- この方針により、言語切り替えスクリプトで `textContent` を使ったまま安全に改行を扱えます。

例：`site/products/TypeFetch/index.html` の `data-i18n="body"`。

## エージェント向けテスト記述ガイド

Playwright などで追加する自動テストスクリプトには、以下を必ずファイル先頭のコメントで記載してください。

- **目的**: どの UI/挙動を検証するテストなのか。
- **期待値**: 判定基準となる色・レイアウト・状態などの具体的な値。
- **検証方法**: ページの開き方やステップ、値の取得方法など。

テスト名も内容が判別できるように命名し、後から見た人が意図を理解しやすいようにします。既存例: `tests/playwright/footer-accent-focus.js`, `tests/playwright/surround1x0-light-theme.js`。

X 内蔵ブラウザなどの `WKWebView` で履歴復帰時に `visualViewport` の古い offset が残る条件は、`npm run test:liquidgl-return-position` で再現し、LiquidGL の描画矩形が固定ナビの DOM 矩形と一致することを検証します。
