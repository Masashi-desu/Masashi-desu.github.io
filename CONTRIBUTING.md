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
- 品質ゲート完了後に追跡対象ファイルを変更した場合は、追加差分の影響範囲を再判定し、影響を受ける検証を再実行します。影響しない検証結果は、対象ソース・依存関係・実行環境が変わっていない根拠を記録して再利用できます。判断できなければ検証範囲を広げます。

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

### 共通スクロールの開発

`site/shared/segmented-scroll/` は将来の外部配布を予定するパッケージです。ESMを正本とし、変更時は `npm run build:segmented-scroll` で既存ページ用の `browser.js` を再生成します。必須CSS・型定義・同梱READMEも同じ変更に含めてください。`browser.js` は既存のscript読み込みで必要な実行時アセットのため追跡します。

`npm run test:segmented-scroll-core`、`npm run test:segmented-bundle`、`npm run test:segmented-package`、`npm run test:segmented-package:webkit` は、状態と入力、生成物の一致、配布アーカイブだけでの独立動作・型を検証します。共通入力処理の改修には利用先の入力回帰も束ねた `npm run test:release-scroll` を使えます。変更内容に応じてレイアウトや描画の検証を追加してください。これらはフル検証の `npm test` にも含まれます。設計と公開前の未決事項は [共通セクションスクロール](docs/design/segmented-scroll.md) を参照します。

## リリース品質ゲート

品質保証の主ゲートは、ローカルで改修の影響範囲に応じて選ぶ検証です。通常の改修では変更した処理と利用先の関連挙動を確認し、全機能の検証を一律には求めません。リモートはクリーンなLinux環境での依存解決・ビルド・小さなブラウザ互換性検証に限定します。リモートの成功だけを根拠に必要なローカル検証を省略しないでください。

`main` へのpush前に完全な差分を確認します。次の区分は共通チェックと公開処理の要否を決めるもので、公開物変更というだけでフルゲートにはしません。複数の改修が混在する場合は、それぞれに必要な検証を合わせて実施します。

| 変更区分 | 主な対象 | push前の必須ゲート | push後のGitHub Actions |
| --- | --- | --- | --- |
| 文書・規約のみ | `README.md`、`CONTRIBUTING.md`、`AGENTS.md`、`THIRD_PARTY_LICENSES.md`、`docs/**`、`.agents/**` | `npm run test:docs`、`git diff --check`、参照先と差分の確認 | 起動しない |
| CI・検証のみ | `tests/**`、`tools/**`、`.github/workflows/**`、`package.json` のテスト・開発用scriptやPlaywrightなど。公開入力を変更しない場合 | `npm run test:release-base` と変更した検証処理・接続先の確認。公開画面の目視・Simulator確認は不要 | 軽量な `quality-gate` だけを実行し、公開用buildとdeployは省略 |
| 公開物に影響 | `site/**`、`vite.config.mjs`、`package.json` のruntime依存・Vite・build script、または `package-lock.json` のVite・three.js依存グラフ | `npm run test:release-base`、`npm run build`、影響範囲から選ぶ自動テストと画面確認 | CI成功後にbuildとdeployを実行 |

### 検証範囲の選定

1. 変更ファイルから、変更した処理、直接・間接の利用先、関連操作、対象ブラウザ・端末を追います。ファイル名だけで判断せず、呼び出し元・共有CSS・生成物・設定の依存も確認します。
2. 不具合修正は再現条件を確認するテストを選び、修正箇所と利用先の関連回帰を検証します。共通部品は全利用先の関連挙動を対象としますが、利用先の無関係な機能まで全検証する必要はありません。
3. 変更箇所を検証する既存テストがない場合は、必要な回帰テストまたは具体的な手動確認を追加します。影響範囲と既存テストの対応を説明できない場合は、下記のフルゲートへ広げます。
4. 選定理由・対象ページと環境・実施コマンドと結果・省略した主な検証の理由を `.temp/<task-slug>/reports/` に記録します。比較元commitと検証対象のcommitまたは差分も残します。テストを減らすこと自体を目的にせず、必要な項目に失敗・未実施・確認不能があればpushしません。

代表的な選定例は次の通りです。固定の上限ではなく、差分から必要な検証を追加します。

| 改修内容 | 検証する関係箇所 |
| --- | --- |
| 製品固有の表示・操作 | 当該製品のテストと画面。共有処理を変えた場合は他の利用先も追加 |
| 共通スクロールの入力処理 | `npm run test:release-scroll` でcore・生成bundle・配布パッケージと、ホーム／製品一覧／Surroundのwheel・タッチ・ナビ・フッター回帰を確認。iPad不具合ならWebKitのiPad条件とMobile Safariも対象 |
| 動画・LiquidGL・WebGL | 関連する `npm run test:liquidgl-native`、`npm run test:native-media` または個別テストをmacOSで実行。スクロール変更でも描画同期に影響する場合は追加 |
| テストの束ね方・workflowの接続 | `npm run test:release-base` の構成検証と、変更したコマンド・jobの接続を確認。テスト本体を変更した場合はそのテストも実行 |

### 画面と実行環境の確認

- 公開画面の表示・操作に影響する場合は、`npm run preview` で本番ビルドを配信し、影響するページと環境を確認します。PC表示・操作への影響があれば隔離したPCブラウザを使います。
- モバイルのレイアウト、viewport、safe area、タッチ操作、Safari固有挙動に影響する場合は、関連するWebKit自動テストとiPhone SimulatorのMobile Safari確認を含めます。文書、CI構成、PC固有の変更だけでSimulatorを一律必須にはしません。
- 選んだ画面では変更に関係するレイアウト・操作・視覚効果・動画／LiquidGLを確認し、横方向のオーバーフローとコンソールエラーも確認します。codec、GPU、実時間frameに依存する項目はmacOSで検証し、Linux CIやChromiumの端末エミュレーションで代替しません。
- Simulatorは `xcrun simctl boot <UDID>` と `xcrun simctl bootstatus <UDID> -b` を使います。ユーザーの既存セッションを妨害せず、証跡は `.temp/<task-slug>/evidence/` に保存します。実機固有の入力を再現できない場合は、確認した範囲と限界を記録します。

### フルゲートを実施する条件

影響範囲を特定できない変更、広範なビルド基盤・依存関係・全体CSSの変更、複数機能を横断する大規模な改修ではフルゲートを必須とします。共通部品でも利用先と関連挙動を特定できる場合は、影響範囲に応じた検証を選べます。

フルゲートではmacOSで `npm test`（`npm run test:release-local`）を実行し、`test:full` の全自動テストと `test:local-environment` の動画・GPU検証をすべて通します。公開物変更なら本番buildと影響するPC・Mobile Safari画面の確認も含めます。軽量な `test:ci` はフルゲートの代わりにはなりません。

push前は `git status --short` と `git diff --check` で最終差分を再確認し、選定した検証が最終差分をカバーすることと、一時成果物がステージ対象へ混入していないことを確認します。具体的な実行手順は `.agents/skills/release-quality-gate/SKILL.md` を参照します。

### リモートCIとの分担

通常のPages workflowは文書・規約だけのpushでは起動しません。CI・検証だけの変更では軽量な `npm run test:ci` まで実行し、公開artifactが変わらないため公開用buildとdeployを省略します。CI内の検証用buildは実行します。公開物に影響する変更では、軽量CIの失敗がbuildとdeployをブロックします。

`package.json` のdescriptionなどmetadataだけが変わった場合は、軽量な変更分類jobだけで終了し、テスト、build、deployを実行しません。packageのテストscriptや検証用依存だけが変わった場合はCIまで、Vite、build script、runtime依存、またはそのlockfile依存グラフが変わった場合だけdeployまで進みます。

`site/products/TypeFetch/appcast.xml` だけのpushは通常のPages workflowから除外します。appcast同期workflowが同じcommitを事前検証し、buildしてPagesへdeployするためです。appcastを手作業で編集・pushせず、後述の同期workflowを使用します。

軽量CIは文書・公開範囲分類・品質ゲート構成・appcast・スクロールcore・生成bundleを検証し、本番buildと正式／互換appcast出力を確認します。ブラウザ検証は配布アーカイブだけを使う最小ページをChromiumとWebKitで動かし、型定義、必須CSS、wheel/touch入力、選択と到着、ナビ表示、destroyを確認します。全画面のレイアウト、多数のviewport、長時間アニメーション、実サイトのwheel回帰、3D、H.264、LiquidGL/WebGLはローカルで影響範囲に応じて選び、フルゲート時にはすべて実施します。

`test:ci` の軽量化で `npm test` の範囲が縮まないよう、フル検証は独立した `test:full` を参照します。この分離と両公開workflowの接続は `npm run test:quality-gate-contract` で検証します。

時間を比較するときは、ローカルで選んだコマンド群とその経過時間、Actionsの `quality-gate` job、workflow全体（待機・build・deployを含む）を分けて記録します。計測ログは `.temp/<task-slug>/reports/` に置き、比較元と計測対象のcommit／runを残します。検証範囲が違う計測を同一条件の高速化として扱いません。CI・検証だけのpushは公開用build/deployが省略されるため、以前の公開workflow全体との比較をCI短縮率として扱いません。

### テストコマンドの責務

- `npm run test:docs`: Markdownの参照、npm script、第三者依存、Webフォント、READMEのOpen Graph画像を静的検証する文書専用ゲート。
- `npm run test:release-scope`: push差分の変更区分と、CI・deploy要否の分類規則を検証する。
- `npm run test:release-base`: 文書・公開範囲分類・品質ゲート構成の軽量な共通チェック。これだけで関係箇所の検証を完了したとは扱わない。
- `npm run test:release-scroll`: 共通スクロールの入力改修向けのテスト群。軽量な共通チェック、core、bundle、配布パッケージ、全利用先のwheel／タッチ回帰を含む。build・画面・描画同期の確認は影響に応じて別途追加する。
- `npm run test:quality-gate-contract`: 選択可能なテスト群、維持するフル検証、CIの軽量な部分集合、両公開workflowの検証接続を確認する。
- `npm run test:full`: 非ブラウザ、PC、Mobile Chromium、WebKitの全テスト。従来のCI全検証を保持し、macOS固有の検証は含まない。
- `npm run test:ci`: 非ブラウザ検証（buildを含む）と `test:ci:browser` だけを実行する、リモート向けの最小ゲート。
- `npm run test:ci:browser`: 配布パッケージの小さな独立ページをChromium／WebKitで検証する。全画面のブラウザテストは実行しない。
- `npm run test:local-environment`: macOS の codec・GPU・WebGL・実時間動画 frame に依存する自動テスト。CI では実行しない。
- `npm run test:release-local`: `test:full` と `test:local-environment` を順に実行するローカルの全自動ゲート。フルゲートを選んだときにmacOSで実行する。
- `npm test`: `test:release-local` の別名としてフル検証を維持する。毎回のリリースで必須ではなく、通常は `test:release-base` と影響範囲に対応する個別テスト・テスト群を選ぶ。

## TypeFetch Sparkle appcast

TypeFetch の更新情報は `site/products/TypeFetch/appcast.xml` を正本として、GitHub Pages の次の 2 URL に配信します。

- 正式 URL: `https://masashi-desu.github.io/products/TypeFetch/appcast.xml`
- 旧バージョン互換 URL: `https://masashi-desu.github.io/works/products/TypeFetch/appcast.xml`

旧 URL は TypeFetch 1.1.0 が参照しているため、Vite build で正式 appcast と同一内容を複製します。2 ファイルを手作業で管理しません。

TypeFetch の itch.io 公開前は `.github/workflows/sync-typefetch-appcast.yml` が `operation=preflight` で呼ばれ、version、build、配布 URL、TypeFetch の source SHA、同期要求を一意にする request ID と生成器の実行可否を検証します。preflight は読み取り権限だけを持ち、現行 appcast を runner の一時領域へコピーして生成するため、リポジトリや Pages を変更しません。

itch.io 公開後は同じ workflow が `operation=sync` で呼ばれ、同じ入力検証を通過した場合だけ appcast を生成します。`dc:identifier` に `TypeFetch@<source_sha>` を記録し、build の巻き戻しと、同一 build の別 version／source への再割り当ては拒否します。ローカルを通らないappcast専用の自動更新なので、`npm run test:typefetch-appcast` で生成規則・本番build・正式／互換XML出力を確認してから正本を `main` へコミットします。書き込み権限を持たない別 job がそのcommitをbuildし、XML出力を再確認してからPagesへデプロイします。この経路ではPlaywrightをインストールせず、サイト全体のブラウザテストも再実行しません。公開サイトの実装に必要な影響範囲の検証は通常のローカルリリース時に完了済みであることを前提とします。

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
