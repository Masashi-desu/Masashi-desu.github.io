# Segmented Scroll

ページめくりのような縦スクロール、現在のセクション、入力ロックを管理する、将来の外部配布を予定したライブラリです。現在はサイト内で利用・検証する未公開の開発版です。npm 名 `@masahi-desu/segmented-scroll` とバージョンは暫定で、公開ライセンス・正式な配布先・互換性方針は公開前に決定します。意図しない公開を防ぐため `private: true` としています。

初版の対象は **window/document 全体の縦スクロール** です。入れ子の要素スクローラー、横方向のページ送り、フレームワーク専用アダプターは対象外です。実行時依存はありません。JavaScript無効時の通常スクロール、各セクションの高さや装飾は利用側で用意します。

## 使い方

ESM の `index.js` と **必須の `styles.css`** を読み込みます。バンドラーを使う場合の例です（未公開なので現時点ではローカルのパッケージを参照します）。

```js
import { createScrollController, createSegmentView } from '@masahi-desu/segmented-scroll';
import '@masahi-desu/segmented-scroll/styles.css';

const navigation = createScrollController({
  getStops: () => [...document.querySelectorAll('section')].map(element => ({
    id: element.id,
    element
  }))
});
const view = createSegmentView({
  track: document.querySelector('nav'),
  controls: document.querySelectorAll('nav button'),
  getTargetId: button => button.dataset.target
});
view.connect(navigation);
const unsubscribe = navigation.subscribe(event => {
  if (event.type === 'navigationend') {
    console.log('到着', event.state.settledId);
  }
});
navigation.mount();
// ボタン操作やURL変更は利用側で結び付ける。
// navigation.goTo('details', { source: 'button' });
// DOMを追加・削除したら navigation.refresh();
// アンマウント時: unsubscribe(); view.destroy(); navigation.destroy();
```

通常の script では `browser.js` が `window.MDWSegmentedScroll` を公開します。ESMと同じAPIです。`browser.js` はESMから生成する互換用の実行時アセットで、直接編集しません。

## 状態とイベント

| API | 意味 |
| --- | --- |
| `activeId` | 選択中の停止点。移動開始時に変わるため、到着を意味しない |
| `activeContentId` | 補助停止点にいても維持するコンテンツのID |
| `targetId` / `pendingId` | 進行中の移動先。完了・中断後は空文字。`pendingId` は互換用の別名 |
| `settledId` | 最後に位置の一致を確認した停止点。移動中も前回のIDを保持し、現在位置を保証しない |
| `moving` / `aligning` | 移動処理中／最終位置の補正中 |
| `navigationLocked` | 移動に伴う時間ロック |
| `wheelLocked` / `touchLocked` | 現在の入力ジェスチャーを消費済み |
| `locked` | 上記3種類のロックのいずれかが有効 |

`subscribe(listener)` は購読解除関数を返します。イベントは `activechange`、`navigationstart`、`navigationend`、`navigationcancel`、`lockchange`、`destroy` です。各イベントは読み取り専用の `state` スナップショットを持ちます。購読中に別の移動を始めた場合も通知は発生順に配送し、古い状態が最後に表示されないようにします。通知先はイベント発生時点の購読先で、配送中に追加された通知も同じ順序で処理します。`activechange` は `refresh()` 時にも表示同期のため通知し、停止点が空になった場合の `stop` は `null` です。

`navigationend` は設定された補正期間を終え、実測位置が停止点の1px以内であることを確認してから通知します。中断理由は `superseded`、`destroyed`、`stop-removed`、`stop-unavailable`、`alignment-failed` です。`setActive()` は選択だけを変え、スクロールや到着判定をしません。`getState()` は状態のコピー、`getStop()` / `getStops()` は記述子の読み取りAPIです。内部の可変indexは公開しません（DOM要素自体の所有者は利用側です）。

`createSegmentView` はclass・ARIA・インジケーターを描画する任意の表示層です。状態を変更せず、クリックイベントも登録しません。`connect()` は状態購読とresize/ナビ内scrollを接続し、返された関数または `destroy()` で解除できます。controllerを再mountする場合はviewも再connectしてください。

## 入力と組み込み時の契約

- wheel は小数も含め86pxで1区間移動し、最後の入力から180ms静止するまで同じジェスチャーとして消費します。OS判定には依存しません。
- wheel/touch の方向移動は、停止点の認識範囲内かつ位置差が4pxまたはviewport高の2%（大きい方）以内なら、その停止点を起点にします。数pxのずれで現在セクションを再選択しません。広い補助停止点・カスタム表示判定を到着と扱わず、範囲外では実測位置から次の停止点を探します。`activeId` だけを根拠に飛び越しません。`eventRegion` とタッチ開始時の補助停止点は引き続き優先します。
- `styles.css` はmanaged classがある間の `touch-action`、明示的なスクロール挙動、タッチ環境のnative snap抑制を担当します。利用側からこれらを上書きしないでください。
- 1つのwindowにmountできるcontrollerは1つです。`destroy()` はlistener、observer、timer、補正処理、購読とライブラリが追加したclassを除去します。既存のclassは保持します。
- `shouldYieldWheel` / `shouldYieldTouch` はカルーセル、フォーム、3D操作など利用側に委譲する領域を決めます。委譲する操作は利用側が処理してください。
- URL/history、ルーティング、製品情報、LiquidGL、3D、分析イベントは利用側の責務です。`onNavigate` と `onActiveChange` は組み込み用コールバックとして利用できます。
- `rootElement` / `eventTarget` はclass・listenerの接続先です。要素スクローラーを指定するAPIではありません。必須CSSのclassはdocumentElementへ付く構成で使ってください。
- `createViewportCssSync` は任意の補助機能です。CSS変数へのviewport寸法同期を行い、`destroy()` は同期listenerを解除します。書き込んだ変数の値は残します。

詳細なAPIは同梱の `index.d.ts` が定義します。
