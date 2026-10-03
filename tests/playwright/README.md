# ブラウザテストの構成

既存の Node.js + Playwright Library のテストコマンドを維持し、Page Object Model（POM）で画面の操作・状態取得とテストの期待値を分離します。

## 配置と責務

- `pages/`: Home、Catalog、RetreatScreen、TypeFetch、Bartical、Surround のページクラス。`SitePage` は共通フッターを保持し、`ProductPage` は製品詳細の戻りリンクを扱います。
- `components/`: 複数ページで使うUI。`FooterControls` は言語・テーマ選択、focus style、スマホのコピーライト位置を取得します。
- `support/`: 画面に依存しない準備。`static-server.js` は `site/` を一時的なloopbackポートで配信し、`fixture-fetch.js` はfile URLの遷移テストで製品JSONとフッターを供給します。
- 直下のテスト: 期待値、assert、ブラウザ・viewport・メディア設定、シナリオ、診断情報を保持します。Page Object はassertを持ちません。

```js
const { CatalogPage } = require('./pages/catalog-page');
const catalog = new CatalogPage(page);
await catalog.nextPage();
const state = await catalog.readPaginationState();
assert(state.page === '2', 'Second page was not selected');
```

操作と状態取得は必要になった時点で該当クラスへ追加します。Playwright APIをそのまま転送するだけの汎用クラスや、全ページを扱う巨大なクラスは作りません。同じページの複数テストで使う操作・ロケーターはクラスの既存メソッドまたは公開Locatorを再利用します。

GPU・実時間動画frame・scroll controller・時計制御・イベント欠落の注入・描画サンプルなど、特定の不具合を再現する計測処理はテスト内に残します。テスト固有のDOM観測まで一律にPage Objectへ移す必要はありません。通常の操作と再利用する状態取得を優先してPOMへ集約します。

## 重複を見直す基準

同じブラウザ・入力経路・前提条件・期待値を繰り返す場合は、条件をパラメーター化し、準備や観測を共通化します。画面幅に依存しないリンク属性はテーマごとに確認し、幅ごとの確認では配色・アイコン配置・折り返し・overflowを検証します。

次のテストは似た操作でも別の回帰条件を持つため維持します。

- ホームのChromium/CDPスワイプとWebKitの合成touch: 実ブラウザの入力経路と、Safariのcancelable・scrollTo欠落・stale touch対策。
- 共通wheel回帰とページ固有のtouch回帰: 入力しきい値・gesture lockと、短いpagination/footer停止点や位置修復。
- catalogの動画登録とnative media検証: DOM差し替え後の登録・破棄と、macOSのH.264・GPU・実時間frame更新。
- 共通footer accent検証とTypeFetchテーマ検証: 全利用ページのアクセントと、Chromium/WebKitでのテーマ切替・配色・focus背景・永続化・OS追従。
- PC/mobileのレイアウトとChromium/WebKit: viewport・CSS・ブラウザ実装に依存する別条件。

`migration-regression-compare.js` と `theme-transition-mpc.js` は比較・計測用の補助スクリプトで、通常のnpmテスト群には含みません。通常テストの重複として削除せず、必要時に明示的に実行します。

テストコマンドと検証範囲の選定は [CONTRIBUTING.md](../../CONTRIBUTING.md) を正本とします。POMや共通supportを変更した場合は利用するテストを実行し、複数機能を横断する大規模な改修ではmacOSの `npm test` でフルゲートを確認します。

## 参考

- [依頼の参照記事: QA Auto Lab のPage Object Model入門](https://qa-auto-lab.com/2026/04/04/page-object-model-jp/)
- [Playwright公式: Page object models](https://playwright.dev/docs/pom)
