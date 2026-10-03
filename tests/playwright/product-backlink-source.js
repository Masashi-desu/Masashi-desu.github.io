/**
 *  - 目的: ホームまたは製品一覧から製品詳細へ遷移したとき、詳細ページの戻りリンクが遷移元に応じて切り替わることを検証する。
 *  - 期待値: ホーム経由は `?from=home` と「ホームに戻る」、一覧経由は `?from=catalog` と「一覧に戻る」を使う。
 *  - 検証方法: file:// でトップ/一覧を開き、fetch を差し替えて製品カードを生成したうえで内部詳細リンクと戻りリンクの href/text を取得する。
 */
const { HomePage } = require('./pages/home-page');
const { CatalogPage } = require('./pages/catalog-page');
const { ProductPage } = require('./pages/product-page');
const { installFixtureFetch } = require('./support/fixture-fetch');
const path = require('path');
const { chromium } = require('playwright');


function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const SOURCES = [
  { source: 'home', Model: HomePage, entry: 'index.html', backlink: '/site/index.html#products-section', label: '← ホームに戻る' },
  { source: 'catalog', Model: CatalogPage, entry: 'products/index.html', backlink: '/site/products/index.html', label: '← 一覧に戻る' }
];

async function verifySource(context, { source, Model, entry, backlink, label }) {
  const page = await context.newPage();
  try {
    const origin = new Model(page);
    const detail = new ProductPage(page);
    await page.goto(`file://${path.resolve(__dirname, '../../site', entry)}`);
    const link = origin.productLink('RetreatScreen', source);
    await link.waitFor({ state: 'visible' });
    const href = await link.getAttribute('href');
    assert(href && href.includes(`?from=${source}`), `Expected ${source} product link to include source, got ${href}`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      origin.openProduct('RetreatScreen', source)
    ]);
    const state = await detail.readBacklink();
    assert(state.pathname.endsWith('/site/products/RetreatScreen/index.html'), `Expected RetreatScreen detail page, got ${state.pathname}`);
    assert(state.search === `?from=${source}`, `Expected from=${source} on detail URL, got ${state.search}`);
    assert(state.href.endsWith(backlink), `Expected ${source} backlink, got ${state.href}`);
    assert(state.text === label, `Expected ${source} backlink label, got ${state.text}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await installFixtureFetch(context);

  try {
    for (const source of SOURCES) await verifySource(context, source);
  } finally {
    await browser.close();
  }

  // eslint-disable-next-line no-console
  console.log('Product detail back links switch by navigation source.');
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
