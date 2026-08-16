/**
 * テスト概要:
 *  - 目的: ホームの Product セクションで、低い横長 viewport や小さいスマホ幅でも
 *    右下の「プロダクト一覧」CTA と carousel カードが画面外へはみ出さず、縦長 viewport でも
 *    CTA がカード群から不自然に分断されず、セクション内のコンテンツが縦中央に配置されることを確認する。
 *  - 期待値: document/body に横スクロールが発生せず、CTA は viewport 内かつ carousel より下に表示され、
 *    表示中カードの下端は carousel のクリップ領域内に収まり、carousel と CTA の間隔は
 *    viewport 高に対して過大にならない。幅 36rem 以下ではコンテンツ上下の余白差が 2px 以内になる。
 *    BarticalカードはIcon Composerから書き出した256pxの正式アプリアイコンをCSS filterなしで表示し、
 *    圧縮済みMP4をミュート・インライン・自動ループで再生して、既存のスクリーンショットをposterとして使う。
 *    Barticalの映像はすべてのviewportで上端を基準に切り抜く。
 *  - 検証方法: ローカル静的サーバーでトップページを配信し、Playwright の Chromium context で
 *    複数 viewport に切り替えながら Product セクションへ移動し、DOMRect、scrollWidth、Barticalアイコンの実体とcomputed styleを取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const OVERFLOW_TOLERANCE = 1;
const MAX_CAROUSEL_CTA_GAP_RATIO = 0.045;
const MOBILE_VERTICAL_CENTER_TOLERANCE = 2;
const RESET_CSS = `
  *,*::before,*::after{box-sizing:border-box}
  *{margin:0}
  body{margin:0;line-height:1.5;-webkit-font-smoothing:antialiased}
  img,picture,video,canvas,svg{display:block;max-width:100%}
  button,input,textarea,select{font:inherit}
  p,h1,h2,h3,h4,h5,h6{overflow-wrap:break-word}
`;
const VIEWPORTS = [
  { width: 1205, height: 1323, name: 'tall-browser-comment' },
  { width: 1282, height: 619, name: 'browser-comment' },
  { width: 1280, height: 545, name: 'desktop-short-boundary' },
  { width: 852, height: 393, name: 'phone-landscape' },
  { width: 667, height: 375, name: 'small-landscape' },
  { width: 444, height: 994, name: 'browser-comment-mobile' },
  { width: 393, height: 852, name: 'phone-portrait' },
  { width: 320, height: 568, name: 'narrow-phone' },
  { width: 393, height: 852, name: 'reduced-motion', reducedMotion: 'reduce' }
];

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
      '.webp': 'image/webp',
      '.mp4': 'video/mp4'
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

function assertRectWithinViewport(rect, viewport, label) {
  if (
    rect.left < -OVERFLOW_TOLERANCE ||
    rect.top < -OVERFLOW_TOLERANCE ||
    rect.right > viewport.width + OVERFLOW_TOLERANCE ||
    rect.bottom > viewport.height + OVERFLOW_TOLERANCE
  ) {
    throw new Error(`${label} exceeded viewport: ${JSON.stringify({ rect, viewport })}`);
  }
}

async function getProductLayoutState(page) {
  return page.evaluate(() => {
    const roundRect = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Number(rect.left.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2))
      };
    };
    const grid = document.querySelector('.home-product-grid');
    const gridRect = roundRect(grid);
    const visibleCards = Array.from(document.querySelectorAll('.home-product-card'))
      .map(roundRect)
      .filter((rect) => rect.right > gridRect.left + 8 && rect.left < gridRect.right - 8);
    const barticalIcon = document.querySelector('.home-product-card[href*="products/Bartical/"] .home-product-card__icon');
    const barticalVideo = document.querySelector('.home-product-card[href*="products/Bartical/"] .home-product-card__media-video');
    const barticalVideoStyle = barticalVideo ? getComputedStyle(barticalVideo) : null;

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scroll: {
        clientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      },
      sectionRect: roundRect(document.getElementById('products-section')),
      productsRect: roundRect(document.querySelector('.home-products')),
      headerRect: roundRect(document.querySelector('.home-products__header')),
      gridRect,
      footerRect: roundRect(document.querySelector('.home-products__footer')),
      ctaRect: roundRect(document.querySelector('.home-products__all-link')),
      visibleCards,
      barticalIcon: barticalIcon ? {
        src: barticalIcon.getAttribute('src'),
        naturalWidth: barticalIcon.naturalWidth,
        naturalHeight: barticalIcon.naturalHeight,
        filter: getComputedStyle(barticalIcon).filter
      } : null,
      barticalVideo: barticalVideo ? {
        src: barticalVideo.getAttribute('src'),
        poster: barticalVideo.getAttribute('poster'),
        muted: barticalVideo.muted,
        loop: barticalVideo.loop,
        autoplay: barticalVideo.autoplay,
        playsInline: barticalVideo.playsInline,
        controls: barticalVideo.controls,
        paused: barticalVideo.paused,
        readyState: barticalVideo.readyState,
        videoWidth: barticalVideo.videoWidth,
        videoHeight: barticalVideo.videoHeight,
        objectPosition: barticalVideoStyle.objectPosition
      } : null,
      reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
    };
  });
}

async function assertProductsFitAtViewport(browser, serverPort, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'dark',
    reducedMotion: viewport.reducedMotion || 'no-preference',
    isMobile: viewport.width < 700,
    hasTouch: viewport.width < 900
  });

  try {
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
          body: RESET_CSS
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
    await page.goto(`http://127.0.0.1:${serverPort}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.click('[data-section-target="products-section"]');
    await page.waitForSelector('.home-product-track');
    await page.waitForFunction(() => {
      const section = document.getElementById('products-section');
      return section && Math.abs(section.getBoundingClientRect().top) <= 2;
    });
    await page.waitForTimeout(1000);

    const state = await getProductLayoutState(page);
    const maxAllowedWidth = state.scroll.clientWidth + OVERFLOW_TOLERANCE;
    if (
      state.scroll.documentScrollWidth > maxAllowedWidth ||
      state.scroll.bodyScrollWidth > maxAllowedWidth
    ) {
      throw new Error(`Home products layout overflowed horizontally (${viewport.name}): ${JSON.stringify(state)}`);
    }
    if (state.visibleCards.length < 1) {
      throw new Error(`Expected at least one visible product card (${viewport.name}): ${JSON.stringify(state)}`);
    }
    if (
      state.barticalIcon?.src !== 'products/Bartical/BarticalAppIcon.png'
      || state.barticalIcon.naturalWidth !== 256
      || state.barticalIcon.naturalHeight !== 256
      || state.barticalIcon.filter !== 'none'
    ) {
      throw new Error(`Bartical card did not use the unmodified Icon Composer export (${viewport.name}): ${JSON.stringify(state.barticalIcon)}`);
    }
    if (
      state.barticalVideo?.src !== 'products/Bartical/BarticalCardDemo.mp4'
      || state.barticalVideo.poster !== 'products/Bartical/screenshot.png'
      || !state.barticalVideo.muted
      || !state.barticalVideo.loop
      || state.barticalVideo.autoplay === state.reduceMotion
      || !state.barticalVideo.playsInline
      || state.barticalVideo.controls
      || state.barticalVideo.readyState < 1
      || state.barticalVideo.videoWidth !== 640
      || state.barticalVideo.videoHeight !== 388
      || state.barticalVideo.objectPosition !== '50% 0%'
      || (state.reduceMotion && !state.barticalVideo.paused)
    ) {
      throw new Error(`Bartical card did not use the compressed loop video (${viewport.name}): ${JSON.stringify(state.barticalVideo)}`);
    }

    assertRectWithinViewport(state.productsRect, state.viewport, `Product layout (${viewport.name})`);
    assertRectWithinViewport(state.ctaRect, state.viewport, `Product CTA (${viewport.name})`);
    if (state.ctaRect.top < state.gridRect.bottom - OVERFLOW_TOLERANCE) {
      throw new Error(`Product CTA overlapped carousel (${viewport.name}): ${JSON.stringify(state)}`);
    }
    const carouselCtaGap = state.ctaRect.top - state.gridRect.bottom;
    const maxCarouselCtaGap = Math.max(32, state.viewport.height * MAX_CAROUSEL_CTA_GAP_RATIO);
    if (carouselCtaGap > maxCarouselCtaGap) {
      throw new Error(`Product CTA was separated too far from carousel (${viewport.name}): ${JSON.stringify({ carouselCtaGap, maxCarouselCtaGap, state })}`);
    }

    if (state.viewport.width <= 576) {
      const contentTopGap = state.headerRect.top - state.productsRect.top;
      const contentBottomGap = state.productsRect.bottom - state.footerRect.bottom;
      const verticalCenterOffset = Math.abs(contentTopGap - contentBottomGap);
      if (verticalCenterOffset > MOBILE_VERTICAL_CENTER_TOLERANCE) {
        throw new Error(`Product content was not vertically centered (${viewport.name}): ${JSON.stringify({ contentTopGap, contentBottomGap, verticalCenterOffset, state })}`);
      }
    }

    const clippedCard = state.visibleCards.find((rect) => rect.bottom > state.gridRect.bottom + OVERFLOW_TOLERANCE);
    if (clippedCard) {
      throw new Error(`Visible product card exceeded carousel clip area (${viewport.name}): ${JSON.stringify({ clippedCard, state })}`);
    }
  } finally {
    await context.close();
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch();

  try {
    for (const viewport of VIEWPORTS) {
      await assertProductsFitAtViewport(browser, port, viewport);
    }
    console.log('Home products responsive layout stays within the viewport.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
