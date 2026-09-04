# Third-Party Licenses

Masahi Desu User Site が公開物、ビルド、テストで直接または間接的に利用する第三者ソフトウェアとWebフォントを記載します。バージョンは、配信ファイルのヘッダー、`package.json`、`package-lock.json` に基づく2026-08-23時点の値です。

各ライセンス名は SPDX のライセンス本文へ、各コンポーネント名は公式サイト、公式リポジトリ、またはnpmパッケージページへリンクしています。配信ファイルに個別のライセンス通知がある場合は、その通知を優先して参照してください。

プロジェクト独自のソースとアセット、OS・ブラウザ・Ruby・Node.jsの標準機能、リンク先でのみ利用されていて本リポジトリでは配布・実行しないソフトウェアは対象外です。

## 公開サイトで配信・実行するライブラリ

| 名称 | バージョン | 利用箇所 | ライセンス |
| --- | --- | --- | --- |
| [Embla Carousel](https://www.embla-carousel.com/) | 8.6.0 | ホームの製品カルーセル。`site/vendor/embla-carousel.umd.js` として配信 | [MIT](https://spdx.org/licenses/MIT.html) |
| [Embla Carousel Auto Scroll](https://www.embla-carousel.com/plugins/auto-scroll/) | 8.6.0 | 製品カルーセルの自動スクロール。`site/vendor/embla-carousel-auto-scroll.umd.js` として配信 | [MIT](https://spdx.org/licenses/MIT.html) |
| [Embla Carousel Wheel Gestures](https://github.com/xiel/embla-carousel-wheel-gestures) | 8.1.0 | 製品カルーセルのホイール操作。`site/vendor/embla-carousel-wheel-gestures.umd.js` として配信 | [MIT](https://spdx.org/licenses/MIT.html) |
| [wheel-gestures](https://github.com/xiel/wheel-gestures) | 2.2.48 | Embla Carousel Wheel Gesturesへ組み込まれる間接依存。バージョンはlockfile上の解決値 | [MIT](https://spdx.org/licenses/MIT.html) |
| [liquidGL](https://github.com/naughtyduk/liquidGL) | 2.0.1<br>upstream `28e7c1a64a96c46449e9f494acee98c8490d9824` | WebGLによるガラス表現。`site/vendor/liquidGL.js` はローカル統合変更を含む | [MIT](https://spdx.org/licenses/MIT.html)（[同梱通知](./site/vendor/liquidGL.LICENSE.txt)） |
| [Lucide](https://lucide.dev/) | 1.31.0 | Barticalページのアイコンsubset。`site/vendor/bartical-lucide.min.js` として配信 | [ISC](https://spdx.org/licenses/ISC.html)。Feather由来アイコンは[MIT](https://spdx.org/licenses/MIT.html)（[同梱通知](./site/vendor/lucide.LICENSE.txt)） |
| [Feather Icons](https://github.com/feathericons/feather) | Lucide 1.31.0の由来通知に準拠 | Lucide subsetに含まれる一部アイコンの原著作物 | [MIT](https://spdx.org/licenses/MIT.html)（[同梱通知](./site/vendor/lucide.LICENSE.txt)） |
| [Simple Icons](https://simpleicons.org/) | 16 | BarticalとTypeFetchのitch.ioアイコン、およびSurround1x0-AKDKのGitHubアイコン。jsDelivr CDNからSVGを読み込み | [CC0-1.0](https://spdx.org/licenses/CC0-1.0.html) |
| [three.js](https://threejs.org/) | 0.180.0 | Surround1x0-AKDKページの3D表示。Viteが配信用JavaScriptへbundle | [MIT](https://spdx.org/licenses/MIT.html) |

## Google Fontsから読み込むWebフォント

次のフォントはリポジトリへ複製せず、各ページがGoogle Fontsから読み込みます。OS標準フォントとフォールバックフォントは対象外です。

| 名称 | 利用箇所 | ライセンス |
| --- | --- | --- |
| [Geist Mono](https://fonts.google.com/specimen/Geist+Mono) | TypeFetch | [SIL Open Font License 1.1](https://spdx.org/licenses/OFL-1.1.html) |
| [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans) | ホーム、製品一覧、Surround1x0-AKDK、ソーシャル画像生成 | [SIL Open Font License 1.1](https://spdx.org/licenses/OFL-1.1.html) |
| [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) | ホーム、製品一覧、Surround1x0-AKDK、ソーシャル画像生成 | [SIL Open Font License 1.1](https://spdx.org/licenses/OFL-1.1.html) |
| [Inter Tight](https://fonts.google.com/specimen/Inter+Tight) | ホーム、製品一覧、Surround1x0-AKDK | [SIL Open Font License 1.1](https://spdx.org/licenses/OFL-1.1.html) |
| [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) | TypeFetch、ソーシャル画像生成 | [SIL Open Font License 1.1](https://spdx.org/licenses/OFL-1.1.html) |
| [Outfit](https://fonts.google.com/specimen/Outfit) | TypeFetch、WinKinesis、RetreatScreen | [SIL Open Font License 1.1](https://spdx.org/licenses/OFL-1.1.html) |

## ビルド・テストで直接利用するツール

これらは公開サイトのブラウザ実行コードには含めず、開発環境とCIで利用します。

| 名称 | バージョン | 用途 | ライセンス |
| --- | --- | --- | --- |
| [Playwright](https://playwright.dev/) | 1.59.1 | Chromium、WebKitを使うブラウザテストとソーシャル画像生成 | [Apache License 2.0](https://spdx.org/licenses/Apache-2.0.html) |
| [Rolldown](https://rolldown.rs/) | 1.1.5 | Bartical用Lucide subsetの生成。Viteの間接依存としても利用 | [MIT](https://spdx.org/licenses/MIT.html) |
| [Vite](https://vite.dev/) | 8.1.4 | 開発サーバーと本番ビルド | [MIT](https://spdx.org/licenses/MIT.html) |

## npmの間接依存

`package-lock.json` が固定する間接依存を記載します。プラットフォーム別optional packageは、利用環境に合うものだけがインストール・実行されます。上の表に掲載済みの直接依存と `wheel-gestures` は重複掲載していません。

| 名称 | バージョン | ライセンス |
| --- | --- | --- |
| [@emnapi/core](https://www.npmjs.com/package/@emnapi/core) | 1.11.1 | [MIT](https://spdx.org/licenses/MIT.html) |
| [@emnapi/runtime](https://www.npmjs.com/package/@emnapi/runtime) | 1.11.1 | [MIT](https://spdx.org/licenses/MIT.html) |
| [@emnapi/wasi-threads](https://www.npmjs.com/package/@emnapi/wasi-threads) | 1.2.2 | [MIT](https://spdx.org/licenses/MIT.html) |
| [@napi-rs/wasm-runtime](https://www.npmjs.com/package/@napi-rs/wasm-runtime) | 1.1.6 | [MIT](https://spdx.org/licenses/MIT.html) |
| [@oxc-project/types](https://www.npmjs.com/package/@oxc-project/types) | 0.139.0 | [MIT](https://spdx.org/licenses/MIT.html) |
| [@rolldown/pluginutils](https://www.npmjs.com/package/@rolldown/pluginutils) | 1.0.1 | [MIT](https://spdx.org/licenses/MIT.html) |
| [@tybys/wasm-util](https://www.npmjs.com/package/@tybys/wasm-util) | 0.10.3 | [MIT](https://spdx.org/licenses/MIT.html) |
| [detect-libc](https://www.npmjs.com/package/detect-libc) | 2.1.2 | [Apache License 2.0](https://spdx.org/licenses/Apache-2.0.html) |
| [fdir](https://www.npmjs.com/package/fdir) | 6.5.0 | [MIT](https://spdx.org/licenses/MIT.html) |
| [fsevents](https://www.npmjs.com/package/fsevents) | 2.3.2、2.3.3 | [MIT](https://spdx.org/licenses/MIT.html) |
| [lightningcss](https://www.npmjs.com/package/lightningcss) | 1.32.0 | [Mozilla Public License 2.0](https://spdx.org/licenses/MPL-2.0.html) |
| [nanoid](https://www.npmjs.com/package/nanoid) | 3.3.15 | [MIT](https://spdx.org/licenses/MIT.html) |
| [picocolors](https://www.npmjs.com/package/picocolors) | 1.1.1 | [ISC](https://spdx.org/licenses/ISC.html) |
| [picomatch](https://www.npmjs.com/package/picomatch) | 4.0.5 | [MIT](https://spdx.org/licenses/MIT.html) |
| [playwright-core](https://www.npmjs.com/package/playwright-core) | 1.59.1 | [Apache License 2.0](https://spdx.org/licenses/Apache-2.0.html) |
| [postcss](https://www.npmjs.com/package/postcss) | 8.5.16 | [MIT](https://spdx.org/licenses/MIT.html) |
| [source-map-js](https://www.npmjs.com/package/source-map-js) | 1.2.1 | [BSD 3-Clause](https://spdx.org/licenses/BSD-3-Clause.html) |
| [tinyglobby](https://www.npmjs.com/package/tinyglobby) | 0.2.17 | [MIT](https://spdx.org/licenses/MIT.html) |
| [tslib](https://www.npmjs.com/package/tslib) | 2.8.1 | [BSD Zero Clause](https://spdx.org/licenses/0BSD.html) |

### Rolldownのプラットフォーム別optional package

すべてバージョン1.1.5、[MIT](https://spdx.org/licenses/MIT.html)です。

- `@rolldown/binding-android-arm64`
- `@rolldown/binding-darwin-arm64`
- `@rolldown/binding-darwin-x64`
- `@rolldown/binding-freebsd-x64`
- `@rolldown/binding-linux-arm-gnueabihf`
- `@rolldown/binding-linux-arm64-gnu`
- `@rolldown/binding-linux-arm64-musl`
- `@rolldown/binding-linux-ppc64-gnu`
- `@rolldown/binding-linux-s390x-gnu`
- `@rolldown/binding-linux-x64-gnu`
- `@rolldown/binding-linux-x64-musl`
- `@rolldown/binding-openharmony-arm64`
- `@rolldown/binding-wasm32-wasi`
- `@rolldown/binding-win32-arm64-msvc`
- `@rolldown/binding-win32-x64-msvc`

### Lightning CSSのプラットフォーム別optional package

すべてバージョン1.32.0、[Mozilla Public License 2.0](https://spdx.org/licenses/MPL-2.0.html)です。

- `lightningcss-android-arm64`
- `lightningcss-darwin-arm64`
- `lightningcss-darwin-x64`
- `lightningcss-freebsd-x64`
- `lightningcss-linux-arm-gnueabihf`
- `lightningcss-linux-arm64-gnu`
- `lightningcss-linux-arm64-musl`
- `lightningcss-linux-x64-gnu`
- `lightningcss-linux-x64-musl`
- `lightningcss-win32-arm64-msvc`
- `lightningcss-win32-x64-msvc`

## 更新方針

- `package.json` または `package-lock.json` を変更したときは、直接依存、間接依存、バージョン、ライセンスを本書と同期します。
- `site/vendor/` に第三者コードを追加・更新したときは、配信ファイルのバージョン、upstream、ライセンス通知を確認して本書へ反映します。
- Google Fontsの読み込みを変更したときは、フォント名、公式リンク、ライセンスを本書と同期します。
