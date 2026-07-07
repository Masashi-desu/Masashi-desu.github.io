/**
 * テスト概要:
 *  - 目的: ホームを途中までスクロールした状態でリロードしても、トップへ戻り LiquidGL のセグメントエフェクトが適用されることを検証する。
 *  - 期待値: reload 後の scrollY が 0px 付近で、home nav track が opacity 1、かつ LiquidGL renderer に texture が作成されている。
 *  - 検証方法: ローカル静的サーバーで /index.html を開き、iPhone 幅の Chromium context で一画面分スクロールしてから reload し、scrollY と LiquidGL 状態を取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const SCROLL_TOLERANCE = 2;

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
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      window.scrollTo(0, Math.round(window.innerHeight));
    });
    await page.waitForTimeout(300);

    const beforeReloadScrollY = await page.evaluate(() => Math.round(window.scrollY));
    if (beforeReloadScrollY <= SCROLL_TOLERANCE) {
      throw new Error(`Expected page to be scrolled before reload, got ${beforeReloadScrollY}px`);
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1400);

    const state = await page.evaluate(() => {
      const nav = document.querySelector('.home-section-nav__track');
      const style = nav ? getComputedStyle(nav) : null;
      return {
        scrollY: Math.round(window.scrollY),
        navOpacity: style ? Number(style.opacity) : null,
        navClassName: nav ? nav.className : null,
        hasTexture: !!(window.__liquidGLRenderer__ && window.__liquidGLRenderer__.texture)
      };
    });

    if (state.scrollY > SCROLL_TOLERANCE) {
      throw new Error(`Expected home reload to reset scroll to top: ${JSON.stringify(state)}`);
    }
    if (state.navOpacity < 0.95 || !state.hasTexture || /is-liquidgl-fallback/.test(state.navClassName || '')) {
      throw new Error(`Expected LiquidGL segment effect after home reload: ${JSON.stringify(state)}`);
    }

    console.log('Home reload resets to top and keeps LiquidGL segment effect.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
