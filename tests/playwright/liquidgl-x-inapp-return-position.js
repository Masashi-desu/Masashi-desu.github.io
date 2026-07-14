/**
 * テスト概要:
 *  - 目的: X 内蔵ブラウザ相当の履歴復帰後も、ホームの LiquidGL セグメントが DOM の固定ナビ位置からずれないことを検証する。
 *  - 期待値: visualViewport に古い offsetTop / offsetLeft が残っていても、WebGL viewport の上下左右がナビの canvas 相対矩形と 1px 以内で一致する。
 *  - 検証方法: iPhone 相当の隔離 Chromium context でホームから Surround1x0-AKDK へ移動して戻り、stale viewport offset を注入して描画座標を取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const POSITION_TOLERANCE = 1;
const STALE_VISUAL_VIEWPORT_OFFSET = { left: 11, top: 280 };

function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//u, ''));
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
    const types = {
      '.css': 'text/css; charset=utf-8',
      '.gif': 'image/gif',
      '.glb': 'model/gltf-binary',
      '.html': 'text/html; charset=utf-8',
      '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp'
    };
    res.setHeader('Content-Type', types[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
}

function startServer() {
  const server = http.createServer(serveStatic);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function assertNear(actual, expected, label) {
  if (Math.abs(actual - expected) > POSITION_TOLERANCE) {
    throw new Error(`${label}: expected ${expected}px, got ${actual}px`);
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });

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
      await route.fulfill({ status: 204, body: '' });
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('mdw-theme', 'dark');
        localStorage.setItem('mdw-lang', 'ja');
      } catch (error) {
        // Storage access is not required for the position assertion.
      }
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.home-product-card[href*="Surround1x0-AKDK"]');
    await page.waitForFunction(() => Boolean(
      window.__liquidGLRenderer__ &&
      window.__liquidGLRenderer__.texture &&
      window.__liquidGLRenderer__.lenses.length
    ), null, { timeout: 12000 });

    await Promise.all([
      page.waitForURL(/\/products\/Surround1x0-AKDK\/index\.html/u),
      page.locator('.home-product-card[href*="Surround1x0-AKDK"]').first().click()
    ]);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(
      window.__liquidGLRenderer__ &&
      window.__liquidGLRenderer__.lenses.length
    ), null, { timeout: 12000 });

    const state = await page.evaluate((staleOffset) => {
      const renderer = window.__liquidGLRenderer__;
      const lens = renderer.lenses[0];
      const visualViewport = window.visualViewport;
      if (!visualViewport) {
        throw new Error('visualViewport is required for this regression test.');
      }

      Object.defineProperties(visualViewport, {
        offsetLeft: {
          configurable: true,
          get: () => staleOffset.left
        },
        offsetTop: {
          configurable: true,
          get: () => staleOffset.top
        }
      });

      const viewportCalls = [];
      const originalViewport = renderer.gl.viewport.bind(renderer.gl);
      renderer.gl.viewport = (...args) => {
        viewportCalls.push(args);
        originalViewport(...args);
      };
      lens.updateMetrics();
      renderer._renderLens(lens);
      renderer.gl.viewport = originalViewport;

      const viewport = viewportCalls[viewportCalls.length - 1];
      const canvasRect = renderer.canvas.getBoundingClientRect();
      const lensRect = lens.el.getBoundingClientRect();
      const scaleX = renderer.canvas.width / canvasRect.width;
      const scaleY = renderer.canvas.height / canvasRect.height;
      const actual = {
        left: viewport[0] / scaleX,
        top: (renderer.canvas.height - viewport[1] - viewport[3]) / scaleY,
        width: viewport[2] / scaleX,
        height: viewport[3] / scaleY
      };
      const expected = {
        left: lensRect.left - canvasRect.left,
        top: lensRect.top - canvasRect.top,
        width: lensRect.width,
        height: lensRect.height
      };

      return {
        actual,
        expected,
        staleOffset: {
          left: visualViewport.offsetLeft,
          top: visualViewport.offsetTop
        },
        pathname: window.location.pathname
      };
    }, STALE_VISUAL_VIEWPORT_OFFSET);

    assertNear(state.actual.left, state.expected.left, 'LiquidGL left');
    assertNear(state.actual.top, state.expected.top, 'LiquidGL top');
    assertNear(state.actual.width, state.expected.width, 'LiquidGL width');
    assertNear(state.actual.height, state.expected.height, 'LiquidGL height');

    console.log(`LiquidGL stays aligned after X in-app style history return: ${JSON.stringify(state)}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
