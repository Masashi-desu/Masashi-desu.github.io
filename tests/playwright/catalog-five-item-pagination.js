/**
 * テスト概要:
 *  - 目的: 製品一覧が全件を同時描画せず5件単位でページ切り替えし、アニメーション背景をLiquidGLのリアルタイム動画経路へ渡すことを確認する。
 *  - 期待値: 6件中1ページ目は1〜5の5section、2ページ目は6のみを描画する。前後ボタン・現在ページ・全体通番が同期し、最後の通番タブのfocus ringは横スクロール領域内でクリップしない。Bartical、TypeFetch、WinKinesis背景はposter付きMP4をミュート・ループ・インライン再生する。Bartical背景は画面比率にかかわらず上端を基準に切り抜く。LiquidGLセグメントは暗色tintで動画の明部を抑え、検索sectionとの切替を640ms linearで補間する。DOM差し替え後は除去済み動画を破棄して、1ページ目へ戻したときに新しいvideo要素を再検出する。
 *  - 検証方法: ローカル静的サーバーで /products/ をChromiumまたはWebKitに開き、DOM数、ナビ番号、ページ状態、動画属性とLiquidGL rendererの動画一覧を取得する。viewport変更後、実際のrefreshを維持したspyを使って前後ページを操作し、rendererが現在のDOMだけを追跡することを確認する。codec・GPU・実時間に依存する動画frame更新はmacOS専用のnative-media-liquidgl.jsで検証する。
 */
const { CatalogPage } = require('./pages/catalog-page');
const { startServer } = require('./support/static-server');
const { chromium, webkit } = require('playwright');

const BROWSER_NAME = process.env.CATALOG_BROWSER || 'chromium';
const BROWSER_TYPES = { chromium, webkit };

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `: ${JSON.stringify(details)}` : ''}`);
  }
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
    const catalog = new CatalogPage(page);
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
    await page.waitForFunction(() => {
      const videos = Array.from(document.querySelectorAll('.catalog-product-section__video'));
      const renderer = window.__liquidGLRenderer__;
      return videos.length === 3
        && renderer?._videoNodes?.length === 3
        && videos.every((video) => renderer._videoNodes.includes(video));
    }, null, { timeout: 15000 });

    const firstPage = await catalog.readPaginationState();
    assert(firstPage.sectionIds.length === 5, 'First page did not render exactly five products', firstPage);
    assert(JSON.stringify(firstPage.productIndexes) === JSON.stringify(['0', '1', '2', '3', '4']), 'First page indexes were incorrect', firstPage);
    assert(JSON.stringify(firstPage.navNumbers) === JSON.stringify(['1', '2', '3', '4', '5']), 'First page nav did not show global numbers 1–5', firstPage);
    await catalog.numberTabs.last().focus();
    const focusedNumberOutline = await page.evaluate(() => {
      const number = document.querySelector('.catalog-section-nav__number:focus');
      const style = number ? getComputedStyle(number) : null;
      return {
        outlineOffset: style?.outlineOffset,
        outlineWidth: style?.outlineWidth,
        outlineStyle: style?.outlineStyle
      };
    });
    assert(
      focusedNumberOutline.outlineOffset === '-2px'
        && focusedNumberOutline.outlineWidth === '2px'
        && focusedNumberOutline.outlineStyle === 'solid',
      'Last catalog number focus ring was not kept inside the scroll container',
      focusedNumberOutline
    );
    assert(firstPage.page === '1' && firstPage.pageLabel === '1 / 2', 'First page status was incorrect', firstPage);
    assert(firstPage.prevDisabled && !firstPage.nextDisabled, 'First page controls were incorrect', firstPage);
    assert(firstPage.count === '5件表示 / 全6件', 'First page result count was incorrect', firstPage);
    const expectedVideoSources = [
      'Bartical/BarticalCardDemo.mp4',
      'TypeFetch/TypeFetchCatalog.mp4',
      'WinKinesis/winkinesis.mp4'
    ];
    assert(
      JSON.stringify(firstPage.catalogVideoSources) === JSON.stringify(expectedVideoSources)
        && JSON.stringify(firstPage.liquidDynamicVideoSources) === JSON.stringify(expectedVideoSources),
      'Catalog animation backgrounds were not registered with the LiquidGL video compositor',
      firstPage
    );
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
      firstPage.video?.objectPosition === '50% 0%'
        && Math.abs(firstPage.video.topEdgeOffset) < 0.1,
      'Bartical catalog background was not anchored to its top edge',
      firstPage.video
    );
    assert(
      firstPage.catalogNavGlassTone === 'surface'
        && firstPage.catalogNavGlassTint === 'rgba(5, 4, 14, 0.62)',
      'Catalog LiquidGL segment did not follow the initial dark theme',
      {
        tone: firstPage.catalogNavGlassTone,
        tint: firstPage.catalogNavGlassTint
      }
    );
    assert(
      firstPage.catalogNavGlassTransition?.property === 'background-color'
        && firstPage.catalogNavGlassTransition.duration === '0.64s'
        && firstPage.catalogNavGlassTransition.timingFunction === 'linear',
      'Catalog LiquidGL tint did not use the gradual color transition',
      firstPage.catalogNavGlassTransition
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

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await page.waitForFunction(() => {
      const track = document.querySelector('.catalog-section-nav__track');
      return track?.dataset.glassTone === 'surface'
        && getComputedStyle(track, '::before').backgroundColor === 'rgba(255, 253, 247, 0.28)';
    });
    await catalog.showProduct('catalog-product-bartical');
    await page.waitForFunction(() => {
      const track = document.querySelector('.catalog-section-nav__track');
      return track?.dataset.glassTone === 'dark'
        && getComputedStyle(track, '::before').backgroundColor === 'rgba(5, 4, 14, 0.62)';
    });
    const lightThemeProductState = await catalog.readPaginationState();
    assert(
      lightThemeProductState.catalogNavGlassTone === 'dark'
        && lightThemeProductState.catalogNavGlassTint === 'rgba(5, 4, 14, 0.62)',
      'Catalog LiquidGL segment stayed bright over a product in the light theme',
      {
        tone: lightThemeProductState.catalogNavGlassTone,
        tint: lightThemeProductState.catalogNavGlassTint
      }
    );
    await catalog.showPagination();
    await page.waitForFunction(() => {
      const track = document.querySelector('.catalog-section-nav__track');
      const pagination = document.getElementById('catalog-pagination-nav');
      return pagination?.classList.contains('is-active')
        && track?.dataset.glassTone === 'dark'
        && getComputedStyle(track, '::before').backgroundColor === 'rgba(5, 4, 14, 0.62)';
    });
    const lightThemePaginationState = await catalog.readPaginationState();
    assert(
      lightThemePaginationState.catalogNavGlassTone === 'dark'
        && lightThemePaginationState.catalogNavGlassTint === 'rgba(5, 4, 14, 0.62)',
      'Catalog LiquidGL segment became bright at the pagination stop',
      {
        tone: lightThemePaginationState.catalogNavGlassTone,
        tint: lightThemePaginationState.catalogNavGlassTint
      }
    );
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });

    for (const viewport of [
      { width: 1278, height: 619 },
      { width: 573, height: 550 }
    ]) {
      await page.setViewportSize(viewport);
      const responsiveState = await catalog.readPaginationState();
      assert(
        responsiveState.video?.objectPosition === '50% 0%'
          && Math.abs(responsiveState.video.topEdgeOffset) < 0.1,
        'Bartical catalog background lost its top alignment after a viewport change',
        { viewport, video: responsiveState.video }
      );
    }
    await page.setViewportSize({ width: 1372, height: 994 });

    await page.evaluate(() => {
      if (!window.MDWLiquidGL || typeof window.MDWLiquidGL.refresh !== 'function') {
        throw new Error('LiquidGL refresh API was unavailable.');
      }
      const originalRefresh = window.MDWLiquidGL.refresh.bind(window.MDWLiquidGL);
      window.__catalogLiquidRefreshCalls = [];
      window.MDWLiquidGL.refresh = (delay) => {
        window.__catalogLiquidRefreshCalls.push(delay);
        return originalRefresh(delay);
      };
    });

    await catalog.nextPage();
    await page.waitForFunction(() => {
      const sections = document.querySelectorAll('[data-catalog-section="product"]');
      return sections.length === 1 && sections[0].dataset.productIndex === '5';
    });
    await page.waitForFunction(() => {
      const image = document.querySelector('#catalog-product-surround1x0-akdk .catalog-product-section__image');
      return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    });
    await page.waitForFunction(() => window.__liquidGLRenderer__?._videoNodes?.length === 0);
    await page.waitForLoadState('networkidle');
    const secondPage = await catalog.readPaginationState();
    assert(secondPage.sectionIds.length === 1, 'Second page did not render only the remaining product', secondPage);
    assert(JSON.stringify(secondPage.navNumbers) === JSON.stringify(['6']), 'Second page nav did not preserve global number 6', secondPage);
    assert(secondPage.indexLabels[0] === '06 / 06', 'Second page product counter was incorrect', secondPage);
    assert(secondPage.page === '2' && secondPage.pageLabel === '2 / 2', 'Second page status was incorrect', secondPage);
    assert(!secondPage.prevDisabled && secondPage.nextDisabled, 'Second page controls were incorrect', secondPage);
    assert(secondPage.count === '1件表示 / 全6件', 'Second page result count was incorrect', secondPage);
    assert(
      secondPage.catalogVideoSources.length === 0 && secondPage.liquidDynamicVideoSources.length === 0,
      'LiquidGL retained videos removed with page one',
      secondPage
    );
    assert(
      JSON.stringify(secondPage.liquidRefreshCalls) === JSON.stringify([0]),
      'LiquidGL did not refresh immediately after rendering page two',
      secondPage
    );

    await catalog.previousPage();
    await page.waitForFunction(() => document.querySelectorAll('[data-catalog-section="product"]').length === 5);
    await page.waitForFunction(() => {
      const videos = Array.from(document.querySelectorAll('.catalog-product-section__video'));
      const renderer = window.__liquidGLRenderer__;
      return videos.length === 3
        && renderer?._videoNodes?.length === 3
        && videos.every((video) => renderer._videoNodes.includes(video));
    });
    const restoredPage = await catalog.readPaginationState();
    assert(restoredPage.page === '1' && restoredPage.prevDisabled && !restoredPage.nextDisabled, 'Previous page did not restore page one', restoredPage);
    assert(
      JSON.stringify(restoredPage.liquidRefreshCalls) === JSON.stringify([0, 0]),
      'LiquidGL did not refresh after restoring page one',
      restoredPage
    );
    assert(
      JSON.stringify(restoredPage.liquidDynamicVideoSources) === JSON.stringify(expectedVideoSources),
      'LiquidGL did not detect the replacement video elements after restoring page one',
      restoredPage
    );

    await catalog.filterCategory('MacApp');
    await page.waitForFunction(() => document.querySelectorAll('[data-catalog-section="product"]').length === 4);
    const filteredPage = await catalog.readPaginationState();
    assert(filteredPage.page === '1' && filteredPage.prevDisabled && filteredPage.nextDisabled, 'Filtering did not reset and clamp pagination', filteredPage);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const video = document.querySelector('#catalog-product-bartical .catalog-product-section__video');
      return video && !video.autoplay && video.paused;
    });
    const reducedMotionTintTransition = await page.evaluate(() => {
      const track = document.querySelector('.catalog-section-nav__track');
      return track ? getComputedStyle(track, '::before').transitionDuration : null;
    });
    assert(
      reducedMotionTintTransition === '0s',
      'Catalog LiquidGL tint transition did not respect reduced motion',
      reducedMotionTintTransition
    );

    assert(pageErrors.length === 0, 'Page errors were reported', pageErrors);
    assert(consoleErrors.length === 0, 'Console errors were reported', consoleErrors);
    console.log(`Catalog paginates five products and registers three videos with LiquidGL in ${BROWSER_NAME}.`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
