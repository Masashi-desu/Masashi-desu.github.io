/**
 * テスト概要:
 *  - 目的: 連続したページ移動で入場／退場アニメーションのイベントが各ページに発火することを確認する。
 *  - 期待値: ホーム、製品一覧、製品詳細の遷移ごとに enter-start と enter-complete が記録される。
 *  - 検証方法: motion を no-preference に固定した Chromium でリンクを順に操作し、各遷移後のカスタムイベント記録を最大10秒待って検証する。
 */
const { HomePage } = require('./pages/home-page');
const { CatalogPage } = require('./pages/catalog-page');
const { ProductPage } = require('./pages/product-page');
const { installFixtureFetch } = require('./support/fixture-fetch');
const path = require('path');
const { chromium } = require('playwright');

const TRANSITION_EVENT_TIMEOUT_MS = 10000;

async function waitForEnter(page, description) {
  await page.waitForFunction(() => {
    const events = window.__transitionEvents || [];
    return events.some((entry) => entry.type === 'enter-start');
  }, null, { timeout: TRANSITION_EVENT_TIMEOUT_MS });

  try {
    await page.waitForFunction(() => {
      const events = window.__transitionEvents || [];
      return events.some((entry) => entry.type === 'enter-complete');
    }, null, { timeout: TRANSITION_EVENT_TIMEOUT_MS });
  } catch (error) {
    throw new Error(`Missing enter complete event after ${description}: ${error.message}`);
  }
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'no-preference'
  });

  await installFixtureFetch(context);

  await context.addInitScript(() => {
    window.__transitionEvents = [];
    const record = (type, event) => {
      const detail = event?.detail || {};
      window.__transitionEvents.push({
        page: window.location.pathname,
        type,
        direction: detail.direction || null,
        timestamp: performance.now()
      });
    };
    window.addEventListener('mdw:transition-exit-start', (event) => record('exit-start', event));
    window.addEventListener('mdw:transition-exit-complete', (event) => record('exit-complete', event));
    window.addEventListener('mdw:transition-enter-start', (event) => record('enter-start', event));
    window.addEventListener('mdw:transition-enter-complete', (event) => record('enter-complete', event));

  });
  const page = await context.newPage();
  const home = new HomePage(page);
  const catalog = new CatalogPage(page);
  const product = new ProductPage(page);
  const indexPath = path.resolve(__dirname, '../../site/index.html');
  await page.goto(`file://${indexPath}`);

  // Navigate to products (rightward exit expected -> leftward entrance)
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    home.openCatalog()
  ]);
  await waitForEnter(page, 'navigating to products');

  // Navigate quickly to first internal product card (another rightward exit)
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    catalog.openFirstProduct()
  ]);
  await waitForEnter(page, 'navigating to product detail');

  // Immediate back navigation via left-arrow link (leftward exit -> rightward entrance)
  await product.backlink.waitFor({ state: 'visible' });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    product.returnToSource()
  ]);
  await waitForEnter(page, 'returning to products');

  await browser.close();
  // eslint-disable-next-line no-console
  console.log('Page transition animations triggered successfully for consecutive navigations.');
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
