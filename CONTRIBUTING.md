# Contributing

この文書は Masahi Desu User Site の開発、ブランチ、テスト、リリース、成果物管理に関する正本です。

## 基本方針

- 公開サイトのソースと実行時アセットは `site/` 配下で管理します。
- Vite が生成する `dist/` は手作業で編集せず、コミットしません。
- 画面仕様、リリース手順、検証方法、ディレクトリ責務を変更するときは、関連する実装、テスト、文書、Skill、workflow も同じ変更範囲で更新します。
- 1 つの挙動変更に必要な実装、テスト、仕様、Skill は、分断せずアトミックにコミットします。
- 現行仕様と歴史資料を同じ正本として扱いません。歴史資料を残す場合は、最寄りの `README.md` で状態と現行の参照先を明示します。
- 第三者ソフトウェアまたはWebフォントを追加・更新・削除するときは、`THIRD_PARTY_LICENSES.md` の名称、参照先、バージョン、ライセンスも同期します。

## ブランチ運用

- 開発は原則としてローカルの `main` ブランチで行います。
- ローカルの `main` からリモートの `main` へ fast-forward で pushします。文書だけの変更ではGitHub Actionsを起動せず、CIだけに影響する変更ではテストだけを実行し、公開物に影響する変更でGitHub Pagesへのデプロイを開始します。
- push 前に必要に応じてリモートの更新を取り込み、ローカルとリモートの `main` を同期します。
- `main` へ push する前に、変更区分に対応する「リリース品質ゲート」を完了します。失敗、未実施、確認不能の必須項目がある状態では push しません。
- 品質ゲート完了後に追跡対象ファイルを変更した場合は、変更区分を再判定し、該当するゲートを最初から再実行します。

## ディレクトリ責務

```text
.
├── .agents/
│   └── skills/       特定作業を再現可能に実行するための手順を管理する
├── .github/
│   └── workflows/    CI、検証、リリース、GitHub Pages へのデプロイを管理する
├── .temp/            公開・実行・継続保守に不要な一時成果物を置く。Git では追跡しない
├── AGENTS.md          Agent harness の作業規約と Skill の適用規則を管理する
├── CONTRIBUTING.md    開発、ブランチ、テスト、リリース、成果物管理の規約を管理する
├── README.md          プロジェクト概要と公開仕様を管理する
├── THIRD_PARTY_LICENSES.md
│                       第三者ソフトウェアとWebフォントの名称、参照先、ライセンスを管理する
├── dist/             Vite が生成する配信用成果物を置く。手作業で編集・コミットしない
├── docs/             現行仕様と、状態を明示した歴史資料を管理する
├── site/             公開サイトのソース、実行時アセット、配信対象ファイルを管理する
├── tests/            継続して実行する自動テストと保守対象のテスト資源を管理する
└── tools/            開発、ビルド、検証、リリースを補助するスクリプトを管理する
```

## 開発とビルド

- ローカル開発: `npm run dev`
- 本番ビルド: `npm run build`
- ビルド成果物の確認: `npm run preview`

## リリース品質ゲート

`main` へのpush前に完全な差分を確認し、次のうち最も強い変更区分のゲートを適用します。異なる区分が混在する場合は、上位の区分へ合わせます。

| 変更区分 | 主な対象 | push前の必須ゲート | push後のGitHub Actions |
| --- | --- | --- | --- |
| 文書・規約のみ | `README.md`、`CONTRIBUTING.md`、`AGENTS.md`、`THIRD_PARTY_LICENSES.md`、`docs/**`、`.agents/**` | `npm run test:docs`、`git diff --check`、参照先と差分の確認 | 起動しない |
| CI・検証のみ | `tests/**`、`tools/**`、`.github/workflows/**`、`package.json` のテスト・開発用scriptやPlaywrightなど。公開入力を変更しない場合 | `npm run test:ci`。macOS固有テストを変更した場合は、対応する `npm run test:local-environment` も実行 | `quality-gate` だけを実行し、buildとdeployは省略 |
| 公開物に影響 | `site/**`、`vite.config.mjs`、`package.json` のruntime依存・Vite・build script、または `package-lock.json` のVite・three.js依存グラフ | 下記の完全な公開ゲート | CI成功後にbuildとdeployを実行 |

完全な公開ゲートは次の通りです。

1. macOSで `npm test`（`npm run test:release-local` の別名）を実行し、CI再現可能な全自動テストとローカル環境依存テストをパスさせる。
2. `npm test` 内の `npm run test:ci` に含まれる `npm run test:pc-browser` と `npm run test:webkit` がパスしていることを確認する。これらはDOM、状態、レイアウトなどLinux runnerでも決定的に判定できる範囲を検証する。
3. `npm test` 内の `npm run test:local-environment` で、macOS Chromium／WebKitのH.264デコード、LiquidGLの実動画frame・texture更新、WebGL context復帰を確認する。codec、GPU、実時間frameに依存する判定はCIで代替しない。
4. `npm run build` と `npm run preview` で本番ビルドを配信し、通常のPCブラウザで対象画面を目視確認する。
5. `xcrun simctl boot <UDID>` で起動した利用可能なiPhone SimulatorのMobile Safariで対象画面を確認する。`xcrun simctl bootstatus <UDID> -b` で起動完了を待ってから確認する。
6. PCブラウザとiPhone Simulatorの確認では、変更箇所のレイアウト、操作、主要な視覚効果、動画・LiquidGL、横方向のオーバーフロー、コンソールエラーの有無を確認する。
7. `git status --short` でリリース対象を確定し、一時的なスクリーンショットやログが `.temp/` の外やステージ対象に混入していないことを確認する。

ブラウザ確認は公開物に影響する場合だけ行います。ユーザーの既存セッションを妨害しない隔離環境を使い、証跡は `.temp/<task-slug>/evidence/` に保存します。具体的な実行順序は `.agents/skills/release-quality-gate/SKILL.md` を正本とします。

通常のPages workflowは文書・規約だけのpushでは起動しません。CI・検証だけの変更では `npm run test:ci` まで実行し、公開artifactが変わらないためbuildとdeployを省略します。公開物に影響する変更では、`npm run test:ci` の失敗がbuildとdeployをブロックします。

`package.json` のdescriptionなどmetadataだけが変わった場合は、軽量な変更分類jobだけで終了し、テスト、build、deployを実行しません。packageのテストscriptや検証用依存だけが変わった場合はCIまで、Vite、build script、runtime依存、またはそのlockfile依存グラフが変わった場合だけdeployまで進みます。

`site/products/TypeFetch/appcast.xml` だけのpushは通常のPages workflowから除外します。appcast同期workflowが同じcommitを事前検証し、buildしてPagesへdeployするためです。appcastを手作業で編集・pushせず、後述の同期workflowを使用します。

CIはPCブラウザとWebKitの決定的な自動テストを再検証しますが、H.264デコード、GPU／WebGLの実装差、実時間動画frame、`xcrun simctl boot` によるiPhone Safari確認、目視確認の代替にはなりません。これらは公開物に影響する変更のmacOSローカルpush前ゲートとして必須です。

### テストコマンドの責務

- `npm run test:docs`: Markdownの参照、npm script、第三者依存、Webフォント、READMEのOpen Graph画像を静的検証する文書専用ゲート。
- `npm run test:release-scope`: push差分の変更区分と、CI・deploy要否の分類規則を検証する。
- `npm run test:ci`: Linux runner で再現可能な非ブラウザ、Chromium、Mobile Chromium、WebKit の全テスト。Actions で実行する。
- `npm run test:local-environment`: macOS の codec・GPU・WebGL・実時間動画 frame に依存する自動テスト。CI では実行しない。
- `npm run test:release-local`: `test:ci` と `test:local-environment` を順に実行するローカルリリースゲート。
- `npm test`: `test:release-local` の別名。リリース前は macOS で実行する。

## TypeFetch Sparkle appcast

TypeFetch の更新情報は `site/products/TypeFetch/appcast.xml` を正本として、GitHub Pages の次の 2 URL に配信します。

- 正式 URL: `https://masashi-desu.github.io/products/TypeFetch/appcast.xml`
- 旧バージョン互換 URL: `https://masashi-desu.github.io/works/products/TypeFetch/appcast.xml`

旧 URL は TypeFetch 1.1.0 が参照しているため、Vite build で正式 appcast と同一内容を複製します。2 ファイルを手作業で管理しません。

TypeFetch の itch.io 公開前は `.github/workflows/sync-typefetch-appcast.yml` が `operation=preflight` で呼ばれ、version、build、配布 URL、TypeFetch の source SHA、同期要求を一意にする request ID と生成器の実行可否を検証します。preflight は読み取り権限だけを持ち、現行 appcast を runner の一時領域へコピーして生成するため、リポジトリや Pages を変更しません。

itch.io 公開後は同じ workflow が `operation=sync` で呼ばれ、同じ入力検証を通過した場合だけ appcast を生成します。`dc:identifier` に `TypeFetch@<source_sha>` を記録し、build の巻き戻しと、同一 build の別 version／source への再割り当ては拒否します。appcast の生成・単体検証に加えて `npm run test:ci` が成功した場合だけ正本を `main` へコミットし、書き込み権限を持たない別 job がその commit を Vite build して、同じ workflow run で Pages artifact をデプロイします。環境依存テストは通常のローカルリリース時に完了済みであることを前提とし、Linux runner では再実行しません。

TypeFetch 側は request ID を含む run 名から今回の同期だけを特定し、Pages deploy の成功終了を待ってから正式／互換 URL の公開 XML を検証します。

ローカルでは次のコマンドで生成規則と正式／互換出力の一致を検証できます。このコマンドは公開処理を行いません。

```sh
npm run test:typefetch-appcast
```

## ローカル検証・一時成果物

公開サイトから参照されない検証資料や作業用生成物は、Git 管理対象外の `.temp/` 配下に作成します。

- 対象例: `design-qa.md`、デザイン比較画像、ブラウザ検証スクリーンショット、オーバーレイ画像、ログ、トレース、レンダー出力、作業用ダウンロード、キャッシュ。
- 配置は `.temp/<task-slug>/` を基本とし、必要に応じて `reports/`、`evidence/`、`downloads/` などへ分けます。
- リポジトリ直下や `site/` 配下へ一時成果物を作成せず、`.temp/` 内のファイルはステージ、コミット、リリースしません。
- ユーザーが明示した場合、または製品コード、実行時アセット、テストフィクスチャ、継続的に保守する文書として必要な場合だけ、目的を明示して追跡対象へ移します。エージェントは昇格理由を最終報告に記載します。
- リリース前に `git status --short` と `git check-ignore .temp/<path>` を確認し、一時成果物が追跡対象へ混入していないことを検証します。
- エージェントは `.agents/skills/use-repo-temp-artifacts/SKILL.md` の手順を適用します。

## 実装ガイド

### 翻訳可能な複数行テキスト

翻訳対象の見出しや説明文で意図的な改行を維持するときは、HTML の `<br>` ではなく改行コード (`\n`) と `white-space: pre-line;` を組み合わせます。

- 対象の要素には、ページ固有 CSS の `whitespace-pre-line` クラス、または同等の `white-space: pre-line;` を適用します。
- 翻訳・文言テーブルの文字列には必要な位置に `\n` を挿入します。
- 言語切り替えスクリプトでは `textContent` を使ったまま安全に改行を扱います。

例: `site/products/TypeFetch/index.html` の `data-i18n="heroLede"` と、`site/products/TypeFetch/typefetch-home.js` の同名翻訳文字列。

### 自動テストの記述

Playwright などで追加する自動テストスクリプトには、次の内容をファイル先頭のコメントに記載します。

- **目的**: どの UI・挙動を検証するテストなのか。
- **期待値**: 判定基準となる色、レイアウト、状態などの具体的な値。
- **検証方法**: ページの開き方、操作手順、値の取得方法など。

テスト名も内容が判別できるように命名します。既存例は `tests/playwright/footer-accent-focus.js` と `tests/playwright/surround1x0-light-theme.js` です。製品一覧と LiquidGL に固有の回帰条件と対応コマンドは `docs/design/product-catalog.md` を参照します。
