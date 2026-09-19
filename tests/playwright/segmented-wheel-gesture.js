/**
 * テスト概要:
 *  - 目的: 共通スクロールを使うホーム・製品一覧・Surround の wheel 入力が、しきい値とジェスチャーロックを守ることを確認する。
 *  - 期待値: 0.25px の初回からキャンセルし、85.5px では動かず86pxで1区間移動する。1.5秒以上入力が続いても再移動せず、180ms以上の無入力後は逆方向へ戻れる。
 *  - 検証方法: 隔離した Chromium/WebKit の実ページで合成 WheelEvent を dispatch し、キャンセル可否・scrollY・active nav を確認する。デスクトップでは実 wheel 入力も確認する。
 *    WebKit の iPad 設定はレイアウトと入力契約の検証であり、UIKit のイベント生成や実機トラックパッドそのものを再現するものではない。
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium, webkit, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const BROWSER = process.env.SEGMENTED_BROWSER || 'chromium';
const cases = [
  { url: '/', managed: 'home-scroll-managed', first: 'catch-section', next: 'products-section', nav: '.home-section-nav__button' },
  { url: '/products/', managed: 'catalog-scroll-managed', first: 'catalog-search-section', next: 'catalog-product-bartical', nav: '.catalog-section-nav__icon-button, .catalog-section-nav__number' },
  { url: '/products/Surround1x0-AKDK/', managed: 'surround-scroll-managed', first: 'surround-01', next: 'surround-02', nav: '.surround-section-nav__button' }
];

async function state(page, spec) {
  return page.evaluate(({ first, next, nav }) => {
    const active = Array.from(document.querySelectorAll(nav)).find((element) => element.classList.contains('is-active'));
    return {
      y: scrollY,
      firstTop: document.getElementById(first).getBoundingClientRect().top,
      nextTop: document.getElementById(next).getBoundingClientRect().top,
      active: active?.dataset.sectionTarget || active?.dataset.surroundTarget,
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  }, spec);
}

async function wheel(page, deltaY, init = {}) {
  return page.evaluate(({ deltaY, init }) => {
    const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...init });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  }, { deltaY, init });
}

async function waitAt(page, id) {
  await page.waitForFunction((id) => Math.abs(document.getElementById(id).getBoundingClientRect().top) <= 4, id);
}

async function verifyPage(context, spec, baseURL, profile) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(new URL(spec.url, baseURL).href, { waitUntil: 'networkidle' });
    await page.waitForFunction((spec) => document.documentElement.classList.contains(spec.managed)
      && document.getElementById(spec.next), spec);
    await waitAt(page, spec.first);
    // Allow initial navigation/position restoration to finish before the first input.
    await page.waitForTimeout(1200);
    assert.equal(await wheel(page, -0.25), true, 'outward input at first stop must be canceled');
    await page.waitForTimeout(220);
    assert.equal(await wheel(page, 0.25), true, 'first subpixel input must remain cancelable');
    assert.equal(await wheel(page, 85.25), true);
    const below = await state(page, spec);
    assert.ok(Math.abs(below.firstTop) <= 4, JSON.stringify(below));
    assert.equal(below.active, spec.first);
    await wheel(page, 0.5);

    // A gesture whose tail outlasts both the navigation lock and settle alignment.
    const prevented = await page.evaluate(async () => {
      const samples = [];
      for (let i = 0; i < 24; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 70));
        const event = new WheelEvent('wheel', {
          deltaY: i < 16 ? 30 : (i % 2 ? 0.25 : -0.25), bubbles: true, cancelable: true
        });
        document.body.dispatchEvent(event);
        samples.push(event.defaultPrevented);
      }
      return samples;
    });
    assert.ok(prevented.every(Boolean));
    const afterTail = await state(page, spec);
    assert.equal(afterTail.active, spec.next, JSON.stringify(afterTail));
    assert.ok(Math.abs(afterTail.nextTop) <= 4, JSON.stringify(afterTail));
    assert.ok(afterTail.overflow <= 1, JSON.stringify(afterTail));
    await page.waitForTimeout(220);
    await wheel(page, -86);
    await waitAt(page, spec.first);
    assert.equal((await state(page, spec)).active, spec.first);
    await page.waitForTimeout(1200);

    if (spec.url === '/products/') {
      const yielded = await page.locator('.catalog-section-nav__numbers').evaluate((element) => {
        const event = new WheelEvent('wheel', { deltaX: 100, deltaY: 1, bubbles: true, cancelable: true });
        element.dispatchEvent(event);
        return !event.defaultPrevented;
      });
      assert.equal(yielded, true, 'horizontal number navigation must remain available');
    }
    if (profile === 'desktop') {
      await page.mouse.move(100, 300);
      await page.mouse.wheel(0, 120);
      await waitAt(page, spec.next);
      assert.equal((await state(page, spec)).active, spec.next);
    }
    if (process.env.SEGMENTED_EVIDENCE === '1') {
      const evidence = path.join(ROOT, '.temp/ipad-trackpad/evidence');
      await fs.mkdir(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, `${BROWSER}-${profile}-${spec.managed}.png`) });
    }
    assert.deepEqual(errors, [], 'page errors');
    console.log(`PASS ${BROWSER} ${profile} ${spec.url}: threshold, gesture lock, next gesture, nav alignment`);
  } finally {
    await page.close();
  }
}

async function main() {
  let server;
  let browser;
  try {
    let baseURL = process.env.SEGMENTED_BASE_URL;
    if (!baseURL) {
      const { createServer } = await import('vite');
      server = await createServer({
        configFile: path.join(ROOT, 'vite.config.mjs'),
        cacheDir: path.join(ROOT, `.temp/segmented-wheel-${BROWSER}/vite`),
        logLevel: 'error',
        server: { host: '127.0.0.1', port: 0, open: false }
      });
      await server.listen();
      baseURL = `http://127.0.0.1:${server.httpServer.address().port}`;
    }
    browser = await ({ chromium, webkit }[BROWSER]).launch();
    const profiles = [{ name: 'desktop', viewport: { width: 1440, height: 1000 } }];
    if (BROWSER === 'webkit') profiles.push({ ...devices['iPad Pro 11'], name: 'ipad' });
    for (const { name, ...settings } of profiles) {
      const context = await browser.newContext({ ...settings, colorScheme: 'dark', reducedMotion: 'no-preference' });
      try {
        await context.route('**/*', async (route) => {
          if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
          // Keep the external reset's sizing contract while isolating CDN/fonts.
          if (route.request().resourceType() === 'stylesheet') {
            return route.fulfill({ status: 200, contentType: 'text/css', body: '*,*::before,*::after{box-sizing:border-box}body{margin:0;}' });
          }
          return route.fulfill({ status: 204, body: '' });
        });
        for (const spec of cases) await verifyPage(context, spec, baseURL, name);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await server?.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
