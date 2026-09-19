/**
 * テスト概要:
 *  - 目的: 共通 segmented scroll の停止位置・segment 表示同期と、微小 wheel 入力のキャンセル・ジェスチャー単位の移動を確認する。
 *  - 期待値: index/class/ARIA/indicator の同期に加え、86px 未満では移動せず、1ジェスチャーで1停止点だけ移動し、180ms の無入力後に再入力できる。
 *  - 検証方法: Node の test/assert、fake DOM、mock clock で実際の wheel listener に入力し、位置・キャンセル・移動回数を検証する。
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_TIMINGS,
  createScrollController,
  createSegmentView,
  createStopIndex
} = require('../site/shared/segmented-scroll/index.js');

function createFakeClassList() {
  const tokens = new Set();
  return {
    add(token) {
      tokens.add(token);
    },
    contains(token) {
      return tokens.has(token);
    },
    remove(token) {
      tokens.delete(token);
    },
    toggle(token, force) {
      const enabled = force === undefined ? !tokens.has(token) : Boolean(force);
      if (enabled) {
        tokens.add(token);
      } else {
        tokens.delete(token);
      }
      return enabled;
    }
  };
}

function createFakeStyle() {
  const properties = new Map();
  return {
    getPropertyValue(name) {
      return properties.get(name) || '';
    },
    setProperty(name, value) {
      properties.set(name, value);
    }
  };
}

function createFakeControl(id, rect) {
  const attributes = new Map();
  return {
    id,
    classList: createFakeClassList(),
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    getBoundingClientRect() {
      return { ...rect };
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    }
  };
}

test('stop ID の重複を拒否する', () => {
  const index = createStopIndex();

  assert.throws(
    () => index.setStops([{ id: 'intro' }, { id: 'intro', role: 'auxiliary' }]),
    /Duplicate segmented scroll stop id: intro/
  );
});

function createWheelHarness(t, options = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const listeners = new Map();
  const navigations = [];
  const document = {
    body: { scrollHeight: 4000 },
    documentElement: { clientHeight: 1000, scrollHeight: 4000, scrollTop: 0 }
  };
  const window = {
    document,
    innerHeight: 1000,
    scrollY: 0,
    visualViewport: { height: 1000, scale: 1 },
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    matchMedia: () => ({ matches: false }),
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (id) => clearTimeout(id),
    requestAnimationFrame: (fn) => setTimeout(fn, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    scrollTo({ top }) { this.scrollY = top; }
  };
  const controller = createScrollController({
    window,
    document,
    getStops: () => ['first', 'second', 'third', 'footer'].map((id, i) => ({ id, getTop: () => i * 1000 })),
    onNavigate: ({ stop }) => navigations.push(stop.id),
    ...options
  });
  controller.mount();
  t.after(() => controller.destroy());
  function wheel(deltaY, init = {}) {
    const event = {
      type: 'wheel', deltaY, deltaX: 0, deltaMode: 0,
      cancelable: true, defaultPrevented: false,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; },
      ...init
    };
    listeners.get('wheel')(event);
    return event;
  }
  return { controller, window, wheel, navigations, listeners, tick: (ms) => t.mock.timers.tick(ms) };
}

test('最初の 0.25px wheel をキャンセルし、WebKit の後続イベントを制御可能に保つ', (t) => {
  const h = createWheelHarness(t);
  let cancelable = true;
  for (const delta of [0.25, 20, 30, 35.75]) {
    const event = h.wheel(delta, { cancelable });
    // iPad WebKit は最初の非ゼロイベントをキャンセルしないと後続を non-cancelable にする。
    cancelable = cancelable && event.defaultPrevented;
    assert.equal(event.defaultPrevented, true, `delta ${delta} must not start native scrolling`);
  }
  assert.deepEqual(h.navigations, ['second']);
  assert.equal(h.window.scrollY, 1000);
});

test('1px 未満も累積し、86px に達するまで位置を変えない', (t) => {
  const h = createWheelHarness(t);
  for (let i = 0; i < 171; i += 1) {
    assert.equal(h.wheel(0.5).defaultPrevented, true);
    h.tick(8);
    assert.equal(h.window.scrollY, 0);
  }
  h.wheel(0.5);
  assert.deepEqual(h.navigations, ['second']);
});

for (const reducedMotion of [false, true]) {
  test(`連続入力・慣性・微小な逆方向入力は時間ロック後も1移動に留める (reduced=${reducedMotion})`, (t) => {
    const h = createWheelHarness(t, { reduceMotion: { matches: reducedMotion } });
    h.wheel(100);
    for (let i = 0; i < 25; i += 1) {
      h.tick(100);
      assert.equal(h.wheel(i < 15 ? 30 : (i % 2 ? 0.25 : -0.25)).defaultPrevented, true);
      assert.deepEqual(h.navigations, ['second']);
    }
    h.tick(DEFAULT_TIMINGS.wheelResetMs + 1);
    h.wheel(86);
    assert.deepEqual(h.navigations, ['second', 'third']);
  });
}

test('ナビ移動ロック中に開始した wheel をロック終了後も同じジェスチャーとして消費する', (t) => {
  const h = createWheelHarness(t);
  h.controller.goTo('second');
  for (let i = 0; i < 20; i += 1) {
    h.tick(100);
    h.wheel(30);
  }
  assert.deepEqual(h.navigations, ['second']);
});

test('逆方向・無入力でしきい値の累積をリセットし、line/page 単位も正規化する', (t) => {
  const h = createWheelHarness(t);
  h.controller.setActive('second');
  h.window.scrollY = 1000;
  h.wheel(60);
  h.wheel(-60);
  assert.deepEqual(h.navigations, []);
  h.tick(DEFAULT_TIMINGS.wheelResetMs + 1);
  h.wheel(-30);
  assert.deepEqual(h.navigations, []);
  h.wheel(-3.5, { deltaMode: 1 });
  assert.deepEqual(h.navigations, ['first']);
  h.tick(1500);
  h.wheel(0.086, { deltaMode: 2 });
  assert.deepEqual(h.navigations, ['first', 'second']);
});

test('先頭・末尾でもネイティブへ漏らさず、移動済みの操作を反転しても2回移動しない', (t) => {
  const h = createWheelHarness(t);
  assert.equal(h.wheel(-0.25).defaultPrevented, true);
  assert.deepEqual(h.navigations, []);
  h.controller.setActive('third');
  h.window.scrollY = 2000;
  h.wheel(86);
  for (let i = 0; i < 12; i += 1) {
    h.tick(100);
    assert.equal(h.wheel(40).defaultPrevented, true);
  }
  h.wheel(-100);
  assert.deepEqual(h.navigations, ['footer']);
  h.tick(DEFAULT_TIMINGS.wheelResetMs + 1);
  h.wheel(-86);
  assert.deepEqual(h.navigations, ['footer', 'third']);
});

test('明示的な横操作・ズームと制御不能なネイティブジェスチャーに移動を重ねない', (t) => {
  const h = createWheelHarness(t, { shouldYieldWheel: (event, gesture) => gesture.horizontalDominant });
  assert.equal(h.wheel(10, { deltaX: 100 }).defaultPrevented, false);
  assert.equal(h.wheel(100, { ctrlKey: true }).defaultPrevented, false);
  h.window.visualViewport.scale = 2;
  assert.equal(h.wheel(100).defaultPrevented, false);
  h.window.visualViewport.scale = 1;
  assert.equal(h.wheel(100, { cancelable: false }).defaultPrevented, false);
  assert.deepEqual(h.navigations, []);
});

test('destroy/remount は wheel の入力状態も破棄する', (t) => {
  const h = createWheelHarness(t);
  h.wheel(86);
  h.controller.destroy();
  h.controller.mount();
  h.wheel(86);
  assert.deepEqual(h.navigations, ['second', 'third']);
});

test('縦成分のない横 wheel はページ固有の委譲領域の外でも奪わない', (t) => {
  const h = createWheelHarness(t);
  assert.equal(h.wheel(0, { deltaX: 100 }).defaultPrevented, false);
  assert.deepEqual(h.navigations, []);
});

test('active index と content index を役割ごとに管理する', () => {
  const index = createStopIndex({ initialId: 'details' });
  index.setStops([
    { id: 'intro' },
    { id: 'details', role: 'content' },
    { id: 'footer', role: 'auxiliary', contentAnchor: 'previous' }
  ]);

  assert.deepEqual(index.getState(), {
    activeId: 'details',
    activeIndex: 1,
    activeContentId: 'details',
    activeContentIndex: 1,
    size: 3
  });

  assert.equal(index.activate('footer').id, 'footer');
  assert.deepEqual(index.getState(), {
    activeId: 'footer',
    activeIndex: 2,
    activeContentId: 'details',
    activeContentIndex: 1,
    size: 3
  });

  assert.equal(index.activate('intro').id, 'intro');
  assert.equal(index.getState().activeContentId, 'intro');
  assert.equal(index.getState().activeContentIndex, 0);
});

test('auxiliary stop の previous anchor は直前の content stop を参照する', () => {
  const index = createStopIndex();
  index.setStops([
    { id: 'first' },
    { id: 'first-note', role: 'auxiliary', contentAnchor: 'previous' },
    { id: 'second' },
    { id: 'second-note', role: 'auxiliary', contentAnchor: 'previous' }
  ]);

  index.activate('first-note');
  assert.equal(index.getState().activeContentId, 'first');

  index.activate('second-note');
  assert.equal(index.getState().activeContentId, 'second');
});

test('実測 top の順序で方向移動と最近傍 stop を解決する', () => {
  const index = createStopIndex();
  const tops = new Map([
    ['third', 300],
    ['first', 100],
    ['second', 200],
    ['footer', 420]
  ]);
  const readTop = (stop) => tops.get(stop.id);
  index.setStops([
    { id: 'third' },
    { id: 'first' },
    { id: 'footer', role: 'auxiliary', contentAnchor: 'previous' },
    { id: 'second' }
  ]);

  assert.deepEqual(
    index.getOrderedStops(readTop).map((stop) => stop.id),
    ['first', 'second', 'third', 'footer']
  );
  assert.equal(index.findDirectional(1, 100, 'first', readTop).id, 'second');
  assert.equal(index.findDirectional(-1, 300, 'third', readTop).id, 'second');
  assert.equal(index.findDirectional(1, 205, '', readTop).id, 'third');
  assert.equal(index.findDirectional(-1, 205, '', readTop).id, 'second');
  assert.deepEqual(index.findNearest(264, readTop), {
    stop: { id: 'third', top: 300 },
    distance: 36
  });
});

test('動的 refresh は残っている active ID と content ID を保持する', () => {
  const index = createStopIndex({ initialId: 'first' });
  let liveStops = [
    { id: 'first' },
    { id: 'second' },
    { id: 'footer', role: 'auxiliary', contentAnchor: 'previous' }
  ];
  const scroll = createScrollController({
    window: {},
    document: { documentElement: {} },
    reduceMotion: { matches: true },
    getStops: () => liveStops
  });

  scroll.refresh();
  scroll.setActive('second');
  assert.equal(scroll.getState().activeId, 'second');

  liveStops = [
    { id: 'new-first' },
    { id: 'footer', role: 'auxiliary', contentAnchor: 'previous' },
    { id: 'second' }
  ];
  scroll.refresh();

  assert.equal(scroll.getState().activeId, 'second');
  assert.equal(scroll.getState().activeContentId, 'second');
  assert.equal(scroll.getState().activeIndex, 2);
  assert.equal(scroll.getState().activeContentIndex, 2);
});

test('segment view は状態を所有せず class・ARIA・indicator を描画する', () => {
  const index = createStopIndex({ initialId: 'first' });
  index.setStops([{ id: 'first' }, { id: 'second' }]);

  const first = createFakeControl('first', { left: 24, width: 44 });
  const second = createFakeControl('second', { left: 92, width: 58 });
  const track = {
    clientLeft: 1,
    style: createFakeStyle(),
    getBoundingClientRect() {
      return { left: 12, width: 180 };
    }
  };
  const segments = createSegmentView({
    controls: [first, second],
    track
  });

  assert.equal(segments.render('second').id, 'second');
  assert.equal(first.classList.contains('is-active'), false);
  assert.equal(first.getAttribute('aria-current'), 'false');
  assert.equal(second.classList.contains('is-active'), true);
  assert.equal(second.getAttribute('aria-current'), 'true');
  assert.equal(track.style.getPropertyValue('--segment-x'), '79px');
  assert.equal(track.style.getPropertyValue('--segment-width'), '58px');
  assert.equal(index.getState().activeId, 'first');
});

test('destroy は listener と保留中の navigation state を破棄して再 mount 可能にする', () => {
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  const rootClassList = createFakeClassList();
  const document = {
    body: { scrollHeight: 300 },
    documentElement: {
      classList: rootClassList,
      clientHeight: 100,
      scrollHeight: 300,
      scrollTop: 0
    }
  };
  const window = {
    document,
    innerHeight: 100,
    scrollY: 0,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || new Set();
      handlers.add(handler);
      listeners.set(type, handlers);
    },
    cancelAnimationFrame() {},
    clearTimeout(id) {
      timers.delete(id);
    },
    matchMedia() {
      return { matches: false };
    },
    removeEventListener(type, handler) {
      const handlers = listeners.get(type);
      if (handlers) {
        handlers.delete(handler);
      }
    },
    requestAnimationFrame() {
      return 1;
    },
    scrollTo({ top }) {
      this.scrollY = top;
    },
    setTimeout(handler) {
      timerId += 1;
      timers.set(timerId, handler);
      return timerId;
    }
  };
  const controller = createScrollController({
    window,
    document,
    managedClass: 'is-managed',
    reduceMotion: { matches: false },
    getStops: () => [
      { id: 'first', getTop: () => 0 },
      { id: 'second', getTop: () => 100 }
    ]
  });

  controller.mount();
  assert.equal(rootClassList.contains('is-managed'), true);
  assert.equal(controller.goTo('second'), true);
  assert.equal(controller.getState().pendingId, 'second');
  assert.equal(controller.getState().locked, true);

  controller.destroy();
  assert.equal(rootClassList.contains('is-managed'), false);
  assert.equal(controller.getState().pendingId, '');
  assert.equal(controller.getState().locked, false);
  assert.equal(controller.getState().mounted, false);
  assert.equal(timers.size, 0);
  assert.equal(Array.from(listeners.values()).every((handlers) => handlers.size === 0), true);

  controller.mount();
  assert.equal(controller.getState().pendingId, '');
  assert.equal(controller.getState().mounted, true);
  controller.destroy();
});

function finishMotion(h) {
  h.tick(700);
  for (let i = 0; i < 40; i += 1) h.tick(16);
}

test('移動先・到着済み ID と開始/完了通知を区別する', (t) => {
  const h = createWheelHarness(t);
  const events = [];
  h.controller.subscribe((event) => events.push(event));
  assert.equal(h.controller.getState().settledId, 'first');
  h.controller.goTo('second');
  const started = events.find((event) => event.type === 'navigationstart');
  assert.equal(started.state.activeId, 'second');
  assert.equal(started.state.targetId, 'second');
  assert.equal(started.state.settledId, 'first');
  assert.equal(started.state.moving, true);
  h.tick(640);
  assert.equal(events.some((event) => event.type === 'navigationend'), false);
  for (let i = 0; i < 40; i += 1) h.tick(16);
  const ended = events.find((event) => event.type === 'navigationend');
  assert.equal(ended.state.settledId, 'second');
  assert.equal(ended.state.targetId, '');
  assert.equal(ended.state.moving, false);
  assert.equal(ended.state.aligning, false);
  assert.equal(Object.isFrozen(started.state), true);
});

test('移動時間を過ぎても残る wheel ロックを状態と通知で公開する', (t) => {
  const h = createWheelHarness(t);
  const events = [];
  h.controller.subscribe((event) => events.push(event));
  h.wheel(86);
  for (let i = 0; i < 20; i += 1) { h.tick(100); h.wheel(1); }
  const state = h.controller.getState();
  assert.equal(state.navigationLocked, false);
  assert.equal(state.wheelLocked, true);
  assert.equal(state.locked, true);
  assert.equal(events.find((event) => event.type === 'navigationstart').state.wheelLocked, true);
  h.tick(181);
  assert.equal(events.at(-1).type, 'lockchange');
  assert.equal(events.at(-1).state.locked, false);
});

test('上書きされた移動は cancel し、古いタイマーから完了を通知しない', (t) => {
  const h = createWheelHarness(t);
  const events = [];
  h.controller.subscribe((event) => events.push(event));
  h.controller.goTo('second');
  h.tick(200);
  h.controller.goTo('third');
  finishMotion(h);
  assert.deepEqual(events.filter((event) => event.type === 'navigationcancel').map((event) => [event.id, event.reason]), [['second', 'superseded']]);
  assert.deepEqual(events.filter((event) => event.type === 'navigationend').map((event) => event.id), ['third']);
});

test('削除・destroy・整列失敗で成功通知を出さない', (t) => {
  let stops = [{ id: 'first', getTop: () => 0 }, { id: 'second', getTop: () => 1000 }];
  const h = createWheelHarness(t, { getStops: () => stops });
  const events = [];
  h.controller.subscribe((event) => events.push(event));
  h.controller.goTo('second');
  stops = [stops[0]];
  h.controller.refresh();
  assert.equal(events.find((event) => event.type === 'navigationcancel').reason, 'stop-removed');
  stops.push({ id: 'third', getTop: () => 2000 });
  h.controller.refresh();
  h.window.scrollTo = () => {};
  h.controller.goTo('third');
  finishMotion(h);
  assert.equal(events.filter((event) => event.type === 'navigationcancel').at(-1).reason, 'alignment-failed');
  h.controller.goTo('first');
  h.controller.destroy();
  finishMotion(h);
  assert.equal(events.filter((event) => event.type === 'navigationcancel').at(-1).reason, 'destroyed');
  assert.equal(events.some((event) => event.type === 'navigationend'), false);
});

test('購読内で別の移動を開始しても古い移動が後からスクロールを上書きしない', (t) => {
  const h = createWheelHarness(t);
  const events = [];
  h.controller.subscribe((event) => {
    events.push(event);
    if (event.type === 'navigationstart' && event.id === 'second') h.controller.goTo('third');
  });
  h.controller.goTo('second');
  finishMotion(h);
  assert.equal(h.window.scrollY, 2000);
  assert.deepEqual(events.filter((event) => event.type === 'navigationend').map((event) => event.id), ['third']);
});

test('表示は controller の購読だけで更新し、切断後は追従しない', (t) => {
  const h = createWheelHarness(t);
  const first = createFakeControl('first', { left: 0, width: 40 });
  const second = createFakeControl('second', { left: 40, width: 40 });
  const view = createSegmentView({ controls: [first, second] });
  const disconnect = view.connect(h.controller);
  assert.equal(first.getAttribute('aria-current'), 'true');
  h.controller.goTo('second');
  assert.equal(second.getAttribute('aria-current'), 'true');
  disconnect();
  h.controller.setActive('first');
  assert.equal(second.getAttribute('aria-current'), 'true');
  assert.equal(h.controller.getState().activeId, 'first');
});

test('外部から内部 index を変更できず、同じ window の二重 mount を拒否する', (t) => {
  const h = createWheelHarness(t);
  assert.equal(h.controller.index, undefined);
  assert.equal(Object.isFrozen(h.controller.getStop('first')), true);
  h.controller.getStops().pop();
  assert.equal(h.controller.getState().size, 4);
  const other = createScrollController({ window: h.window, getStops: () => [] });
  assert.throws(() => other.mount(), /Only one/);
  h.controller.destroy();
  other.mount();
  other.destroy();
});

test('計測できない停止点を0pxとして扱わず、無効な goTo は状態を変えない', (t) => {
  const h = createWheelHarness(t, { getStops: () => [{ id: 'first', getTop: () => 0 }, { id: 'missing', getTop: () => null }] });
  assert.equal(h.controller.goTo('missing'), false);
  assert.equal(h.controller.getState().activeId, 'first');
  assert.equal(h.controller.getState().locked, false);
  const index = createStopIndex();
  index.setStops([{ id: 'missing' }, { id: 'valid' }]);
  assert.deepEqual(index.getOrderedStops((stop) => stop.id === 'valid' ? 100 : null).map((stop) => stop.id), ['valid']);
});

test('activechange の購読で再移動しても、後続の表示購読に古い状態を最後に届けない', (t) => {
  const h = createWheelHarness(t);
  const first = createFakeControl('first', { left: 0, width: 40 });
  const second = createFakeControl('second', { left: 40, width: 40 });
  const third = createFakeControl('third', { left: 80, width: 40 });
  const delivered = [];
  h.controller.subscribe((event) => {
    if (event.type === 'activechange' && event.stop?.id === 'second') h.controller.goTo('third');
  });
  const view = createSegmentView({ controls: [first, second, third] });
  view.connect(h.controller);
  h.controller.subscribe((event) => {
    if (event.type === 'activechange') delivered.push(event.state.activeId);
  });
  h.controller.goTo('second');
  finishMotion(h);
  assert.equal(h.controller.getState().settledId, 'third');
  assert.equal(third.getAttribute('aria-current'), 'true');
  assert.equal(second.getAttribute('aria-current'), 'false');
  assert.deepEqual(delivered, ['second', 'third']);
});


test('通知中の destroy でも表示層へ破棄通知を配送し、resize購読を解除する', (t) => {
  const h = createWheelHarness(t);
  const events = [];
  h.controller.subscribe((event) => {
    if (event.type === 'navigationstart') h.controller.destroy();
  });
  const view = createSegmentView({ window: h.window, controls: [] });
  view.connect(h.controller);
  h.controller.subscribe((event) => events.push(event.type));
  assert.equal(h.listeners.has('resize'), true);
  h.controller.goTo('second');
  assert.equal(h.listeners.has('resize'), false);
  assert.equal(events.at(-1), 'destroy');
  assert.equal(h.controller.getState().mounted, false);
});
