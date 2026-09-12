/**
 * テスト概要:
 *  - 目的: Surround1x0-AKDK の4つのコンテンツとフッタ設定の5停止位置、Three.js描画、テーマ連動モデル、レスポンシブ配置を検証する。
 *  - 期待値: 各セグメントが1 viewportに収まり、02/03で注目する片側ユニットが切り替わり、
 *    通常移動は三次ベジェの弧にバンクと一過性の対角twistを重ね、退場側または移動量の大きい側が
 *    先行するlead-followとsmootherstep減速になり、スケールのオーバーシュートは発生しない。
 *    透明で駐機中のユニットは画面端付近のステージング姿勢からフェードインしながら再入場し、
 *    退場側が消える前に画面内へ入るため移動中に両ユニットが同時に画面から消えない。
 *    ダーク時は黒＋ワインレッドのBlack GLB、ライト時は白＋アイボリーのWhite GLBが選択される。
 *    04ではGLBの18個の分解レイヤーを順序メタデータどおり位相差付きの波で展開し、
 *    キーキャップ・スイッチ・ソケットは各個体にも位置順の位相差を付ける。
 *    通常のセグメント移動は分解レイヤーへ波を適用せず、組み立てた左右ユニットのまま行う。
 *    04へ入る非表示ユニットは目的地スケールで再入場し、移動開始と同時に分解を開始する。
 *    キーキャップとソケットは早期に離脱し、PCB／コンスルー類は移動中も上部ケースより下へ保つ。
 *    04から離れるときは即時復元せず、ユニット移動と並行して逆順の波で組み立てる。
 *    分解状態で半体を捻る間は、部品ごとに小さな回転追従差を付け、終端では追加回転を0へ戻す。
 *    縦長モバイル04では左右間にマージンを残して平行配置し、手前へ寄せて拡大しながら上下左右の余白を抑える。
 *    横長04は部品の軸を揃えて左下／右上へ分解し、キー配列を横倒しにせず画面幅を使って最大まで拡大する。
 *    横長04の左右端と左右間には固定余白を設けず、上下を個別に中央揃えして重ならない最大共通スケールを使う。
 *    全セグメントの文字レイヤーは3D canvasより手前に置く。
 *    第1と縦長・正方形の第4セグメントは全メッシュの投影範囲で四辺と左右間にPC24px／モバイル16px以上を確保し、
 *    最小間隔まで中央へ寄せる。縦長PC、幅の境界、モバイル、リサイズでも両側を同率で縮小する。
 *    横長の01は固定の拡大率上限を使わず、ナビ・案内から余白を残した領域いっぱいへ拡大し、上下を中央揃えする。
 *    02/03は説明文・ナビ・画面端から同じ余白を保ち、実形状の投影外形が収まる最大サイズを使用する。
 *    縦長モバイルでは説明の上、横長では横へ配置し、言語や画面サイズの変更にも追従する。
 *    02/03のコピーは左右の画面端へ最低PC24px／モバイル16pxの余白で追従し、
 *    大画面でも中央に留まらず、見出しを意図しない位置で折り返さない。
 *    GLB読込失敗、WebGL初期化失敗、context喪失でも写真へ切り替えない。
 *    GLB読込中にセクションを変更した場合も、読込完了時に最新の選択へモデルを配置する。
 *    WebKitの横長表示でもモデル操作の前提となる最終スクロール位置へ収束する。
 *    スクロール・3D配置の完了後だけモデルを操作でき、左ドラッグ回転、ミドルドラッグ移動、
 *    矢印キー、Escapeリセット、1本指回転／2本指移動が機能する。操作ボタンは表示しない。
 *    フォーカス枠はTab／Shift＋Tabで選択したモデルだけに表示し、マウス・ミドル・タッチ操作では消す。
 *    背景スワイプはセクションを移動する。
 *    390px幅でも横スクロールや主要導線の欠けが発生しない。歯車セグメントはフッタを文書末尾に表示し、
 *    04のGitHub導線はSimple Icons CDNのGitHubアイコンを文字の左側に表示する。
 *    フッタでは04の3Dシーンを維持して同一シーンのモーションを再発火させない。
 *  - 検証方法: Viteの本番ビルドをpreviewして製品アクセントを検証した後、開発サーバーを一時ポートで起動する。
 *    Playwright Chromiumからページを開き、公開された3D状態、セグメント位置、テーマselect、DOMRect、
 *    scrollWidthをデスクトップとモバイルの両方で計測する。
 */
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium, webkit } = require('playwright');
const THREE = require('three');
const THREE_DEGREES_3_2 = 3.2 * Math.PI / 180;

const ROOT = path.resolve(__dirname, '../..');
const VITE_PACKAGE = require.resolve('vite/package.json');
const VITE_CLI = path.resolve(path.dirname(VITE_PACKAGE), 'bin/vite.js');

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Vite did not become ready within ${timeoutMs}ms: ${url}`));
        return;
      }
      setTimeout(check, 120);
    };
    check();
  });
}

function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let forceTimer;
    let settleTimer;
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(forceTimer);
      clearTimeout(settleTimer);
      resolve();
    };

    child.once('exit', finish);
    if (child.exitCode !== null || child.signalCode !== null) {
      finish();
      return;
    }

    child.kill('SIGTERM');
    forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      settleTimer = setTimeout(finish, 1000);
    }, 3000);
  });
}

function startVite(mode, port) {
  const args = [VITE_CLI];
  if (mode === 'preview') {
    args.push('preview');
  }
  args.push('--host', '127.0.0.1', '--port', String(port), '--strictPort');
  return spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `: ${JSON.stringify(details)}` : ''}`);
  }
}

async function waitFor3d(page) {
  await page.waitForFunction(() => window.__SURROUND_3D__?.ready === true, null, { timeout: 15000 });
}

async function verifyNavigationDuringModelLoad(browser, pageUrl) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  let releaseModels;
  const modelGate = new Promise((resolve) => { releaseModels = resolve; });
  try {
    const page = await context.newPage();
    await page.route('**/*.glb', async (route) => {
      await modelGate;
      await route.continue();
    });
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__SURROUND_3D__));
    await clickSegment(page, 2);
    await clickSegment(page, 4);
    assert(await page.evaluate(() => !window.__SURROUND_3D__.ready), 'Model load was not delayed');
    releaseModels();
    await waitFor3d(page);
    await page.waitForFunction(() => Boolean(window.__SURROUND_3D__.currentPoses));
    const state = await page.evaluate(() => ({
      selected: document.body.dataset.surroundScene,
      scene: window.__SURROUND_3D__.activeScene,
      explosion: window.__SURROUND_3D__.explosionAmount
    }));
    assert(state.selected === '3' && state.scene === 3 && state.explosion === 1,
      'Model initialization ignored navigation completed during GLB loading', state);
  } finally {
    releaseModels();
    await context.close();
  }
}

async function verifyWebKitScrollAlignment(pageUrl) {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 874, height: 402 }, isMobile: true, hasTouch: true });
    // Scroll alignment is independent of rendering. Keep this CI regression
    // runnable without a native WebKit WebGL context; model input is tested above.
    await page.route('**/surround-3d.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.goto(`${pageUrl}#surround-02`);
    await page.waitForFunction(() => window.MDWSurroundNavigation?.isSettled());
    await page.getByRole('button', { name: '04', exact: true }).click();
    await page.waitForFunction(() => window.MDWSurroundNavigation.isSettled(), null, { timeout: 15000 });
    assert(await page.evaluate(() => Math.abs(document.getElementById('surround-04').getBoundingClientRect().top) <= 1),
      'WebKit did not settle at the final section position');
  } finally {
    await browser.close();
  }
}

async function clickSegment(page, number) {
  const id = `surround-0${number}`;
  await page.locator(`[data-surround-target="${id}"]`).click();
  await page.waitForFunction((expected) => (
    document.body.dataset.surroundScene === String(expected.index) &&
    Math.abs(document.getElementById(expected.id).getBoundingClientRect().top) <= 1
  ), { id, index: number - 1 });
}

async function clickFooter(page) {
  await page.locator('[data-surround-footer-target="surround-footer"]').click();
  await page.waitForFunction(() => (
    document.body.dataset.surroundStop === 'surround-footer' &&
    Math.abs(document.documentElement.scrollHeight - window.innerHeight - window.scrollY) <= 1
  ));
}

async function readLayout(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      },
      canvas: rect('#surround-canvas'),
      nav: rect('.surround-section-nav'),
      title: rect('.surround-segment.is-visible .surround-display'),
      activeCopy: rect('.surround-segment.is-visible .surround-copy'),
      primaryAction: rect('.surround-action--primary'),
      footer: rect('.surround-footer'),
      selects: Array.from(document.querySelectorAll('.surround-footer select')).map((element) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      })
    };
  });
}

async function readAccent(page) {
  return page.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    const indicatorStyle = getComputedStyle(document.querySelector('.surround-section-nav__indicator'));
    return {
      accent: bodyStyle.getPropertyValue('--home-accent').trim(),
      indicator: indicatorStyle.backgroundColor
    };
  });
}

function assertHorizontalFit(layout, label) {
  const tolerance = 1;
  assert(
    layout.document.scrollWidth <= layout.document.clientWidth + tolerance &&
    layout.document.bodyScrollWidth <= layout.document.clientWidth + tolerance,
    `${label} generated horizontal scrolling`,
    layout.document
  );
  assert(layout.nav.left >= -tolerance && layout.nav.right <= layout.viewport.width + tolerance, `${label} nav exceeded viewport`, layout.nav);
  assert(layout.title.left >= -tolerance && layout.title.right <= layout.viewport.width + tolerance, `${label} title exceeded viewport`, layout.title);
}

async function assertPairFit(page, label) {
  await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
  const state = await page.evaluate(() => ({
    layout: window.__SURROUND_3D__.pairLayout,
    poses: window.__SURROUND_3D__.currentPoses,
    scene: window.__SURROUND_3D__.activeScene,
    orientation: window.__SURROUND_3D__.explosionOrientation,
    lateralDrift: window.__SURROUND_3D__.explosionLateralDrift,
    width: window.innerWidth,
    height: window.visualViewport?.height || window.innerHeight
  }));
  const { layout, poses, width, height, scene } = state;
  const margin = width <= 672 ? 16 : 24;
  const edgeToEdge = scene === 3 && width > height;
  assert(layout?.fits && layout.minGapPx === (edgeToEdge ? 0 : margin), `${label} did not fit the pair`, state);
  for (const box of Object.values(layout.bounds)) {
    assert(
      box.left >= layout.fitArea.left - 0.1 && box.right <= layout.fitArea.right + 0.1 &&
      box.top >= layout.fitArea.top - 0.1 && box.bottom <= layout.fitArea.bottom + 0.1,
      `${label} clipped a projected keyboard or exploded part`, box
    );
  }
  if (edgeToEdge) {
    const gap = layout.bounds.right.left - layout.bounds.left.right;
    assert(layout.edgeMarginPx === 0 && layout.fitArea.left === 0 && layout.fitArea.right === width &&
      Math.abs(layout.bounds.left.left) < 0.01 && Math.abs(layout.bounds.right.right - width) < 0.01 && gap >= -0.1,
    `${label} left outer margins or overlapped the keyboards`, layout);
    let remainingScaleSpace = gap;
    for (const box of Object.values(layout.bounds)) {
      assert(Math.abs(box.top + box.bottom - height) < 0.1,
        `${label} did not center each keyboard vertically`, box);
      remainingScaleSpace = Math.min(remainingScaleSpace, box.top - margin, height - margin - box.bottom);
    }
    assert(remainingScaleSpace < 0.2, `${label} left room to enlarge the pair`, layout);
  } else {
    assert(
      layout.bounds.right.left - layout.bounds.left.right >= margin - 0.1 &&
      Math.min(width / 2 - layout.bounds.left.right, layout.bounds.right.left - width / 2) <= margin / 2 + 0.1,
      `${label} did not use the closest pair spacing with the minimum margin`, layout
    );
  }
  assert(
    (edgeToEdge || poses.left.x === -poses.right.x) && poses.left.scale === poses.right.scale &&
    poses.left.scale > 0 && (layout.maximize || poses.left.scale <= layout.preferredScale),
    `${label} lost symmetric placement or common scale`, poses
  );
  assert(layout.maximize === (width > height), `${label} used the wrong landscape sizing policy`, layout);
  if (scene === 3) {
    assert(state.orientation === (width > height ? 'horizontal' : 'vertical'),
      `${label} used the wrong explosion orientation`, state);
    assert(state.lateralDrift < 1e-9, `${label} moved parts sideways off their shared separation axis`, state);
    if (width > height) {
      const up = new THREE.Vector3(0, width <= 672 ? 0.88 : 0.56, width <= 672 ? -0.515 : -0.34).normalize();
      for (const side of ['left', 'right']) {
        const pose = poses[side];
        const rotation = new THREE.Euler(pose.rotationX, pose.rotationY, pose.rotationZ);
        const normal = new THREE.Vector3(0, 1, 0).applyEuler(rotation);
        const back = new THREE.Vector3(0, 0, -1).applyEuler(rotation);
        const direction = side === 'left' ? -1 : 1;
        assert(normal.x * direction > 0.5 && normal.dot(up) * direction > 0.1,
          `${label} ${side} did not explode toward the lower-left / upper-right`, { normal });
        assert(back.dot(up) > 0.5, `${label} ${side} rolled the key layout sideways`, { back });
        if (side === 'right') {
          // The reference key row projects about 20 degrees below horizontal
          // at the camera center; an extra roll about the explosion axis breaks it.
          const row = new THREE.Vector3(1, 0, 0).applyEuler(rotation);
          const rowAngle = THREE.MathUtils.radToDeg(Math.atan2(-row.dot(up), row.x));
          assert(rowAngle > 15 && rowAngle < 25,
            `${label} added an unintended right-keyboard roll`, { rowAngle });
        }
      }
    } else {
      assert(poses.left.rotationY === 0 && poses.right.rotationY === 0 &&
        poses.left.rotationZ === 0 && poses.right.rotationZ === 0,
      `${label} changed the portrait parallel pose`, poses);
    }
  }
  if (layout.maximize && !edgeToEdge) {
    const top = Math.min(layout.bounds.left.top, layout.bounds.right.top);
    const bottom = Math.max(layout.bounds.left.bottom, layout.bounds.right.bottom);
    const slack = Math.min(
      layout.bounds.left.left - layout.fitArea.left,
      layout.fitArea.right - layout.bounds.right.right,
      top - layout.fitArea.top,
      layout.fitArea.bottom - bottom
    );
    assert(slack < 0.2 && Math.abs(top + bottom - layout.fitArea.top - layout.fitArea.bottom) < 1,
      `${label} left unused scale or unequal vertical margins`, layout);
    if (scene === 0 && width === 1676 && height === 619) {
      assert(poses.left.scale > 1.9, 'Wide hero retained the previous small scale', poses);
    }
  }
}

async function assertFeaturedFit(page, label) {
  await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
  const state = await page.evaluate(() => {
    const index = window.__SURROUND_3D__.activeScene;
    const section = document.getElementById(`surround-0${index + 1}`);
    const copy = section.querySelector('.surround-copy');
    const frame = section.querySelector('.surround-segment__frame');
    const title = section.querySelector('h2');
    const lineHeight = Number.parseFloat(getComputedStyle(title).lineHeight);
    return {
      layout: window.__SURROUND_3D__.featuredLayout,
      poses: window.__SURROUND_3D__.currentPoses,
      scene: window.__SURROUND_3D__.activeScene,
      width: window.innerWidth,
      height: window.visualViewport?.height || window.innerHeight,
      headerBottom: document.querySelector('.surround-topbar').getBoundingClientRect().bottom,
      text: {
        box: copy.getBoundingClientRect().toJSON(),
        edge: Number.parseFloat(getComputedStyle(frame).paddingLeft),
        lines: Math.round(title.getBoundingClientRect().height / lineHeight),
        intendedLines: title.textContent.trim().split('\n').length
      }
    };
  });
  const { layout, poses, scene, width, height, headerBottom } = state;
  const margin = width <= 672 ? 16 : 24;
  const side = scene === 1 ? 'right' : 'left';
  assert(layout?.fits && layout.side === side && poses[side].scale === layout.scale && layout.scale > 0,
    `${label} did not fit the featured keyboard`, state);
  const { bounds, fitArea, copy } = layout;
  assert(bounds.left >= margin - 0.1 && bounds.right <= width - margin + 0.1 &&
    bounds.top >= headerBottom + margin - 0.1 && bounds.bottom <= height - margin + 0.1,
  `${label} clipped the featured keyboard or intruded into the header`, state);
  assert(layout.stacked === (width <= 672 && width <= height), `${label} used the wrong orientation layout`, layout);
  assert(layout.stacked ? bounds.bottom <= copy.top - margin + 0.1
    : side === 'right' ? bounds.left >= copy.right + margin - 0.1 : bounds.right <= copy.left - margin + 0.1,
  `${label} overlapped the explanatory text`, layout);
  if (!layout.stacked) {
    const { box, edge } = state.text;
    assert(edge >= margin && Math.abs((side === 'right' ? box.left : width - box.right) - edge) < 1,
      `${label} did not anchor the copy to its viewport edge`, state.text);
  }
  if (width >= 1280) {
    assert(state.text.lines === state.text.intendedLines,
      `${label} wrapped the heading despite the available wide viewport`, state.text);
  }
  const slack = Math.min(bounds.left - fitArea.left, fitArea.right - bounds.right,
    bounds.top - fitArea.top, fitArea.bottom - bounds.bottom);
  assert(slack >= -0.1 && slack < 0.2 &&
    Math.abs(bounds.left + bounds.right - fitArea.left - fitArea.right) < 1 &&
    Math.abs(bounds.top + bounds.bottom - fitArea.top - fitArea.bottom) < 1,
  `${label} left unused scale or did not center in the available area`, layout);
  if (width === 1676 && height === 619) {
    assert(layout.scale > 2.8, `${label} retained the previous distant fixed scale`, layout);
  }
}

async function verifyNoPhotoFallback(browser, pageUrl) {
  for (const failure of ['glb', 'webgl', 'context-lost']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const photoRequests = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/Surround1x0-AKDK.png')) photoRequests.push(request.url());
    });
    if (failure === 'glb') {
      await page.route('**/*.glb', (route) => route.abort());
    } else if (failure === 'webgl') {
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type.startsWith('webgl') ? null : getContext.call(this, type, ...args);
        };
      });
    }
    await page.goto(pageUrl, { waitUntil: 'load' });
    if (failure === 'context-lost') {
      await waitFor3d(page);
      await page.evaluate(() => {
        document.getElementById('surround-canvas').getContext('webgl2')
          .getExtension('WEBGL_lose_context').loseContext();
      });
    }
    await page.waitForFunction(() => window.__SURROUND_3D__?.failed);
    await page.waitForFunction(() => (
      getComputedStyle(document.querySelector('.surround-visual__loading')).visibility === 'hidden'
    ));
    const state = await page.evaluate(() => ({
      images: document.querySelectorAll('.surround-visual img, .surround-visual__fallback').length,
      loading: getComputedStyle(document.querySelector('.surround-visual__loading')).visibility,
      ready: document.querySelector('.surround-visual').classList.contains('is-ready')
    }));
    assert(state.images === 0 && photoRequests.length === 0 && state.loading === 'hidden' && !state.ready,
      `${failure} displayed or requested a photo fallback`, { state, photoRequests });
    await clickSegment(page, 4);
    assert(await page.locator('.surround-action--primary').isVisible(), `${failure} hid the repository link`);
    await context.close();
  }
}

async function verifyModelInteraction(browser, pageUrl) {
  const context = await browser.newContext({ viewport: { width: 1353, height: 1323 } });
  const deterministicFrames = () => {
    // As in the segment tests, input/state checks must not wait on headless GPU frames.
    window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 16);
    window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
    window.__SURROUND_TEST_SKIP_RENDER__ = true;
  };
  await context.addInitScript(deterministicFrames);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const waitInteractive = () => page.waitForFunction(() => window.__SURROUND_3D__?.interaction?.enabled);
  const readPoses = () => page.evaluate(() => structuredClone(window.__SURROUND_3D__.currentPoses));
  const assertModelFocus = async (side, visible) => {
    const focus = await page.locator(`[data-surround-model="${side}"]`).evaluate((area) => ({
      focused: document.activeElement === area,
      style: getComputedStyle(area).outlineStyle,
      width: getComputedStyle(area).outlineWidth
    }));
    assert(visible ? focus.focused && focus.style === 'solid' && focus.width === '2px' : focus.style === 'none',
      `${side} model focus outline did not match ${visible ? 'Tab selection' : 'pointer operation'}`, focus);
  };
  const pointOnModel = async (side) => page.locator(`[data-surround-model="${side}"]`).evaluate((area) => {
    const box = area.getBoundingClientRect();
    for (const fy of [0.15, 0.85, 0.5]) {
      for (const fx of [0.25, 0.5, 0.75]) {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        if (document.elementFromPoint(x, y) === area) return { x, y };
      }
    }
    throw new Error(`No exposed drag area for ${area.dataset.surroundModel}`);
  });
  const dragModel = async (side, options = {}) => {
    const point = await pointOnModel(side);
    await page.mouse.move(point.x, point.y);
    if (options.shift) await page.keyboard.down('Shift');
    await page.mouse.down({ button: options.button || 'left' });
    await assertModelFocus(side, false);
    await page.mouse.move(point.x + 45, point.y + 22, { steps: 8 });
    await page.mouse.up({ button: options.button || 'left' });
    await assertModelFocus(side, false);
    if (options.shift) await page.keyboard.up('Shift');
    await page.waitForFunction(() => window.__SURROUND_3D__.interaction.modified);
    await page.waitForTimeout(50);
  };
  await page.goto(pageUrl);
  await waitInteractive();
  assert(await page.locator('.surround-interaction button').count() === 0, 'Model interaction added visible controls');
  await page.locator('.surround-wordmark').focus();
  await page.keyboard.press('Tab');
  await assertModelFocus('left', true);
  await page.keyboard.press('Tab');
  await assertModelFocus('right', true);
  await assertModelFocus('left', false);
  await page.keyboard.press('Shift+Tab');
  await assertModelFocus('left', true);
  const original = await readPoses();
  await dragModel('left');
  let poses = await readPoses();
  assert(Math.abs(poses.left.rotationY - original.left.rotationY) > 0.1 &&
    JSON.stringify(poses.right) === JSON.stringify(original.right), 'Drag did not independently rotate the left keyboard', poses);
  const rotated = poses.left;
  await dragModel('left', { button: 'middle' });
  poses = await readPoses();
  assert(poses.left.x > rotated.x + 0.005 && poses.left.rotationY === rotated.rotationY,
    'Middle drag did not translate without rotating', poses);
  await page.keyboard.press('Escape');
  await waitInteractive();
  assert(JSON.stringify(await readPoses()) === JSON.stringify(original), 'Reset did not restore the responsive layout');

  const left = page.locator('[data-surround-model="left"]');
  await page.locator('.surround-wordmark').focus();
  await page.keyboard.press('Tab');
  await assertModelFocus('left', true);
  await page.keyboard.press('ArrowRight');
  await assertModelFocus('left', true);
  await page.waitForFunction(() => window.__SURROUND_3D__.currentPoses.left.rotationY > 0.02);
  await page.keyboard.press('Escape');
  await waitInteractive();
  assert(JSON.stringify(await readPoses()) === JSON.stringify(original), 'Escape did not reset keyboard manipulation');

  await dragModel('left');
  await page.locator('[data-surround-target="surround-02"]').click();
  await page.waitForFunction(() => window.__SURROUND_3D__.motionActive && !window.__SURROUND_3D__.interaction.enabled);
  assert(await page.locator('.surround-interaction').isHidden(), 'Controls stayed active during section movement');
  await left.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 200, clientY: 400 });
  assert(await page.evaluate(() => !window.__SURROUND_3D__.interaction.dragging), 'A transition accepted model input');
  await waitInteractive();
  assert(await left.isHidden(), 'The exited model retained an interactive area');
  await dragModel('right');

  await clickSegment(page, 4);
  await waitInteractive();
  const offsets = await page.evaluate(() => [...window.__SURROUND_3D__.explosionItemOffsets]);
  await dragModel('right');
  assert(await page.evaluate((expected) => JSON.stringify(window.__SURROUND_3D__.explosionItemOffsets) === JSON.stringify(expected), offsets),
    'Dragging the exploded model changed its layer spacing');
  const beforeFooter = await readPoses();
  await clickFooter(page);
  await page.waitForFunction(() => !window.__SURROUND_3D__.interaction.enabled);
  await page.locator('.theme-select').selectOption('dark');
  await page.waitForFunction(() => window.__SURROUND_3D__.theme === 'dark');
  assert(JSON.stringify(await readPoses()) === JSON.stringify(beforeFooter), 'Theme change lost the user pose');
  assert(errors.length === 0, 'Model interaction raised browser errors', errors);
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await mobile.addInitScript(deterministicFrames);
  const touchPage = await mobile.newPage();
  await touchPage.goto(pageUrl);
  await touchPage.waitForFunction(() => window.__SURROUND_3D__?.interaction?.enabled);
  const cdp = await mobile.newCDPSession(touchPage);
  const touchDrag = async (x, y, dx, dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const touchArea = touchPage.locator('[data-surround-model="left"]');
  let box = await touchArea.boundingBox();
  await touchDrag(box.x + box.width * 0.5, box.y + box.height * 0.5, 25, -30);
  await touchPage.waitForFunction(() => window.__SURROUND_3D__.interaction.modified);
  assert(await touchArea.evaluate((area) => getComputedStyle(area).outlineStyle === 'none'),
    'Touch rotation displayed a model focus outline');
  assert(await touchPage.evaluate(() => window.__SURROUND_3D__.activeScene === 0 && Math.abs(window.__SURROUND_3D__.currentPoses.left.rotationY) > 0.05),
    'Touch rotation navigated away or failed to rotate');
  await touchPage.keyboard.press('Escape');
  await touchPage.waitForFunction(() => window.__SURROUND_3D__.interaction.enabled);
  const touchStartX = await touchPage.evaluate(() => window.__SURROUND_3D__.currentPoses.left.x);
  const touchRotation = await touchPage.evaluate(() => window.__SURROUND_3D__.currentPoses.left.rotationX);
  box = await touchArea.boundingBox();
  const contacts = [-12, 12].map((offset, id) => ({ x: box.x + box.width * 0.5 + offset, y: box.y + box.height * 0.5, id }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: contacts });
  for (let step = 1; step <= 6; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: contacts.map((point) => ({ ...point, x: point.x + 25 * step / 6, y: point.y + 35 * step / 6 }))
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.waitForFunction((x) => window.__SURROUND_3D__.currentPoses.left.x > x + 0.005, touchStartX);
  assert(await touchPage.evaluate(() => window.__SURROUND_3D__.activeScene === 0 && !window.__SURROUND_3D__.interaction.dragging),
    'Touch move navigated away or left pointer capture active');
  assert(await touchPage.evaluate((rotation) => window.__SURROUND_3D__.currentPoses.left.rotationX === rotation, touchRotation),
    'Two-finger translation also rotated the keyboard');
  await touchDrag(5, 730, 0, -150);
  await touchPage.waitForFunction(() => window.__SURROUND_3D__.activeScene === 1);
  await mobile.close();
}

async function verifyProductionAccent() {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    encoding: 'utf8'
  });
  if (build.status !== 0) {
    throw new Error(`Vite production build failed:\n${build.stdout}${build.stderr}`);
  }

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const pageUrl = `${baseUrl}/products/Surround1x0-AKDK/index.html?from=home`;
  const preview = startVite('preview', port);
  let previewOutput = '';
  preview.stdout.on('data', (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on('data', (chunk) => { previewOutput += chunk.toString(); });

  let browser;
  try {
    await waitForServer(pageUrl);
    browser = await chromium.launch();
    const context = await browser.newContext({ colorScheme: 'dark' });
    await context.addInitScript(() => {
      localStorage.setItem('mdw-theme', 'dark');
    });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: 'load' });

    let accentState = await readAccent(page);
    assert(accentState.accent === '#ff344a', 'Production dark theme accent was overridden by the shared theme', accentState);
    assert(accentState.indicator === 'rgb(255, 52, 74)', 'Production dark nav indicator did not use the product accent', accentState);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await page.waitForFunction(() => (
      getComputedStyle(document.querySelector('.surround-section-nav__indicator')).backgroundColor === 'rgb(104, 109, 117)'
    ));
    accentState = await readAccent(page);
    assert(accentState.accent === '#686d75', 'Production light theme accent was overridden by the shared theme', accentState);
    assert(accentState.indicator === 'rgb(104, 109, 117)', 'Production light nav indicator did not use the product accent', accentState);

    await context.close();
  } catch (error) {
    if (preview.exitCode !== null) {
      error.message += `\nVite preview output:\n${previewOutput}`;
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(preview);
  }
}

async function main() {
  await verifyProductionAccent();

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const pageUrl = `${baseUrl}/products/Surround1x0-AKDK/index.html?from=home`;
  const vite = startVite('dev', port);
  let viteOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });

  let browser;
  try {
    await waitForServer(pageUrl);
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark'
    });
    await context.addInitScript(() => {
      localStorage.setItem('mdw-theme', 'dark');
      localStorage.setItem('mdw-lang', 'ja');
      // Keep Three.js motion deterministic when headless Chromium does not issue compositor frames.
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(performance.now()), 16);
      window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
      window.__SURROUND_TEST_SKIP_RENDER__ = true;
    });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: 'load' });
    await waitFor3d(page);

    let rendererState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(rendererState.theme === 'dark', 'Dark theme did not select the black renderer state', rendererState);
    assert(rendererState.modelUrls.dark.endsWith('Surround1x0-AKDK-Black.glb'), 'Black GLB URL is incorrect', rendererState);
    assert(
      rendererState.modelHierarchy === 'half-roots-with-exploded-layers' &&
      rendererState.modelUnitScale === 0.001 &&
      rendererState.modelMetadata?.roots?.left === 'Left_Half_Root' &&
      rendererState.modelMetadata?.roots?.right === 'Right_Half_Root',
      'Updated millimeter GLB half-root hierarchy was not prepared for page rendering',
      rendererState
    );
    assert(
      rendererState.modelMetadata?.colorways?.dark === 'black' &&
      rendererState.modelMetadata?.colorways?.light === 'white',
      'Black/white exported colorway metadata was not preserved',
      rendererState.modelMetadata
    );
    assert(
      rendererState.explodedLayerCount === 18 &&
      JSON.stringify(rendererState.explodedLayerOrders) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7]) &&
      Math.abs(rendererState.explosionMaxOffset - 0.21) < 0.0001,
      'Exploded-view layers or spacing did not match the updated GLB metadata',
      rendererState
    );
    assert(
      rendererState.explodedItemCount === 147 &&
      JSON.stringify(rendererState.itemizedExplodedLayers) === JSON.stringify(['keycaps', 'sockets', 'switches']) &&
      rendererState.explodedItemMetadata.filter((item) => item.layer === 'keycaps').length === 45 &&
      rendererState.explodedItemMetadata.filter((item) => item.layer === 'switches').length === 45 &&
      rendererState.explodedItemMetadata.filter((item) => item.layer === 'sockets').length === 45,
      'Repeated exploded-view parts were not promoted to individual wave units',
      {
        itemCount: rendererState.explodedItemCount,
        itemizedLayers: rendererState.itemizedExplodedLayers
      }
    );
    assert(
      rendererState.explosionWave === 'ordered-layer-ripple' &&
      rendererState.assembledTransit === 'rigid-half-root' &&
      rendererState.collisionAvoidance === 'side-locked-and-top-case-clearance' &&
      rendererState.explosionTiming === 'at-segment-motion-start' &&
      rendererState.reassemblyTiming === 'during-segment-motion' &&
      rendererState.explodedPartRotation === 'motion-lagged-per-item' &&
      Math.abs(rendererState.explodedPartRotationMax - THREE_DEGREES_3_2) < 0.0001 &&
      JSON.stringify(rendererState.mobileExplosionSpacingRange) === JSON.stringify([2.45, 2.85]) &&
      rendererState.topCaseClearanceRatio === 0.78,
      'Exploded-only wave, rigid transit, and collision avoidance modes were not exposed by the renderer',
      rendererState
    );
    const waveDelays = (side, layer) => rendererState.explodedItemMetadata
      .filter((item) => item.side === side && item.layer === layer)
      .map((item) => item.waveDelay);
    ['left', 'right'].forEach((side) => {
      assert(
        Math.max(...waveDelays(side, 'keycaps')) < Math.min(...waveDelays(side, 'top_case')) &&
        Math.min(...waveDelays(side, 'sockets')) < Math.min(...waveDelays(side, 'pcb')),
        `Early keycap/socket departure order was not preserved on the ${side} half`,
        {
          keycaps: waveDelays(side, 'keycaps'),
          topCase: waveDelays(side, 'top_case'),
          sockets: waveDelays(side, 'sockets'),
          pcb: waveDelays(side, 'pcb')
        }
      );
    });
    assert(rendererState.exitMotion === 'cubic-diagonal-forward-twist', 'Exit motion did not use the cubic diagonal forward twist', rendererState);
    assert(rendererState.exitCurve === 'cubic-bezier', 'Exit motion did not use its dedicated cubic curve', rendererState);
    assert(rendererState.exitCorner === 'outer-back', 'Exit twist was not anchored to the outer-back corner direction', rendererState);
    assert(rendererState.twistSpace === 'mirrored-local-diagonal', 'Exit twist did not use mirrored local diagonal axes', rendererState);
    assert(rendererState.motionKind === 'cubic-swing-arc', 'Transit motion did not use the cubic swing arc', rendererState);
    assert(rendererState.transitSwing === 'travel-scaled-banking', 'Transit motion did not expose travel-scaled banking', rendererState);
    assert(rendererState.transitTwist === 'transient-corner-bell', 'Transit motion did not expose the transient corner twist', rendererState);
    assert(rendererState.transitStagger === 'lead-follow', 'Transit motion did not expose lead-follow staggering', rendererState);
    assert(rendererState.exitFade === 'final-third', 'Exit motion did not preserve the model until the final third', rendererState);
    assert(rendererState.materialFade === true, 'Pose opacity was not connected to cloned Three.js materials', rendererState);
    assert(rendererState.foregroundRendering === 'single-canvas', '3D rendering was not consolidated behind the copy', rendererState);
    const desktopExit = rendererState.exitTargets.desktop;
    assert(
      desktopExit.right.x >= 0.5 && desktopExit.right.y >= 0.5 && desktopExit.right.y >= desktopExit.right.x * 0.9 &&
      desktopExit.right.z >= 0.24 && desktopExit.right.scale > 2 &&
      desktopExit.right.rotationX <= -0.5 && desktopExit.right.rotationY <= -1 &&
      desktopExit.right.cornerTwist >= 0.85 &&
      desktopExit.left.x === -desktopExit.right.x &&
      desktopExit.left.y === desktopExit.right.y && desktopExit.left.z === desktopExit.right.z &&
      desktopExit.left.rotationY === -desktopExit.right.rotationY &&
      desktopExit.left.rotationZ === -desktopExit.right.rotationZ,
      'Left and right exit targets did not loom toward the camera and leave through the upper screen corners',
      desktopExit
    );
    assert(rendererState.reentryStaging === 'near-frustum', 'Re-entry did not expose near-frustum staging', rendererState);
    const desktopStaging = rendererState.stagingTargets.desktop;
    const mobileStaging = rendererState.stagingTargets.mobile;
    assert(
      desktopStaging.right.x > 0 && desktopStaging.right.x < desktopExit.right.x &&
      desktopStaging.right.y < desktopExit.right.y && desktopStaging.right.z < desktopExit.right.z &&
      desktopStaging.right.opacity === 0 &&
      desktopStaging.left.x === -desktopStaging.right.x &&
      desktopStaging.left.y === desktopStaging.right.y &&
      mobileStaging.right.x > 0 && mobileStaging.right.x < rendererState.exitTargets.mobile.right.x &&
      mobileStaging.left.x === -mobileStaging.right.x,
      'Staging poses were not placed near the frame edge inside the exit trajectories',
      { desktopStaging, mobileStaging }
    );
    let accentState = await readAccent(page);
    assert(accentState.accent === '#ff344a', 'Dark theme accent did not match the red sphere direction', accentState);
    assert(accentState.indicator === 'rgb(255, 52, 74)', 'Dark nav indicator did not use the red accent', accentState);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('surround:segment-change', { detail: { index: 1, source: 'test-transit' } }));
    });
    await page.waitForFunction(() => {
      const pose = window.__SURROUND_3D__?.currentPoses?.right;
      return pose && pose.cornerTwist > 0.1;
    }, null, { timeout: 5000, polling: 25 });
    const assembledTransitState = await page.evaluate(() => ({
      amounts: window.__SURROUND_3D__.explosionLayerAmounts,
      target: window.__SURROUND_3D__.explosionTarget
    }));
    assert(
      assembledTransitState.target === 0 &&
      assembledTransitState.amounts.every((amount) => amount === 0),
      'Normal segment transit separated layers instead of preserving the assembled model',
      assembledTransitState
    );
    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
    const settledFeatured = await page.evaluate(() => window.__SURROUND_3D__.currentPoses.right);
    assert(
      Math.abs(settledFeatured.cornerTwist) < 0.02 && settledFeatured.rotationY < -0.4,
      'Featured right unit did not settle back from its transient transit twist',
      settledFeatured
    );
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('surround:segment-change', { detail: { index: 0, source: 'test-transit-reset' } }));
    });
    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);

    await clickSegment(page, 2);
    let motionState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(motionState.activeScene === 1, 'Segment 02 did not activate right-unit scene', motionState);
    assert(motionState.foregroundSide === 'right', 'Segment 02 did not feature the right unit', motionState);
    assert(motionState.motionKind === 'cubic-swing-arc', 'Segment 02 did not use the cubic swing arc', motionState);
    assert(motionState.motionEasing === 'smootherstep', 'Segment 02 did not use zero-velocity easing', motionState);
    assert(motionState.scaleOvershoot === false, 'Segment 02 still used scale overshoot', motionState);
    assert(motionState.settling === 'zero-velocity', 'Segment 02 did not expose seamless settling', motionState);
    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
    const rightExitStart = await page.evaluate(() => ({ ...window.__SURROUND_3D__.currentPoses.right }));
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('surround:segment-change', { detail: { index: 2, source: 'test' } }));
    });
    const [rightExitHandle] = await Promise.all([
      page.waitForFunction((initial) => {
        const pose = window.__SURROUND_3D__?.currentPoses?.right;
        return pose && pose.x > 0.105 && pose.y > 0.1 && pose.z > 0.14 &&
          pose.scale > initial.scale && pose.cornerTwist > 0.4 && pose.foreground > 0.95
          ? { ...pose }
          : false;
      }, rightExitStart, { timeout: 1800 }),
      page.waitForFunction(() => {
        const poses = window.__SURROUND_3D__?.currentPoses;
        return poses && poses.left.x >= -0.36 && poses.left.opacity > 0.4 && poses.right.opacity > 0.9;
      }, null, { timeout: 1800 })
    ]);
    const rightExitPose = await rightExitHandle.jsonValue();
    await rightExitHandle.dispose();
    assert(
      rightExitPose.x > 0.105 && rightExitPose.y > 0.1 && rightExitPose.z > 0.14 &&
      rightExitPose.scale > rightExitStart.scale && rightExitPose.cornerTwist > 0.4 &&
      rightExitPose.foreground > 0.95,
      'Right unit did not visibly rise, advance, enlarge, and twist while exiting',
      rightExitPose
    );
    const stackingState = await page.evaluate(() => ({
      content: Number.parseInt(getComputedStyle(document.querySelector('.surround-segments')).zIndex, 10),
      canvas: Number.parseInt(getComputedStyle(document.querySelector('.surround-visual')).zIndex, 10)
    }));
    assert(
      stackingState.content > stackingState.canvas,
      'Segment copy was not stacked above the single 3D canvas',
      stackingState
    );
    await clickSegment(page, 3);
    motionState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(motionState.activeScene === 2, 'Segment 03 did not activate left-unit scene', motionState);
    assert(motionState.foregroundSide === 'left', 'Segment 03 did not feature the left unit', motionState);
    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
    const leftExitStart = await page.evaluate(() => ({ ...window.__SURROUND_3D__.currentPoses.left }));
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('surround:segment-change', { detail: { index: 1, source: 'test' } }));
    });
    const [leftExitHandle] = await Promise.all([
      page.waitForFunction((initial) => {
        const pose = window.__SURROUND_3D__?.currentPoses?.left;
        return pose && pose.x < -0.105 && pose.y > 0.1 && pose.z > 0.14 &&
          pose.scale > initial.scale && pose.cornerTwist > 0.4 && pose.foreground > 0.95
          ? { ...pose }
          : false;
      }, leftExitStart, { timeout: 1800 }),
      page.waitForFunction(() => {
        const poses = window.__SURROUND_3D__?.currentPoses;
        return poses && poses.right.x <= 0.36 && poses.right.opacity > 0.4 && poses.left.opacity > 0.9;
      }, null, { timeout: 1800 })
    ]);
    const leftExitPose = await leftExitHandle.jsonValue();
    await leftExitHandle.dispose();
    assert(
      leftExitPose.x < -0.105 && leftExitPose.y > 0.1 && leftExitPose.z > 0.14 &&
      leftExitPose.scale > leftExitStart.scale && leftExitPose.cornerTwist > 0.4 &&
      leftExitPose.foreground > 0.95,
      'Left unit exit did not mirror the right unit toward the upper-left camera side',
      leftExitPose
    );
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('surround:segment-change', { detail: { index: 2, source: 'test-restore' } }));
    });
    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
    const collisionSafeEntryHandlePromise = page.waitForFunction(() => {
      const state = window.__SURROUND_3D__;
      const right = state?.currentPoses?.right;
      return state?.activeScene === 3 && state.motionActive && right?.opacity > 0.2
        ? {
          right: { ...right }, left: { ...state.currentPoses.left },
          amounts: [...state.explosionLayerAmounts], destinationScale: state.pairLayout.scale
        }
        : false;
    });
    const explosionWaveHandlePromise = page.waitForFunction(() => {
      const amounts = window.__SURROUND_3D__?.explosionLayerAmounts || [];
      return amounts.length === 18 && Math.max(...amounts) - Math.min(...amounts) > 0.15
        ? {
          amounts: [...amounts],
          target: window.__SURROUND_3D__.explosionTarget,
          destinationScale: window.__SURROUND_3D__.pairLayout.scale,
          poses: structuredClone(window.__SURROUND_3D__.currentPoses)
        }
        : false;
    });
    await page.evaluate(() => {
      window.__SURROUND_ITEM_WAVE_OBSERVED__ = { keycaps: 0, switches: 0, sockets: 0 };
    });
    const itemWaveHandlePromise = page.waitForFunction(() => {
      const state = window.__SURROUND_3D__;
      const metadata = state?.explodedItemMetadata || [];
      const amounts = state?.explosionItemAmounts || [];
      const observed = window.__SURROUND_ITEM_WAVE_OBSERVED__;
      ['keycaps', 'switches', 'sockets'].forEach((layer) => {
        const layerAmounts = amounts.filter((_, index) => metadata[index]?.layer === layer);
        const spread = layerAmounts.length ? Math.max(...layerAmounts) - Math.min(...layerAmounts) : 0;
        observed[layer] = Math.max(observed[layer], spread);
      });
      return Object.values(observed).every((spread) => spread > 0.08)
        ? {
          spreads: { ...observed },
          amounts: [...amounts],
          offsets: [...state.explosionItemOffsets],
          metadata: state.explodedItemMetadata
        }
        : false;
    });
    const partRotationHandlePromise = page.waitForFunction(() => {
      const rotations = window.__SURROUND_3D__?.explosionItemRotations || [];
      const maximum = rotations.length ? Math.max(...rotations) : 0;
      const spread = rotations.length ? maximum - Math.min(...rotations) : 0;
      return maximum > 0.004 && spread > 0.002
        ? { rotations: [...rotations], maximum, spread }
        : false;
    });
    await clickSegment(page, 4);
    const collisionSafeEntryHandle = await collisionSafeEntryHandlePromise;
    const collisionSafeEntry = await collisionSafeEntryHandle.jsonValue();
    await collisionSafeEntryHandle.dispose();
    assert(
      Math.abs(collisionSafeEntry.right.scale - collisionSafeEntry.destinationScale) < 0.00001 &&
      collisionSafeEntry.right.x > collisionSafeEntry.left.x &&
      Math.max(...collisionSafeEntry.amounts) > 0,
      'Segment 04 did not combine collision-safe re-entry with immediate exploded motion',
      collisionSafeEntry
    );
    const explosionWaveHandle = await explosionWaveHandlePromise;
    const explosionWaveState = await explosionWaveHandle.jsonValue();
    await explosionWaveHandle.dispose();
    assert(
      explosionWaveState.target === 1 &&
      Math.max(...explosionWaveState.amounts) - Math.min(...explosionWaveState.amounts) > 0.15 &&
      Math.abs(explosionWaveState.poses.right.scale - explosionWaveState.destinationScale) < 0.00001 &&
      explosionWaveState.poses.right.x > explosionWaveState.poses.left.x,
      'Segment 04 did not propagate the explosion wave with collision-safe re-entry',
      explosionWaveState
    );
    const itemWaveHandle = await itemWaveHandlePromise;
    const itemWaveState = await itemWaveHandle.jsonValue();
    await itemWaveHandle.dispose();
    assert(
      itemWaveState.spreads.keycaps > 0.08 &&
      itemWaveState.spreads.switches > 0.08 &&
      itemWaveState.spreads.sockets > 0.08,
      'Repeated keycaps, switches, or sockets still moved in sync within their layer',
      itemWaveState.spreads
    );
    const partRotationHandle = await partRotationHandlePromise;
    const partRotationState = await partRotationHandle.jsonValue();
    await partRotationHandle.dispose();
    assert(
      partRotationState.maximum > 0.004 &&
      partRotationState.maximum <= THREE_DEGREES_3_2 + 0.0001 &&
      partRotationState.spread > 0.002,
      'Exploded parts stayed angle-locked to the half root during the twist motion',
      partRotationState
    );
    const constrainedLayers = new Set(['controller', 'mouse_sensor', 'conthrough', 'sockets', 'pcb']);
    itemWaveState.metadata.forEach((item, index) => {
      if (!constrainedLayers.has(item.layer)) {
        return;
      }
      const topCaseIndex = itemWaveState.metadata.findIndex((candidate) => (
        candidate.side === item.side && candidate.layer === 'top_case'
      ));
      assert(
        itemWaveState.offsets[index] <= itemWaveState.offsets[topCaseIndex] * 0.78 + 0.000001,
        `${item.name} rose above the top-case clearance envelope`,
        {
          item,
          itemOffset: itemWaveState.offsets[index],
          topCaseOffset: itemWaveState.offsets[topCaseIndex]
        }
      );
    });
    await page.waitForFunction(() => (
      window.__SURROUND_3D__?.motionActive === false &&
      window.__SURROUND_3D__?.explosionAmount === 1
    ));
    const explodedState = await page.evaluate(() => ({
      scene: window.__SURROUND_3D__.activeScene,
      amount: window.__SURROUND_3D__.explosionAmount,
      target: window.__SURROUND_3D__.explosionTarget,
      layerCount: window.__SURROUND_3D__.explodedLayerCount,
      rotations: [...window.__SURROUND_3D__.explosionItemRotations]
    }));
    assert(
      explodedState.scene === 3 && explodedState.amount === 1 &&
      explodedState.target === 1 && explodedState.layerCount === 18,
      'Segment 04 did not settle into the GLB-backed exploded view',
      explodedState
    );
    assert(
      explodedState.rotations.every((angle) => angle < 0.00001),
      'Exploded parts did not smoothly settle back to their exact authored angles',
      explodedState.rotations
    );
    const actionOrder = await page.locator('.surround-actions .surround-action').evaluateAll((elements) => (
      elements.map((element) => ({
        primary: element.classList.contains('surround-action--primary'),
        secondary: element.classList.contains('surround-action--secondary'),
        githubIcon: Boolean(element.querySelector('.surround-action__icon--github')),
        simpleIconsCdn: (() => {
          const icon = element.querySelector('.surround-action__icon--github');
          if (!icon) {
            return false;
          }
          const style = getComputedStyle(icon);
          return `${style.maskImage} ${style.webkitMaskImage}`.includes('cdn.jsdelivr.net/npm/simple-icons@v16/icons/github.svg');
        })()
      }))
    ));
    assert(
      actionOrder.length === 2 && actionOrder[0].secondary && actionOrder[1].primary,
      'Segment 04 actions were not ordered home-left and repository-right',
      actionOrder
    );
    assert(
      !actionOrder[0].githubIcon && actionOrder[1].githubIcon && actionOrder[1].simpleIconsCdn,
      'Repository action did not render the Simple Icons CDN GitHub icon on its left side',
      actionOrder
    );

    const reassemblyHandlePromise = page.waitForFunction(() => {
      const state = window.__SURROUND_3D__;
      const amounts = state?.explosionItemAmounts || [];
      const spread = amounts.length ? Math.max(...amounts) - Math.min(...amounts) : 0;
      return state?.explosionTarget === 0 && state.motionActive &&
        Math.max(...amounts) > 0.1 && Math.min(...amounts) < 0.9 && spread > 0.08
        ? {
          amounts: [...amounts],
          offsets: [...state.explosionItemOffsets],
          target: state.explosionTarget,
          scene: state.activeScene
        }
        : false;
    });
    await clickSegment(page, 3);
    const reassemblyHandle = await reassemblyHandlePromise;
    const reassemblyState = await reassemblyHandle.jsonValue();
    await reassemblyHandle.dispose();
    assert(
      reassemblyState.scene === 2 && reassemblyState.target === 0 &&
      Math.max(...reassemblyState.amounts) > 0.1 && Math.min(...reassemblyState.amounts) < 0.9,
      'Leaving segment 04 snapped the exploded view together instead of reassembling during transit',
      reassemblyState
    );
    await page.waitForFunction(() => (
      window.__SURROUND_3D__?.motionActive === false &&
      window.__SURROUND_3D__?.explosionItemAmounts?.every((amount) => amount === 0)
    ));
    await clickSegment(page, 4);
    await page.waitForFunction(() => (
      window.__SURROUND_3D__?.motionActive === false &&
      window.__SURROUND_3D__?.explosionAmount === 1
    ));

    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
    const posesBeforeFooter = await page.evaluate(() => window.__SURROUND_3D__.currentPoses);
    await clickFooter(page);
    await page.waitForTimeout(240);
    const footerState = await page.evaluate(() => {
      const control = document.querySelector('[data-surround-footer-target="surround-footer"]');
      return {
        active: control.classList.contains('is-active'),
        ariaCurrent: control.getAttribute('aria-current'),
        hash: window.location.hash,
        scene: document.body.dataset.surroundScene,
        stop: document.body.dataset.surroundStop,
        motionActive: window.__SURROUND_3D__.motionActive,
        poses: window.__SURROUND_3D__.currentPoses
      };
    });
    assert(
      footerState.active && footerState.ariaCurrent === 'true' && footerState.hash === '#surround-footer' &&
      footerState.scene === '3' && footerState.stop === 'surround-footer',
      'Footer settings segment did not activate at document end while preserving scene 04',
      footerState
    );
    assert(
      footerState.motionActive === false && JSON.stringify(footerState.poses) === JSON.stringify(posesBeforeFooter),
      'Footer settings segment restarted motion for the unchanged scene 04',
      { before: posesBeforeFooter, after: footerState }
    );

    await page.locator('.theme-select').selectOption('light');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light' && window.__SURROUND_3D__?.theme === 'light');
    await page.waitForFunction(() => (
      getComputedStyle(document.querySelector('.surround-section-nav__indicator')).backgroundColor === 'rgb(104, 109, 117)'
    ));
    rendererState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(rendererState.modelUrls.light.endsWith('Surround1x0-AKDK-White.glb'), 'White GLB URL is incorrect', rendererState);
    accentState = await readAccent(page);
    assert(accentState.accent === '#686d75', 'Light theme accent did not match the gray sphere direction', accentState);
    assert(accentState.indicator === 'rgb(104, 109, 117)', 'Light nav indicator did not use the gray accent', accentState);

    let layout = await readLayout(page);
    assertHorizontalFit(layout, 'Desktop segment 04');
    assert(layout.primaryAction.top >= 0 && layout.primaryAction.bottom <= layout.viewport.height, 'Desktop repository link is clipped', layout.primaryAction);
    assert(layout.footer.bottom <= layout.viewport.height + 1, 'Desktop footer is clipped', layout.footer);

    await page.setViewportSize({ width: 874, height: 619 });
    await page.reload({ waitUntil: 'load' });
    await waitFor3d(page);
    await clickSegment(page, 1);
    await assertPairFit(page, 'Intermediate segment 01');
    layout = await readLayout(page);
    assertHorizontalFit(layout, 'Intermediate segment 01');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'load' });
    await waitFor3d(page);
    for (let number = 1; number <= 4; number += 1) {
      await clickSegment(page, number);
      layout = await readLayout(page);
      assertHorizontalFit(layout, `Mobile segment 0${number}`);
      if (number === 1) {
        const heroState = await page.evaluate(() => ({
          copy: document.querySelector('.surround-copy--hero').getBoundingClientRect().toJSON(),
          viewportHeight: window.innerHeight,
          poses: window.__SURROUND_3D__.currentPoses
        }));
        assert(
          heroState.copy.top >= 120 && heroState.copy.bottom < heroState.viewportHeight * 0.62,
          'Mobile hero copy was not placed near the vertical center',
          heroState
        );
        assert(
          heroState.poses.left.y < 0 && heroState.poses.right.y < 0,
          'Mobile hero models were not moved below the copy',
          heroState
        );
      }
      if (number === 2 || number === 3) {
        await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
        await assertFeaturedFit(page, `Mobile segment 0${number}`);
      }
      if (number === 4) {
        await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
        const mobileExplosionState = await page.evaluate(() => ({
          poses: structuredClone(window.__SURROUND_3D__.currentPoses),
          offsets: [...window.__SURROUND_3D__.explosionItemOffsets],
          desktopMaxOffset: window.__SURROUND_3D__.explosionMaxOffset,
          spacingScale: window.__SURROUND_3D__.explosionSpacingScale
        }));
        const { left, right } = mobileExplosionState.poses;
        assert(
          left.x === -right.x && left.x < 0 &&
          left.y <= -0.26 && right.y === left.y &&
          left.z === 0.035 && right.z === left.z &&
          left.scale > 0 && right.scale === left.scale &&
          left.rotationX <= -0.27 && right.rotationX === left.rotationX &&
          left.rotationY === 0 && right.rotationY === 0 &&
          left.rotationZ === 0 && right.rotationZ === 0,
          'Mobile segment 04 did not use the closer parallel exploded layout',
          mobileExplosionState
        );
        await assertPairFit(page, 'Mobile segment 04');
        assert(
          mobileExplosionState.spacingScale >= 2.84 &&
          Math.max(...mobileExplosionState.offsets) >= mobileExplosionState.desktopMaxOffset * 2.84,
          'Mobile segment 04 did not extend the exploded layers into the vertical space',
          mobileExplosionState
        );
      }
    }
    await clickFooter(page);
    layout = await readLayout(page);
    assertHorizontalFit(layout, 'Mobile footer settings');
    assert(layout.primaryAction.top >= 0 && layout.primaryAction.bottom <= layout.viewport.height, 'Mobile repository link is clipped', layout.primaryAction);
    assert(layout.footer.bottom <= layout.viewport.height + 1, 'Mobile footer is clipped', layout.footer);
    layout.selects.forEach((select, index) => {
      assert(select.left >= 0 && select.right <= layout.viewport.width && select.top >= 0 && select.bottom <= layout.viewport.height, `Mobile footer select ${index + 1} is clipped`, select);
    });

    await page.setViewportSize({ width: 446, height: 619 });
    await page.reload({ waitUntil: 'load' });
    await waitFor3d(page);
    for (let number = 1; number <= 3; number += 1) {
      await clickSegment(page, number);
      if (number > 1) {
        await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
      }
      layout = await readLayout(page);
      assertHorizontalFit(layout, `Mobile 446x619 segment 0${number}`);
      assert(
        layout.activeCopy.top >= 0 && layout.activeCopy.bottom <= layout.viewport.height,
        `Mobile 446x619 segment 0${number} copy is clipped`,
        layout.activeCopy
      );
      if (number === 2 || number === 3) {
        await assertFeaturedFit(page, `Mobile 446x619 segment 0${number}`);
      }
    }
    await clickSegment(page, 1);
    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
    const compactHeroState = await page.evaluate(() => {
      const copy = document.querySelector('.surround-copy--hero').getBoundingClientRect();
      return {
        copy: { top: copy.top, bottom: copy.bottom },
        viewportHeight: window.innerHeight,
        poses: window.__SURROUND_3D__.currentPoses
      };
    });
    assert(
      compactHeroState.copy.top >= 120 && compactHeroState.copy.bottom < compactHeroState.viewportHeight * 0.62 &&
      compactHeroState.poses.left.y < 0 && compactHeroState.poses.right.y < 0,
      'Mobile 446x619 hero did not bring the copy and models toward the center',
      compactHeroState
    );

    await page.setViewportSize({ width: 338, height: 619 });
    await page.reload({ waitUntil: 'load' });
    await waitFor3d(page);
    await clickSegment(page, 1);
    layout = await readLayout(page);
    assertHorizontalFit(layout, 'Mobile 338x619 segment 01');
    const narrowHeroState = await page.evaluate(() => {
      const copy = document.querySelector('.surround-copy--hero').getBoundingClientRect();
      return {
        copy: { top: copy.top, bottom: copy.bottom },
        viewportHeight: window.innerHeight,
        poses: window.__SURROUND_3D__.currentPoses
      };
    });
    assert(
      narrowHeroState.copy.top >= 150 && narrowHeroState.copy.bottom < narrowHeroState.viewportHeight * 0.6 &&
      narrowHeroState.poses.left.y >= -0.07 && narrowHeroState.poses.right.y >= -0.07,
      'Mobile 338x619 hero did not close the copy-to-model gap around the viewport center',
      narrowHeroState
    );
    await clickSegment(page, 4);
    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
    const narrowExplosionState = await page.evaluate(() => ({
      poses: structuredClone(window.__SURROUND_3D__.currentPoses),
      spacingScale: window.__SURROUND_3D__.explosionSpacingScale
    }));
    assert(
      narrowExplosionState.poses.left.x === -narrowExplosionState.poses.right.x &&
      narrowExplosionState.poses.left.x < 0 &&
      narrowExplosionState.poses.left.y <= -0.22 &&
      narrowExplosionState.poses.left.z === 0.035 &&
      narrowExplosionState.poses.left.scale > 0 &&
      narrowExplosionState.poses.left.rotationY === 0 &&
      narrowExplosionState.poses.right.rotationY === 0 &&
      narrowExplosionState.poses.left.rotationZ === 0 &&
      narrowExplosionState.poses.right.rotationZ === 0 &&
      narrowExplosionState.spacingScale >= 2.44,
      'Mobile 338x619 segment 04 did not preserve the compact parallel vertical layout',
      narrowExplosionState
    );

    await assertPairFit(page, 'Narrow segment 04');
    // Resize the same loaded scene through portrait, wide, short, and breakpoint layouts.
    for (const [width, height] of [[1353, 1323], [1440, 900], [900, 1200], [900, 900], [901, 900], [900, 901], [874, 619], [673, 1100], [672, 1100], [390, 844], [338, 619], [446, 619], [844, 390], [1676, 619], [2560, 619], [1920, 1080], [2736, 1480], [3840, 2160], [1370, 300], [667, 375]]) {
      await page.setViewportSize({ width, height });
      for (const number of [1, 2, 3, 4]) {
        await clickSegment(page, number);
        if (number === 2 || number === 3) await assertFeaturedFit(page, `${width}x${height} segment 0${number}`);
        else await assertPairFit(page, `${width}x${height} segment 0${number}`);
      }
    }
    await context.close();
    await verifyNavigationDuringModelLoad(browser, pageUrl);
    await verifyWebKitScrollAlignment(pageUrl);
    await verifyNoPhotoFallback(browser, pageUrl);
    await verifyModelInteraction(browser, pageUrl);
    console.log('Surround1x0-AKDK segmented Three.js experience passed desktop, mobile, and theme checks.');
  } catch (error) {
    if (vite.exitCode !== null) {
      error.message += `\nVite output:\n${viteOutput}`;
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(vite);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
