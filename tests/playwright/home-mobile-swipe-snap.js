/**
 * テスト概要:
 *  - 目的: トップページをスマホ touch context で縦スワイプした際、セクション移動が途中停止せず nav segment と表示セクションが一致することを検証する。
 *  - 期待値: 上スワイプ後は Product が active かつ products-section の top が 0px 付近、footer では gear が active になり、その後の下スワイプで Product / Philosophy に戻れる。
 *  - 検証方法: ローカル静的サーバーでトップページを配信し、Playwright の Chromium mobile context から CDP touch event を送って scrollY・active target・section の矩形を取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const SECTION_TOLERANCE = 4;

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

async function dispatchSwipe(cdp, page, startY, endY) {
  const x = Math.round(MOBILE_VIEWPORT.width / 2);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: startY }]
  });
  const steps = 14;
  for (let index = 1; index <= steps; index += 1) {
    const y = startY + ((endY - startY) * index) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y }]
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
}

async function getHomeState(page) {
  return page.evaluate(() => {
    const active = document.querySelector('.home-section-nav__button.is-active, .home-section-nav__footer-link.is-active');
    const catchRect = document.getElementById('catch-section').getBoundingClientRect();
    const productsRect = document.getElementById('products-section').getBoundingClientRect();
    const footerRect = document.getElementById('home-footer').getBoundingClientRect();
    return {
      scrollY: Math.round(window.scrollY),
      activeTarget: active ? active.dataset.sectionTarget || active.dataset.footerTarget : null,
      catchTop: Number(catchRect.top.toFixed(2)),
      productsTop: Number(productsRect.top.toFixed(2)),
      footerTop: Number(footerRect.top.toFixed(2)),
      distanceFromBottom: Math.round(document.documentElement.scrollHeight - (window.scrollY + window.innerHeight))
    };
  });
}

function assertSectionState(state, expectedTarget, topKey) {
  if (state.activeTarget !== expectedTarget) {
    throw new Error(`Expected active target ${expectedTarget}, got ${state.activeTarget}: ${JSON.stringify(state)}`);
  }
  if (Math.abs(state[topKey]) > SECTION_TOLERANCE) {
    throw new Error(`Expected ${topKey} near 0px, got ${state[topKey]}: ${JSON.stringify(state)}`);
  }
}

function assertFooterState(state) {
  if (state.activeTarget !== 'home-footer') {
    throw new Error(`Expected footer segment to be active, got ${state.activeTarget}: ${JSON.stringify(state)}`);
  }
  if (state.distanceFromBottom > SECTION_TOLERANCE) {
    throw new Error(`Expected to be settled at footer bottom, got ${state.distanceFromBottom}px from bottom: ${JSON.stringify(state)}`);
  }
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
    await page.waitForTimeout(500);

    const cdp = await context.newCDPSession(page);

    await dispatchSwipe(cdp, page, 650, 190);
    await page.waitForTimeout(1300);
    const productState = await getHomeState(page);
    assertSectionState(productState, 'products-section', 'productsTop');

    await page.click('.home-section-nav__footer-link');
    await page.waitForTimeout(1300);
    const footerClickState = await getHomeState(page);
    assertFooterState(footerClickState);

    await dispatchSwipe(cdp, page, 190, 650);
    await page.waitForTimeout(1300);
    const productReturnState = await getHomeState(page);
    assertSectionState(productReturnState, 'products-section', 'productsTop');

    await dispatchSwipe(cdp, page, 650, 190);
    await page.waitForTimeout(1300);
    const footerSwipeState = await getHomeState(page);
    assertFooterState(footerSwipeState);

    await dispatchSwipe(cdp, page, 190, 650);
    await page.waitForTimeout(1300);
    const productReturnFromSwipeState = await getHomeState(page);
    assertSectionState(productReturnFromSwipeState, 'products-section', 'productsTop');

    await dispatchSwipe(cdp, page, 190, 650);
    await page.waitForTimeout(1300);
    const catchState = await getHomeState(page);
    assertSectionState(catchState, 'catch-section', 'catchTop');

    console.log('Home mobile swipe snaps to complete sections.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
