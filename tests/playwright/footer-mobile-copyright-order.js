/**
 * テスト概要:
 *  - 目的: 共通 footer を取り込むページのスマホ表示で、コピーライトが footer controls より下に表示され、重複しないことを確認する。
 *  - 期待値: iPhone 幅の viewport で .site-footer__shared が column 方向となり、.site-footer__copyright は .site-footer__actions の下に 1 回だけ表示される。
 *  - 検証方法: ローカル静的サーバーで主要ページを配信し、Playwright の Chromium mobile context で footer partial 読み込み後の矩形と DOM 件数を取得する。
 */
const { FooterControls } = require('./components/footer-controls');
const { startServer } = require('./support/static-server');
const { chromium, devices } = require('playwright');

const MOBILE_VIEWPORT = { width: 393, height: 852 };
const PAGES = [
  '/',
  '/products/index.html',
  '/products/Bartical/index.html',
  '/products/TypeFetch/index.html',
  '/products/WinKinesis/index.html',
  '/products/Surround1x0-AKDK/index.html',
  '/products/RetreatScreen/privacy.html',
  '/products/RetreatScreen/support.html',
  '/products/RetreatScreen/index.html'
];

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
      await route.fulfill({ status: 204, body: '' });
    });
    await context.addInitScript(() => {
      window.__mdwFooterLoadCount = 0;
      window.addEventListener('mdw:footer-loaded', () => {
        window.__mdwFooterLoadCount += 1;
      });
      try {
        localStorage.setItem('mdw-theme', 'dark');
        localStorage.setItem('mdw-lang', 'ja');
      } catch (error) {
        // ignore storage write errors
      }
    });

    for (const pathname of PAGES) {
      const page = await context.newPage();
      const footer = new FooterControls(page);
      await page.goto(`http://127.0.0.1:${port}${pathname}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__mdwFooterLoadCount >= 1, null, { timeout: 10000 });
      await footer.copyright.waitFor({ state: 'visible', timeout: 5000 });
      const state = await footer.readMobileOrder();
      await page.close();

      if (
        state.copyrightCount !== 1 ||
        state.copyrightText !== '© 2026 Masahi_desu' ||
        state.flexDirection !== 'column' ||
        state.copyrightTop <= state.actionsBottom
      ) {
        throw new Error(`Footer copyright order failed on ${pathname}: ${JSON.stringify(state)}`);
      }
    }

    console.log('Footer copyright appears once below controls on mobile pages.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
