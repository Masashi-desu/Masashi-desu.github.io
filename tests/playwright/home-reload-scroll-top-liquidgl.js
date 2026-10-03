/**
 * テスト概要:
 *  - 目的: ホームを途中までスクロールした状態でリロードしても、トップへ戻り LiquidGL のセグメントエフェクトが適用されることを検証する。
 *  - 期待値: reload 後の scrollY が 0px 付近で、home nav track が opacity 1、かつ LiquidGL renderer に texture が作成されている。
 *  - 検証方法: ローカル静的サーバーで /index.html を開き、iPhone 幅の Chromium context で一画面分スクロールしてから reload し、scrollY と LiquidGL 状態を取得する。
 */
const { startServer } = require('./support/static-server');
const { chromium, devices } = require('playwright');

const MOBILE_VIEWPORT = { width: 393, height: 852 };
const SCROLL_TOLERANCE = 2;

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch();

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
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      window.scrollTo(0, Math.round(window.innerHeight));
    });
    await page.waitForTimeout(300);

    const beforeReloadScrollY = await page.evaluate(() => Math.round(window.scrollY));
    if (beforeReloadScrollY <= SCROLL_TOLERANCE) {
      throw new Error(`Expected page to be scrolled before reload, got ${beforeReloadScrollY}px`);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1400);

    const state = await page.evaluate(() => {
      const nav = document.querySelector('.home-section-nav__track');
      const style = nav ? getComputedStyle(nav) : null;
      return {
        scrollY: Math.round(window.scrollY),
        navOpacity: style ? Number(style.opacity) : null,
        navClassName: nav ? nav.className : null,
        hasTexture: !!(window.__liquidGLRenderer__ && window.__liquidGLRenderer__.texture)
      };
    });

    if (state.scrollY > SCROLL_TOLERANCE) {
      throw new Error(`Expected home reload to reset scroll to top: ${JSON.stringify(state)}`);
    }
    if (state.navOpacity < 0.95 || !state.hasTexture || /is-liquidgl-fallback/.test(state.navClassName || '')) {
      throw new Error(`Expected LiquidGL segment effect after home reload: ${JSON.stringify(state)}`);
    }

    console.log('Home reload resets to top and keeps LiquidGL segment effect.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
