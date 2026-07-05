/**
 * テスト概要:
 *  - 目的: iOS Safari 相当の環境(Playwright WebKit + iPhone デバイス設定)でトップページを
 *    縦スワイプした際、セクション移動が中途半端な位置で止まらず、nav segment と表示セクションが
 *    常に一致することを検証する。あわせて iOS Safari 固有の 2 つの障害モードへの対策を検証する:
 *    (1) ネイティブスクロール開始後に touchmove が cancelable:false になり JS 制御を奪う問題
 *        → JS 制御中は html に touch-action で縦パンを禁止し、最初の touchmove から preventDefault する。
 *    (2) 慣性スクロール中のプログラムスクロールが無視される問題
 *        → settle 時の位置補正を rAF ループで整合するまで再適用する(scrollTo 欠落をモックで模擬)。
 *  - 期待値:
 *    - html 要素の computed touch-action に pan-x が含まれる(縦パン禁止が適用されている)。
 *    - 意図判定しきい値(10px)未満の最初の縦 touchmove でも defaultPrevented === true。
 *    - スワイプで catch → products → footer → products → catch と移動でき、各停止位置で
 *      対象セクションの top が 0px 付近(footer は文書末尾)かつ active target が一致する。
 *    - window.scrollTo が数回無視されても(iOS の慣性中挙動の模擬)最終的に整合位置へ補正される。
 *    - ロック中の連続スワイプ後も位置と nav が食い違わない。
 *    - JS 管理外のスクロール(2本指ジェスチャ等の模擬として直接 scrollTo)でセクション間の
 *      中途半端な位置に置かれても、静止後に最寄りのスナップ位置へ自己修復し nav も同期する。
 *    - 長押しでシステムがジェスチャを奪い touchend が届かないままスクロールされた場合
 *      (touchstart のみ dispatch して放置)でも、タッチ情報の stale 判定により自己修復する。
 *  - 検証方法: ローカル静的サーバーでトップページを配信し、WebKit の iPhone 14 Pro コンテキストで
 *    合成 TouchEvent(touches 配列を持つ plain Event)を window へ dispatch してスワイプを再現し、
 *    scrollY・active target・各セクションの矩形を取得して判定する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { webkit, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const SECTION_TOLERANCE = 4;

function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
  if (filePath.endsWith(path.sep)) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.end(data);
  });
}

function startServer() {
  const server = http.createServer(serveStatic);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function dispatchSwipe(page, startY, endY, steps = 14) {
  await page.evaluate(async ({ startY, endY, steps }) => {
    const x = Math.round(window.innerWidth / 2);
    const fire = (type, y) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      event.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
      window.dispatchEvent(event);
      return event;
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    fire('touchstart', startY);
    for (let index = 1; index <= steps; index += 1) {
      const y = startY + ((endY - startY) * index) / steps;
      fire('touchmove', y);
      await wait(16);
    }
    fire('touchend', endY);
  }, { startY, endY, steps });
}

async function getHomeState(page) {
  return page.evaluate(() => {
    const active = document.querySelector('.home-section-nav__button.is-active, .home-section-nav__footer-link.is-active');
    const catchRect = document.getElementById('catch-section').getBoundingClientRect();
    const productsRect = document.getElementById('products-section').getBoundingClientRect();
    return {
      scrollY: Math.round(window.scrollY),
      activeTarget: active ? active.dataset.sectionTarget || active.dataset.footerTarget : null,
      catchTop: Number(catchRect.top.toFixed(2)),
      productsTop: Number(productsRect.top.toFixed(2)),
      distanceFromBottom: Math.round(document.documentElement.scrollHeight - (window.scrollY + window.innerHeight))
    };
  });
}

function assertSectionState(state, expectedTarget, topKey, label) {
  if (state.activeTarget !== expectedTarget) {
    throw new Error(`[${label}] Expected active target ${expectedTarget}, got ${state.activeTarget}: ${JSON.stringify(state)}`);
  }
  if (Math.abs(state[topKey]) > SECTION_TOLERANCE) {
    throw new Error(`[${label}] Expected ${topKey} near 0px, got ${state[topKey]}: ${JSON.stringify(state)}`);
  }
}

function assertFooterState(state, label) {
  if (state.activeTarget !== 'home-footer') {
    throw new Error(`[${label}] Expected footer segment to be active, got ${state.activeTarget}: ${JSON.stringify(state)}`);
  }
  if (state.distanceFromBottom > SECTION_TOLERANCE) {
    throw new Error(`[${label}] Expected to be settled at footer bottom, got ${state.distanceFromBottom}px from bottom: ${JSON.stringify(state)}`);
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await webkit.launch();

  try {
    const context = await browser.newContext({
      ...devices['iPhone 14 Pro'],
      viewport: MOBILE_VIEWPORT,
      colorScheme: 'dark'
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') {
        await route.continue();
        return;
      }
      if (route.request().resourceType() === 'stylesheet') {
        await route.fulfill({
          status: 200,
          contentType: 'text/css',
          body: '*,*::before,*::after{box-sizing:border-box}body{margin:0;}'
        });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('mdw-theme', 'dark');
        localStorage.setItem('mdw-lang', 'ja');
      } catch (error) {
        // ignore storage write errors
      }
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // (1) JS 制御中は縦パンがネイティブに渡らないこと (touch-action)
    const touchAction = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction);
    if (!touchAction.includes('pan-x')) {
      throw new Error(`Expected html touch-action to exclude vertical pan (include pan-x), got "${touchAction}"`);
    }

    // (2) 意図判定しきい値未満の最初の縦 touchmove でも preventDefault されること
    const firstMovePrevented = await page.evaluate(() => {
      const x = Math.round(window.innerWidth / 2);
      const fire = (type, y) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        event.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
        window.dispatchEvent(event);
        return event;
      };
      fire('touchstart', 400);
      const move = fire('touchmove', 393); // delta 7px < 意図判定しきい値 10px
      fire('touchend', 393);
      return move.defaultPrevented;
    });
    if (!firstMovePrevented) {
      throw new Error('Expected the first vertical touchmove (below intent threshold) to be preventDefault-ed');
    }

    // (3) スワイプでの往復移動が常に整合すること
    await dispatchSwipe(page, 650, 190);
    await page.waitForTimeout(1300);
    assertSectionState(await getHomeState(page), 'products-section', 'productsTop', 'swipe catch->products');

    await dispatchSwipe(page, 650, 190);
    await page.waitForTimeout(1300);
    assertFooterState(await getHomeState(page), 'swipe products->footer');

    await dispatchSwipe(page, 190, 650);
    await page.waitForTimeout(1300);
    assertSectionState(await getHomeState(page), 'products-section', 'productsTop', 'swipe footer->products');

    await dispatchSwipe(page, 190, 650);
    await page.waitForTimeout(1300);
    assertSectionState(await getHomeState(page), 'catch-section', 'catchTop', 'swipe products->catch');

    // (4) プログラムスクロールが数回無視されても補正されること(iOS の慣性中挙動の模擬)
    await page.evaluate(() => {
      const original = window.scrollTo.bind(window);
      window.__dropScrollCalls = 3;
      window.__droppedScrollCalls = 0;
      window.scrollTo = (...args) => {
        if (typeof args[0] === 'object' && args[0] !== null && window.__dropScrollCalls > 0) {
          window.__dropScrollCalls -= 1;
          window.__droppedScrollCalls += 1;
          return undefined;
        }
        return original(...args);
      };
    });
    await dispatchSwipe(page, 650, 190);
    await page.waitForTimeout(1500);
    const droppedCalls = await page.evaluate(() => window.__droppedScrollCalls);
    if (droppedCalls < 3) {
      throw new Error(`Expected the dropped-scroll simulation to swallow 3 calls, swallowed ${droppedCalls}`);
    }
    assertSectionState(await getHomeState(page), 'products-section', 'productsTop', 'dropped-scroll recovery');

    // (5) ロック中の連続スワイプ後も位置と nav が食い違わないこと
    await dispatchSwipe(page, 190, 650);
    await dispatchSwipe(page, 190, 650, 6);
    await page.waitForTimeout(1500);
    const rapidState = await getHomeState(page);
    const aligned = [
      { target: 'catch-section', top: rapidState.catchTop },
      { target: 'products-section', top: rapidState.productsTop }
    ].find((entry) => Math.abs(entry.top) <= SECTION_TOLERANCE);
    if (!aligned) {
      throw new Error(`Expected rapid swipes to settle on a section boundary: ${JSON.stringify(rapidState)}`);
    }
    if (rapidState.activeTarget !== aligned.target) {
      throw new Error(`Expected nav to match settled section ${aligned.target}: ${JSON.stringify(rapidState)}`);
    }

    // (6) JS 管理外のスクロールで中途半端な位置に置かれても自己修復すること
    //     (ボタンを押したまま2本指でスワイプした場合など、JS が関与しないネイティブスクロールの模擬)。
    //     実機 iOS では CSS の mandatory snap が機能しない場面があるため、スナップを無効化して
    //     ブラウザ自身の再スナップに頼らず JS 側の自己修復のみで整合することを確認する。
    await page.evaluate(() => {
      document.documentElement.style.scrollSnapType = 'none';
      const productsTop = Math.round(document.getElementById('products-section').getBoundingClientRect().top + window.scrollY);
      window.scrollTo(0, productsTop - 200);
    });
    await page.waitForTimeout(1400);
    assertSectionState(await getHomeState(page), 'products-section', 'productsTop', 'unmanaged mid-scroll recovery (section)');

    await page.evaluate(() => {
      const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      window.scrollTo(0, documentHeight - window.innerHeight - 60);
    });
    await page.waitForTimeout(1400);
    assertFooterState(await getHomeState(page), 'unmanaged mid-scroll recovery (footer)');

    // (7) 長押しでシステムがジェスチャを奪い、touchend が届かないままスクロールされても
    //     自己修復すること(実機 Safari の「長押し→スクロールバー表示→スクロール」の再現)
    await page.evaluate(() => {
      const x = Math.round(window.innerWidth / 2);
      const event = new Event('touchstart', { bubbles: true, cancelable: true });
      event.touches = [{ clientX: x, clientY: 400 }];
      window.dispatchEvent(event);
      // touchmove / touchend は届かないまま、システムスクロール相当の移動だけが起きる
      const productsTop = Math.round(document.getElementById('products-section').getBoundingClientRect().top + window.scrollY);
      window.scrollTo(0, productsTop - 250);
    });
    await page.waitForTimeout(2600);
    assertSectionState(await getHomeState(page), 'products-section', 'productsTop', 'system-claimed gesture recovery');

    await page.evaluate(() => {
      document.documentElement.style.scrollSnapType = '';
    });

    console.log('Home sections stay in sync under iOS-Safari-like touch conditions (WebKit).');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
