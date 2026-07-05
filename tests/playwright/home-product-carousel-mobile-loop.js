/**
 * テスト概要:
 *  - 目的: ホームのプロダクトカード carousel がスマホ表示で速くなりすぎず、アニメーション終端後も途切れずにループすることを検証する。
 *  - 期待値: iPhone 幅で 1 周分の移動距離が最初の clone カード位置と一致し、duration は距離ベースで 54s 以上、終端を跨いだ後もカードが viewport 内に表示される。
 *  - 検証方法: ローカル静的サーバーでトップページを配信し、Playwright の Chromium mobile context で CSS 変数・computed style・カード矩形・CSS Animation currentTime を計測する。
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
      firstCloneOffsetLeft: firstClone ? firstClone.offsetLeft : null,
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
