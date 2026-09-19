# 共通セクションスクロール

ホーム、プロダクト一覧、Surround1x0-AKDK は `site/shared/segmented-scroll/` で停止点と入力を管理する。ページ側は停止点の順番、補助停止点、横操作などを委譲する領域を定義する。

## 外部配布の予定と分離方針

このページめくり・カレントセクション管理・入力ロックの一連の体験は、**将来、独立したライブラリとして外部配布する予定**である。現在はサイト内の実利用で検証する開発段階で、npm等ではまだ公開していない。パッケージの暫定名は `@masahi-desu/segmented-scroll`、現在は `private: true` とする。正式名称、公開ライセンス、配布先、バージョン互換性方針は公開前に決める。

初版の対応範囲はwindow/document全体の縦スクロール。入れ子の要素スクローラー・横方向のページ送りは含めない。windowの計測と移動は内部adapterへ分け、将来拡張できる境界を保つ。

| 層 | 責務 | サイトとの依存 |
| --- | --- | --- |
| `stop-index.js` | DOMを使わない停止点の順序・選択・content anchor | なし |
| `scroll-controller.js` | 入力、移動、現在セクション、各ロック、到着・中断の通知 | Stop定義と任意のコールバックで接続 |
| `window-scroll-adapter.js` | windowの座標・viewport・停止点計測・scrollTo | ブラウザのみ |
| `segment-view.js` | 状態を購読しclass・ARIA・インジケーターを描画 | 任意のDOMを注入。状態は書き換えない |
| `styles.css` | 縦pan制御・native snap競合防止・補正時の即時移動 | 必須の同梱CSS。サイトthemeへの隠れた依存を持たない |
| ページ側 | 停止点データ、補助停止点、URL/history、横操作、LiquidGL・3Dとの連携 | ライブラリからは参照しない |

ESMの `index.js` を正本とし、同梱の `index.d.ts` でAPIを定義する。既存ページは同じESMから生成した `browser.js` を使う。生成物は既存のclassic script・file URLテストに必要な実行時アセットなので追跡する。独立した別実装にはしない。

`createScrollController` だけが状態を所有する。表示側の `createSegmentView` は `connect(controller)` で購読する。controllerの可変indexを公開せず、外部は `getStop()` / `getStops()` と状態のコピーを読む。`createStopIndex` 自体はDOMなしの利用向けに独立してexportする。

## 状態と通知の意味

- `activeId` は選択した移動先で、到着前に変わる。従来のナビ表示・Surround演出の開始タイミングを保つ。
- `targetId` は進行中の移動先、`settledId` は最後に実測位置の一致を確認した停止点。`moving` と `aligning` で進行中か補正中かを区別する。`pendingId` は `targetId` の互換用別名。
- `navigationLocked`、`wheelLocked`、`touchLocked` を個別に公開し、`locked` はその論理和とする。wheelの慣性が残っていれば時間ロック終了後も `locked` はtrue。
- `subscribe()` は `activechange`、`navigationstart`、`navigationend`、`navigationcancel`、`lockchange`、`destroy` を読み取り専用スナップショットとともに通知する。
- 購読中に別の移動を開始した場合も、通知は発生順に配送する。先に新しい状態を描画した購読先へ古い状態が後から届く逆転を防ぐ。
- 完了は補正期間の終了かつ停止点との位置差が1px以内の場合だけ通知する。別移動への上書き、停止点削除、destroy、計測不能、整列失敗は成功扱いにしない。
- `settledId` 単独では現在位置を保証しない。Surroundのドラッグ開始判定は状態と現在の実測位置の両方を確認する。

利用例とAPI契約は [同梱README](../../site/shared/segmented-scroll/README.md)、サイト資源を読み込まない最小例は [テスト用HTML](../../tests/fixtures/segmented-scroll/basic.html) を参照する。

## 開発・配布前の検証

- ESMを変更したら `npm run build:segmented-scroll` でbrowser bundleを更新する。`npm run test:segmented-bundle` は正本との一致を検査する。
- `npm run test:segmented-package` と `npm run test:segmented-package:webkit` は `npm pack` のアーカイブを `.temp/` に展開し、その中身だけからESM・必須CSS・最小ページを実行する。サイトのthemeや演出コードを読まず、状態通知・ARIA・破棄処理をChromium/WebKitで検証する。TypeScriptの利用例も同じアーカイブを参照してコンパイルする。公開処理は行わない。
- 上記を既存の `test:pc-browser` / `test:webkit` と `npm test` に含める。配布前には正式なAPI互換性方針と、対象端末・支援技術での実機検証を追加で確定する。

## wheel 入力の契約

- 縦の wheel 入力は最初のイベントから `preventDefault()` する。1px 未満の小数入力と、先頭・末尾で外側へ向かう入力も対象とする。
- 同じ方向の移動量を小数のまま累積し、86px 以上で隣の停止点へ1回だけ移動する。それ未満ではページ位置を変えない。line 単位は16px、page 単位は viewport 高で正規化する。
- 移動前に方向が変わった場合は累積をリセットする。180ms の無入力で累積とジェスチャーの消費状態をリセットする。
- 描画負荷で無入力タイマーが遅延しても、次の入力時に実際の入力間隔を確認する。静止後の操作を古いロックで消費せず、前の操作の累積値も持ち越さない。
- 移動アニメーションの時間ロックと、wheel のジェスチャーロックを別々に管理する。移動後の入力は、小数の慣性入力や反転を含め、最後の入力から180ms空くまで消費する。アニメーションの時間が過ぎただけでは次の停止点へ移動しない。
- ナビボタンなどの移動ロック中に始まった wheel も、そのジェスチャー全体を消費する。`prefers-reduced-motion` でもジェスチャーの区切りは同じとする。
- 縦成分のない横操作、ページから明示的に委譲される横操作、Ctrl+wheel、拡大表示中のパンは奪わない。すでに `cancelable: false` になったネイティブジェスチャーへ JS の移動を重ねない。タッチ環境では既存の静止時補正が位置を整える。
- DOM の wheel イベントは指離れや慣性フェーズを標準公開しないため、180ms の静止を操作の区切りとみなす。この時間以上間隔が空いた入力は別の操作として扱う。

## iPad トラックパッドで表面化する条件

旧実装は `Math.abs(deltaY) < 1` のとき `preventDefault()` より先に戻っていた。iPad WebKit は最初の非ゼロイベントのキャンセル結果を保持し、キャンセルしなかったジェスチャーの後続入力を non-cancelable にする。このため小数入力で操作が始まると、後から86pxのしきい値に達してもネイティブスクロールを止められず、JSの移動・位置補正と競合する。

また旧実装は移動後も続く入力の終わりを管理せず、時間ロックの終了後に同じ入力列を再び累積していた。この問題はOS名ではなく入力列に依存する。Macで再現しなかったことからMac全般で安全とは断定しない。最初から大きな値を送るホイールでは初回キャンセルが働き、画面タッチは別の touch listener と `touch-action` を通るため、同じ不具合条件にならない。

根拠は WebKit の [iOS wheel の導入・キャンセル規則](https://bugs.webkit.org/show_bug.cgi?id=210071)、[WKWebViewIOS.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/ios/WKWebViewIOS.mm) の `handleScrollUpdate`、[WebIOSEventFactory.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/Shared/ios/WebIOSEventFactory.mm) の浮動小数 delta 変換。ユーザーの動画は製品一覧の停止位置の不安定さを示すが、実機のイベントログは含まれない。初回が小数値だったという個別端末での因果は、実機ログなしでは確定しない。

## 回帰検証

### 停止位置の微小なずれと方向移動

停止点の選択はcontentでは4pxまたはviewport高の2%（大きい方）のずれを許容する一方、旧方向移動は1pxの座標比較だけで次の停止点を探していた。たとえば停止点が1000px、現在位置が997pxだと、下入力は1000pxの同じセクションを再選択し、上入力は前へ進む。タッチとwheelの両方でこの不一致を再現できる。

方向移動は、現在セクションの認識範囲内かつ位置差が4pxまたはviewport高の2%（大きい方）以内なら、隣の停止点へ進む。補助停止点やカスタム表示判定は数百pxの許容差を持つ場合があるため、その全範囲を移動済みとは扱わない。そうしないと、フッターの手前で下入力が無効になったり、まだ到達していない停止点を飛び越したりする。範囲外では従来通り位置から探す。古い `activeId` に固定せず、補助停止点の `eventRegion` とタッチ開始位置の優先順位を保つ。

iPadOS 26.6.2のSafari・Braveで、トラックパッドの片方向停止とカーソル移動による復帰、画面タッチでも停止するとの報告がある。動画は製品一覧のRetreatScreen付近を示す。上記の3pxずれは自動テストで再現した共通処理の不具合であり、実機でそのずれが発生していた証拠はない。入力未着・キャンセル不可などのSafari固有要因と同一原因かは実機のイベント・位置ログで確認する。

- `npm run test:segmented-scroll-core`: mock clock で小数入力、しきい値、長い入力・慣性・反転、端、移動中の入力、静止後の再操作、単位変換、ズーム、destroy/remount、停止点の前後3pxからのwheel/touch移動と範囲外の飛び越し防止、広い補助停止点・カスタム表示判定による停止や飛び越しの防止を検証する。
- `npm run test:segmented-wheel`: Chromium の実ページでしきい値とロック、active nav と位置の一致、横ナビを検証する。合成入力は制御可能な時計で間隔を固定し、実 wheel 入力は実時間で検証する。Surroundの3D描画は専用テストに分け、ソフトウェア描画負荷で入力列が変わることを防ぐ。`test:pc-browser` に含める。
- `npm run test:segmented-wheel:webkit`: 同じ検証を WebKit の desktop と iPad 設定で行う。`test:webkit` に含める。
- 共通入力処理の改修では `npm run test:release-scroll` でcore・bundle・配布パッケージと全利用先の入力回帰をまとめて確認できる。レイアウト、描画同期、Mobile Safariの確認は変更の影響範囲に応じて追加する。これらのテストは明示的なフル検証の `npm run test:full` にも維持する。リモートの `npm run test:ci` はcore・生成bundleと、配布パッケージの独立ページをChromium／WebKitで確認する最小構成とし、環境差の検出を残す。
- 合成イベントとiPad設定によるテストはUIKitや物理トラックパッドのイベント生成を再現しない。実機確認では製品一覧でゆっくり操作を始め、しきい値未満は位置を維持し、超えたら1区間移動し、長く指を動かしても飛び越さず、静止後の再操作・逆方向操作ができることを確認する。先頭・末尾、横ナビ、タッチも確認する。
