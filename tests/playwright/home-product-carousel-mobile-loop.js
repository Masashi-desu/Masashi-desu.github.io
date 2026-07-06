/**
 * テスト概要:
 *  - 目的: ホームのプロダクトカード carousel がスマホ表示で速くなりすぎず、手動の横スクロール操作にも反応し、自動移動・手動操作・viewport resize 後も途切れずにループすることを検証する。
 *  - 期待値: iPhone 幅で 1 周分の移動距離が隣接カードセット間隔と一致し、duration は距離ベースで 54s 以上、横スクロール可能で自動移動は scrollLeft で進み、操作中は一時停止し、ユーザー操作中にscrollLeftが巻き戻らず、両端付近ではカードセットが継ぎ足され、不要になった端のカードは破棄され、carousel領域は透明背景かつ通常時の影なし、viewport resize 後もカードが viewport 内に表示される。
 *  - 検証方法: ローカル静的サーバーでトップページを配信し、Playwright の Chromium/WebKit mobile context で CSS 変数・computed style・scrollLeft・カード矩形を計測する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, webkit, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const MIN_DURATION_SECONDS = 54;
const MAX_EXPECTED_CARD_SETS = 9;

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

async function getCarouselState(page) {
  return page.evaluate(() => {
    const grid = document.querySelector('.home-product-grid');
    const track = document.querySelector('.home-product-track');
    const firstClone = document.querySelector('.home-product-card--clone');
    const gridRect = grid.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const gridStyle = getComputedStyle(grid);
    const trackStyle = getComputedStyle(track);
    const firstCard = document.querySelector('.home-product-card:not(.home-product-card--clone)');
    const firstCardStyle = firstCard ? getComputedStyle(firstCard) : null;
    const setSize = Number.parseInt(gridStyle.getPropertyValue('--home-product-count'), 10);
    const cards = Array.from(document.querySelectorAll('.home-product-card'));
    const firstRepeatedSetDistance = Number.isFinite(setSize) && cards[0] && cards[setSize]
      ? cards[setSize].offsetLeft - cards[0].offsetLeft
      : null;
    const visibleCards = Array.from(document.querySelectorAll('.home-product-card')).filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.right > gridRect.left + 24 && rect.left < gridRect.right - 24;
    }).length;
    return {
      cardCount: document.querySelectorAll('.home-product-card').length,
      cloneCount: document.querySelectorAll('.home-product-card--clone').length,
      setSize,
      distance: Number.parseFloat(gridStyle.getPropertyValue('--home-product-distance')),
      duration: Number.parseFloat(gridStyle.getPropertyValue('--home-product-duration')),
      animationName: trackStyle.animationName,
      isUserScrolling: grid.classList.contains('is-user-scrolling'),
      gridBackgroundColor: gridStyle.backgroundColor,
      gridPaddingBottom: gridStyle.paddingBottom,
      trackBackgroundColor: trackStyle.backgroundColor,
      cardBoxShadow: firstCardStyle ? firstCardStyle.boxShadow : null,
      firstCloneOffsetLeft: firstClone ? firstClone.offsetLeft : null,
      firstRepeatedSetDistance,
      clientWidth: grid.clientWidth,
      scrollWidth: grid.scrollWidth,
      scrollLeft: Math.round(grid.scrollLeft),
      trackLeft: Number(trackRect.left.toFixed(2)),
      transform: trackStyle.transform,
      visibleCards
    };
  });
}

async function runCarouselAssertions(browserType, browserName, port) {
  const browser = await browserType.launch();
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
    await page.click('[data-section-target="products-section"]');
    await page.waitForSelector('.home-product-card--clone');
    await page.waitForTimeout(600);

    const initial = await getCarouselState(page);
    if (initial.cloneCount === 0 || initial.firstRepeatedSetDistance === null) {
      throw new Error(`Expected cloned product cards for looping: ${JSON.stringify(initial)}`);
    }
    if (Math.abs(initial.distance - initial.firstRepeatedSetDistance) > 1) {
      throw new Error(`Carousel distance should match adjacent set distance: ${JSON.stringify(initial)}`);
    }
    if (initial.duration < MIN_DURATION_SECONDS) {
      throw new Error(`Mobile carousel duration should not be faster than desktop baseline: ${JSON.stringify(initial)}`);
    }
    if (initial.animationName !== 'none' || initial.transform !== 'none') {
      throw new Error(`Expected carousel auto movement not to depend on CSS transform animation: ${JSON.stringify(initial)}`);
    }
    if (initial.visibleCards < 1) {
      throw new Error(`Expected at least one visible product card before loop: ${JSON.stringify(initial)}`);
    }
    if (initial.gridBackgroundColor !== 'rgba(0, 0, 0, 0)' || initial.trackBackgroundColor !== 'rgba(0, 0, 0, 0)') {
      throw new Error(`Expected carousel scroll area to keep the section background visible: ${JSON.stringify(initial)}`);
    }
    if (initial.gridPaddingBottom !== '0px' || initial.cardBoxShadow !== 'none') {
      throw new Error(`Expected carousel area not to create a tinted band below cards: ${JSON.stringify(initial)}`);
    }
    if (initial.scrollWidth <= initial.clientWidth) {
      throw new Error(`Expected product carousel to be horizontally scrollable: ${JSON.stringify(initial)}`);
    }
    if (initial.scrollLeft < initial.distance) {
      throw new Error(`Expected carousel to start with room for leftward manual scrolling: ${JSON.stringify(initial)}`);
    }
    const maxExpectedCards = initial.setSize * MAX_EXPECTED_CARD_SETS;

    await page.waitForTimeout(1250);
    const afterAutoScroll = await getCarouselState(page);
    if (afterAutoScroll.scrollLeft <= initial.scrollLeft + 12) {
      throw new Error(`Expected carousel to auto-scroll with scrollLeft: ${JSON.stringify({ initial, afterAutoScroll })}`);
    }
    if (afterAutoScroll.visibleCards < 1) {
      throw new Error(`Expected visible product cards during automatic scroll: ${JSON.stringify(afterAutoScroll)}`);
    }

    const manualScrollTarget = Math.round(afterAutoScroll.scrollLeft + afterAutoScroll.distance + 180);
    await page.evaluate((scrollLeft) => {
      const grid = document.querySelector('.home-product-grid');
      grid.scrollLeft = scrollLeft;
    }, manualScrollTarget);
    await page.waitForTimeout(80);

    const manualScroll = await getCarouselState(page);
    if (manualScroll.scrollLeft < manualScrollTarget - 60) {
      throw new Error(`Expected manual horizontal scroll not to be normalized mid-gesture: ${JSON.stringify({ manualScrollTarget, ...manualScroll })}`);
    }
    if (!manualScroll.isUserScrolling) {
      throw new Error(`Expected carousel auto-scroll to pause during manual scroll: ${JSON.stringify(manualScroll)}`);
    }
    await page.waitForTimeout(520);
    const manualHold = await getCarouselState(page);
    if (Math.abs(manualHold.scrollLeft - manualScroll.scrollLeft) > 4) {
      throw new Error(`Expected manual scroll position to stay stable while interaction pause is active: ${JSON.stringify({ manualScroll, manualHold })}`);
    }

    const beforeEndScroll = await getCarouselState(page);
    const nearEndTarget = Math.max(0, beforeEndScroll.scrollWidth - beforeEndScroll.clientWidth - 24);
    await page.evaluate((scrollLeft) => {
      const grid = document.querySelector('.home-product-grid');
      grid.scrollLeft = scrollLeft;
    }, nearEndTarget);
    await page.waitForTimeout(120);

    const afterEndScroll = await getCarouselState(page);
    if (afterEndScroll.scrollLeft < nearEndTarget - 60) {
      throw new Error(`Expected near-end manual scroll not to be pulled back: ${JSON.stringify({ nearEndTarget, beforeEndScroll, afterEndScroll })}`);
    }
    if (afterEndScroll.scrollWidth <= beforeEndScroll.scrollWidth) {
      throw new Error(`Expected carousel to append product cards before the end is exposed: ${JSON.stringify({ nearEndTarget, beforeEndScroll, afterEndScroll })}`);
    }
    if (afterEndScroll.visibleCards < 1) {
      throw new Error(`Expected visible product cards after extending the carousel: ${JSON.stringify(afterEndScroll)}`);
    }

    const beforeStartScroll = await getCarouselState(page);
    const nearStartTarget = 24;
    await page.evaluate((scrollLeft) => {
      const grid = document.querySelector('.home-product-grid');
      grid.scrollLeft = scrollLeft;
    }, nearStartTarget);
    await page.waitForTimeout(120);

    const afterStartScroll = await getCarouselState(page);
    if (afterStartScroll.scrollWidth <= beforeStartScroll.scrollWidth) {
      throw new Error(`Expected carousel to prepend product cards before the start is exposed: ${JSON.stringify({ nearStartTarget, beforeStartScroll, afterStartScroll })}`);
    }
    if (afterStartScroll.scrollLeft <= nearStartTarget + 60) {
      throw new Error(`Expected prepending to preserve the visible position with leftward buffer: ${JSON.stringify({ nearStartTarget, beforeStartScroll, afterStartScroll })}`);
    }
    if (afterStartScroll.visibleCards < 1) {
      throw new Error(`Expected visible product cards after extending the carousel start: ${JSON.stringify(afterStartScroll)}`);
    }

    await page.evaluate(async () => {
      const grid = document.querySelector('.home-product-grid');
      for (let index = 0; index < 12; index += 1) {
        grid.scrollLeft = grid.scrollWidth - grid.clientWidth - 24;
        grid.dispatchEvent(new Event('scroll'));
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      for (let index = 0; index < 12; index += 1) {
        grid.scrollLeft = 24;
        grid.dispatchEvent(new Event('scroll'));
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
    });
    await page.waitForTimeout(180);

    const afterStressScroll = await getCarouselState(page);
    if (afterStressScroll.cardCount > maxExpectedCards) {
      throw new Error(`Expected carousel to trim offscreen product cards: ${JSON.stringify({ maxExpectedCards, afterStressScroll })}`);
    }
    if (afterStressScroll.visibleCards < 1) {
      throw new Error(`Expected visible product cards after repeated bidirectional extension and trimming: ${JSON.stringify(afterStressScroll)}`);
    }

    await page.setViewportSize({ width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height - 92 });
    await page.waitForTimeout(120);
    const afterMobileViewportResize = await getCarouselState(page);
    if (afterMobileViewportResize.visibleCards < 1) {
      throw new Error(`Expected visible product cards after mobile viewport resize: ${JSON.stringify(afterMobileViewportResize)}`);
    }
    if (afterMobileViewportResize.scrollLeft < afterMobileViewportResize.distance) {
      throw new Error(`Expected mobile viewport resize not to collapse the left carousel buffer: ${JSON.stringify(afterMobileViewportResize)}`);
    }

    await page.waitForFunction(() => {
      const grid = document.querySelector('.home-product-grid');
      return !grid.classList.contains('is-user-scrolling');
    }, null, { timeout: 1600 });

    const beforeAutoResume = await getCarouselState(page);
    await page.waitForTimeout(1250);
    const afterAutoResume = await getCarouselState(page);
    if (afterAutoResume.scrollLeft <= beforeAutoResume.scrollLeft + 12) {
      throw new Error(`Expected automatic scroll to resume after manual interaction settles: ${JSON.stringify({ beforeAutoResume, afterAutoResume })}`);
    }
    if (afterAutoResume.visibleCards < 1) {
      throw new Error(`Expected visible product cards after automatic scroll resumes: ${JSON.stringify(afterAutoResume)}`);
    }

    console.log(`Home product carousel loops at mobile speed (${browserName}).`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;

  try {
    await runCarouselAssertions(chromium, 'Chromium', port);
    await runCarouselAssertions(webkit, 'WebKit', port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
