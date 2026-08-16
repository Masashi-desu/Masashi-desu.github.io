/**
 * テスト概要:
 *  - 目的: 製品一覧が全件を同時描画せず5件単位でページ切り替えし、Bartical一覧背景にホームカードと同じ動画を使うことを確認する。
 *  - 期待値: 6件中1ページ目は1〜5の5section、2ページ目は6のみを描画する。前後ボタン・現在ページ・全体通番が同期し、Bartical背景はBarticalCardDemo.mp4をscreenshot.png poster付きでミュート・ループ・インライン再生する。2ページ目の実画像は読込完了後にページを戻し、画像取得を途中で中断しない。
 *  - 検証方法: ローカル静的サーバーで /products/ をChromiumまたはWebKitに開き、DOM数、ナビ番号、ページ状態、画像の読込完了、動画属性を取得して前後ボタンとカテゴリ変更を操作する。
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const BROWSER_NAME = process.env.CATALOG_BROWSER || 'chromium';
const BROWSER_TYPES = { chromium, webkit };

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `: ${JSON.stringify(details)}` : ''}`);
  }
}

function serveStatic(request, response) {
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(ROOT, relativePath);
  if (pathname.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    const contentTypes = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.mp4': 'video/mp4',
      '.png': 'image/png',
      '.svg': 'image/svg+xml; charset=utf-8'
    };
    response.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    response.end(data);
  });
}

function startServer() {
  const server = http.createServer(serveStatic);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function readState(page) {
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('[data-catalog-section="product"]'));
    const video = document.querySelector('#catalog-product-bartical .catalog-product-section__video');
    const barticalIcon = document.querySelector('#catalog-product-bartical .catalog-product-section__icon');
    const barticalIconStyle = barticalIcon ? getComputedStyle(barticalIcon) : null;
    const status = document.getElementById('catalog-pagination-status');
    const prev = document.getElementById('catalog-pagination-prev');
    const next = document.getElementById('catalog-pagination-next');
    return {
      sectionIds: sections.map((section) => section.id),
      productIndexes: sections.map((section) => section.dataset.productIndex),
      indexLabels: sections.map((section) => section.querySelector('.catalog-product-section__index')?.textContent.trim()),
      navNumbers: Array.from(document.querySelectorAll('.catalog-section-nav__number')).map((button) => button.textContent.trim()),
      page: status?.textContent.trim(),
      pageLabel: status?.getAttribute('aria-label'),
      prevDisabled: prev?.disabled,
      nextDisabled: next?.disabled,
      count: document.getElementById('product-count')?.textContent.trim(),
      video: video ? {
        src: video.getAttribute('src'),
        poster: video.getAttribute('poster'),
        muted: video.muted,
        loop: video.loop,
        autoplay: video.autoplay,
        playsInline: video.playsInline,
        disablePictureInPicture: video.hasAttribute('disablepictureinpicture'),
        disableRemotePlayback: video.hasAttribute('disableremoteplayback')
      } : null,
      barticalFallbackImageCount: document.querySelectorAll('#catalog-product-bartical .catalog-product-section__image').length,
      barticalIconStyle: barticalIconStyle ? {
        src: barticalIcon.getAttribute('src'),
        naturalWidth: barticalIcon.naturalWidth,
        naturalHeight: barticalIcon.naturalHeight,
        borderRadius: barticalIconStyle.borderRadius,
        boxShadow: barticalIconStyle.boxShadow,
        objectFit: barticalIconStyle.objectFit
      } : null
    };
  });
}

async function main() {
  const server = await startServer();
  const browserType = BROWSER_TYPES[BROWSER_NAME];
  assert(browserType, `Unsupported browser: ${BROWSER_NAME}`);
  const browser = await browserType.launch();
  const port = server.address().port;

  try {
    const context = await browser.newContext({
      viewport: { width: 1372, height: 994 },
      colorScheme: 'dark'
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') {
        await route.continue();
        return;
      }
      if (route.request().resourceType() === 'stylesheet') {
        await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });
    await context.addInitScript(() => {
      localStorage.setItem('mdw-theme', 'dark');
      localStorage.setItem('mdw-lang', 'ja');
    });

    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    await page.goto(`http://127.0.0.1:${port}/products/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('[data-catalog-section="product"]').length === 5);
    await page.waitForFunction(() => {
      const icon = document.querySelector('#catalog-product-bartical .catalog-product-section__icon');
      return icon?.complete && icon.naturalWidth === 222 && icon.naturalHeight === 222;
    });

    const firstPage = await readState(page);
    assert(firstPage.sectionIds.length === 5, 'First page did not render exactly five products', firstPage);
    assert(JSON.stringify(firstPage.productIndexes) === JSON.stringify(['0', '1', '2', '3', '4']), 'First page indexes were incorrect', firstPage);
    assert(JSON.stringify(firstPage.navNumbers) === JSON.stringify(['1', '2', '3', '4', '5']), 'First page nav did not show global numbers 1–5', firstPage);
    assert(firstPage.page === '1' && firstPage.pageLabel === '1 / 2', 'First page status was incorrect', firstPage);
    assert(firstPage.prevDisabled && !firstPage.nextDisabled, 'First page controls were incorrect', firstPage);
    assert(firstPage.count === '5件表示 / 全6件', 'First page result count was incorrect', firstPage);
    assert(
      firstPage.video?.src === 'Bartical/BarticalCardDemo.mp4'
        && firstPage.video.poster === 'Bartical/screenshot.png'
        && firstPage.video.muted
        && firstPage.video.loop
        && firstPage.video.autoplay
        && firstPage.video.playsInline
        && firstPage.video.disablePictureInPicture
        && firstPage.video.disableRemotePlayback
        && firstPage.barticalFallbackImageCount === 0,
      'Bartical catalog background did not use the same loop video as the home card',
      firstPage
    );
    assert(
      firstPage.barticalIconStyle?.src === 'Bartical/BarticalCatalogIcon.png'
        && firstPage.barticalIconStyle.naturalWidth === 222
        && firstPage.barticalIconStyle.naturalHeight === 222
        && firstPage.barticalIconStyle.borderRadius === '0px'
        && firstPage.barticalIconStyle.boxShadow === 'none'
        && firstPage.barticalIconStyle.objectFit === 'contain',
      'Bartical catalog icon did not use the tightly cropped official icon asset',
      firstPage.barticalIconStyle
    );

    await page.locator('#catalog-pagination-next').click();
    await page.waitForFunction(() => {
      const sections = document.querySelectorAll('[data-catalog-section="product"]');
      return sections.length === 1 && sections[0].dataset.productIndex === '5';
    });
    await page.waitForFunction(() => {
      const image = document.querySelector('#catalog-product-surround1x0-akdk .catalog-product-section__image');
      return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    });
    await page.waitForLoadState('networkidle');
    const secondPage = await readState(page);
    assert(secondPage.sectionIds.length === 1, 'Second page did not render only the remaining product', secondPage);
    assert(JSON.stringify(secondPage.navNumbers) === JSON.stringify(['6']), 'Second page nav did not preserve global number 6', secondPage);
    assert(secondPage.indexLabels[0] === '06 / 06', 'Second page product counter was incorrect', secondPage);
    assert(secondPage.page === '2' && secondPage.pageLabel === '2 / 2', 'Second page status was incorrect', secondPage);
    assert(!secondPage.prevDisabled && secondPage.nextDisabled, 'Second page controls were incorrect', secondPage);
    assert(secondPage.count === '1件表示 / 全6件', 'Second page result count was incorrect', secondPage);

    await page.locator('#catalog-pagination-prev').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-catalog-section="product"]').length === 5);
    const restoredPage = await readState(page);
    assert(restoredPage.page === '1' && restoredPage.prevDisabled && !restoredPage.nextDisabled, 'Previous page did not restore page one', restoredPage);

    await page.locator('#category-filter').selectOption('MacApp');
    await page.waitForFunction(() => document.querySelectorAll('[data-catalog-section="product"]').length === 4);
    const filteredPage = await readState(page);
    assert(filteredPage.page === '1' && filteredPage.prevDisabled && filteredPage.nextDisabled, 'Filtering did not reset and clamp pagination', filteredPage);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const video = document.querySelector('#catalog-product-bartical .catalog-product-section__video');
      return video && !video.autoplay && video.paused;
    });

    assert(pageErrors.length === 0, 'Page errors were reported', pageErrors);
    assert(consoleErrors.length === 0, 'Console errors were reported', consoleErrors);
    console.log(`Catalog renders five products per page and reuses the Bartical card video in ${BROWSER_NAME}.`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
