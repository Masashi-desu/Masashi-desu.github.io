/**
 *  - 目的: ホームまたは製品一覧から製品詳細へ遷移したとき、詳細ページの戻りリンクが遷移元に応じて切り替わることを検証する。
 *  - 期待値: ホーム経由は `?from=home` と「ホームに戻る」、一覧経由は `?from=catalog` と「一覧に戻る」を使う。
 *  - 検証方法: file:// でトップ/一覧を開き、fetch を差し替えて製品カードを生成したうえで内部詳細リンクと戻りリンクの href/text を取得する。
 */
const path = require('path');
const { chromium } = require('playwright');

const productData = require(path.resolve(__dirname, '../../site/products/index.json'));
const footerMarkup = '<footer data-test="injected">Playwright Footer</footer>';

async function installFixtureFetch(context) {
  await context.addInitScript(({ data, footer }) => {
    const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    const normalizeUrl = (input) => {
      if (!input) {
        return '';
      }
      if (typeof input === 'string') {
        return input;
      }
      if (typeof input === 'object' && 'url' in input) {
        return input.url;
      }
      return '';
    };

    window.fetch = async (input, init) => {
      const url = normalizeUrl(input);
      if (/index\.json($|\?)/.test(url)) {
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('partials/footer.html')) {
        return new Response(footer, {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        });
      }
      if (originalFetch) {
        return originalFetch(input, init);
      }
      throw new Error('Fetch not supported in this environment');
    };
  }, { data: productData, footer: footerMarkup });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function inspectBacklink(page) {
  return page.evaluate(() => {
    const link = document.querySelector('[data-product-backlink]');
    return {
      href: link ? link.href : '',
      text: link ? link.textContent.trim() : '',
      search: window.location.search,
      pathname: window.location.pathname,
      hash: window.location.hash
    };
  });
}

async function verifyHomeSource(context) {
  const page = await context.newPage();
  const indexPath = path.resolve(__dirname, '../../site/index.html');
  await page.goto(`file://${indexPath}`);
  await page.waitForSelector('.home-product-card[href*="RetreatScreen"][href*="from=home"]');

  const detailHref = await page.locator('.home-product-card[href*="RetreatScreen"][href*="from=home"]').first().getAttribute('href');
  assert(detailHref && detailHref.includes('?from=home'), `Expected home product link to include from=home, got ${detailHref}`);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.locator('.home-product-card[href*="RetreatScreen"][href*="from=home"]').first().click()
  ]);

  const state = await inspectBacklink(page);
  assert(state.pathname.endsWith('/site/products/RetreatScreen/index.html'), `Expected RetreatScreen detail page, got ${state.pathname}`);
  assert(state.search === '?from=home', `Expected from=home on detail URL, got ${state.search}`);
  assert(state.href.endsWith('/site/index.html#products-section'), `Expected backlink to home products section, got ${state.href}`);
  assert(state.text === '← ホームに戻る', `Expected home backlink label, got ${state.text}`);

  await page.close();
}

async function verifyCatalogSource(context) {
  const page = await context.newPage();
  const catalogPath = path.resolve(__dirname, '../../site/products/index.html');
  await page.goto(`file://${catalogPath}`);
  await page.waitForSelector('#product-grid a[href*="RetreatScreen"][href*="from=catalog"]');

  const detailHref = await page.locator('#product-grid a[href*="RetreatScreen"][href*="from=catalog"]').first().getAttribute('href');
  assert(detailHref && detailHref.includes('?from=catalog'), `Expected catalog product link to include from=catalog, got ${detailHref}`);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.locator('#product-grid a[href*="RetreatScreen"][href*="from=catalog"]').first().click()
  ]);

  const state = await inspectBacklink(page);
  assert(state.pathname.endsWith('/site/products/RetreatScreen/index.html'), `Expected RetreatScreen detail page, got ${state.pathname}`);
  assert(state.search === '?from=catalog', `Expected from=catalog on detail URL, got ${state.search}`);
  assert(state.href.endsWith('/site/products/index.html'), `Expected backlink to catalog, got ${state.href}`);
  assert(state.text === '← 一覧に戻る', `Expected catalog backlink label, got ${state.text}`);

  await page.close();
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await installFixtureFetch(context);

  try {
    await verifyHomeSource(context);
    await verifyCatalogSource(context);
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
