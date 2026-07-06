/**
 * テスト概要:
 *  - 目的: ホームのプロダクトカード carousel がスマホ表示で速くなりすぎず、手動の横スクロール操作にも反応し、アニメーション終端後も途切れずにループすることを検証する。
 *  - 期待値: iPhone 幅で 1 周分の移動距離が最初の clone カード位置と一致し、duration は距離ベースで 54s 以上、横スクロール可能で操作中は一時停止し、ユーザー操作中にscrollLeftが巻き戻らず、carousel領域は透明背景かつ通常時の影なし、終端を跨いだ後もカードが viewport 内に表示される。
 *  - 検証方法: ローカル静的サーバーでトップページを配信し、Playwright の Chromium mobile context で CSS 変数・computed style・scrollLeft・カード矩形・CSS Animation currentTime を計測する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const MIN_DURATION_SECONDS = 54;

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
    const visibleCards = Array.from(document.querySelectorAll('.home-product-card')).filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.right > gridRect.left + 24 && rect.left < gridRect.right - 24;
    }).length;
    return {
      cardCount: document.querySelectorAll('.home-product-card').length,
      cloneCount: document.querySelectorAll('.home-product-card--clone').length,
      distance: Number.parseFloat(gridStyle.getPropertyValue('--home-product-distance')),
      duration: Number.parseFloat(gridStyle.getPropertyValue('--home-product-duration')),
      animationDuration: Number.parseFloat(trackStyle.animationDuration),
      animationPlayState: trackStyle.animationPlayState,
      gridBackgroundColor: gridStyle.backgroundColor,
      gridPaddingBottom: gridStyle.paddingBottom,
      trackBackgroundColor: trackStyle.backgroundColor,
      cardBoxShadow: firstCardStyle ? firstCardStyle.boxShadow : null,
      firstCloneOffsetLeft: firstClone ? firstClone.offsetLeft : null,
      clientWidth: grid.clientWidth,
      scrollWidth: grid.scrollWidth,
      scrollLeft: Math.round(grid.scrollLeft),
      trackLeft: Number(trackRect.left.toFixed(2)),
      transform: trackStyle.transform,
      visibleCards
    };
  });
}

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
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.click('[data-section-target="products-section"]');
    await page.waitForSelector('.home-product-card--clone');
    await page.waitForTimeout(600);

    const initial = await getCarouselState(page);
    if (initial.cloneCount === 0 || initial.firstCloneOffsetLeft === null) {
      throw new Error(`Expected cloned product cards for looping: ${JSON.stringify(initial)}`);
    }
    if (Math.abs(initial.distance - initial.firstCloneOffsetLeft) > 1) {
      throw new Error(`Carousel distance should match first clone offset: ${JSON.stringify(initial)}`);
    }
    if (initial.duration < MIN_DURATION_SECONDS || initial.animationDuration < MIN_DURATION_SECONDS) {
      throw new Error(`Mobile carousel duration should not be faster than desktop baseline: ${JSON.stringify(initial)}`);
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

    const manualScrollTarget = Math.round(initial.distance + 180);
    await page.evaluate((scrollLeft) => {
      const grid = document.querySelector('.home-product-grid');
      grid.scrollLeft = scrollLeft;
    }, manualScrollTarget);
    await page.waitForTimeout(80);

    const manualScroll = await getCarouselState(page);
    if (manualScroll.scrollLeft < manualScrollTarget - 60) {
      throw new Error(`Expected manual horizontal scroll not to be normalized mid-gesture: ${JSON.stringify({ manualScrollTarget, ...manualScroll })}`);
    }
    if (manualScroll.animationPlayState !== 'paused') {
      throw new Error(`Expected carousel animation to pause during manual scroll: ${JSON.stringify(manualScroll)}`);
    }

    await page.evaluate(() => {
      const grid = document.querySelector('.home-product-grid');
      grid.scrollLeft = 0;
    });
    await page.waitForFunction(() => {
      const grid = document.querySelector('.home-product-grid');
      return grid.scrollLeft === 0 && !grid.classList.contains('is-user-scrolling');
    }, null, { timeout: 1600 });

    await page.evaluate(() => {
      const track = document.querySelector('.home-product-track');
      const animation = track.getAnimations().find((entry) => entry.animationName === 'home-product-drift');
      if (!animation) {
        throw new Error('home-product-drift animation was not found');
      }
      const durationMs = Number.parseFloat(getComputedStyle(track).animationDuration) * 1000;
      animation.currentTime = durationMs - 24;
      animation.play();
    });
    await page.waitForTimeout(120);

    const afterWrap = await getCarouselState(page);
    if (afterWrap.visibleCards < 1) {
      throw new Error(`Expected visible product cards after crossing loop boundary: ${JSON.stringify(afterWrap)}`);
    }
    if (afterWrap.trackLeft < -80) {
      throw new Error(`Carousel did not wrap back to the start after animation boundary: ${JSON.stringify(afterWrap)}`);
    }

    console.log('Home product carousel loops at mobile speed.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
