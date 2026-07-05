/**
 * テスト概要:
 *  - 目的: 製品一覧ページのスマホ表示で、ヘッダーキャプションなどの長文が横にはみ出して横スクロールを発生させないことを確認する。
 *  - 期待値: iPhone 幅の viewport で document/body の scrollWidth が clientWidth を超えず、section-copy が viewport 内で折り返される。
 *  - 検証方法: ローカル静的サーバーで /products/ を配信し、Playwright の Chromium mobile context で scrollWidth と該当要素の矩形・computed style を取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const OVERFLOW_TOLERANCE = 1;

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
    await page.goto(`http://127.0.0.1:${port}/products/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const copy = document.querySelector('.section-copy');
      const copyRect = copy ? copy.getBoundingClientRect() : null;
      const copyStyle = copy ? getComputedStyle(copy) : null;
      return {
        clientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        copyRight: copyRect ? Number(copyRect.right.toFixed(2)) : null,
        copyWidth: copyRect ? Number(copyRect.width.toFixed(2)) : null,
        copyWhiteSpace: copyStyle ? copyStyle.whiteSpace : null
      };
    });

    const maxAllowed = state.clientWidth + OVERFLOW_TOLERANCE;
    if (state.documentScrollWidth > maxAllowed || state.bodyScrollWidth > maxAllowed) {
      throw new Error(`Catalog page overflowed horizontally: ${JSON.stringify(state)}`);
    }
    if (state.copyRight === null || state.copyRight > maxAllowed) {
      throw new Error(`Catalog caption exceeded viewport: ${JSON.stringify(state)}`);
    }
    if (state.copyWhiteSpace === 'nowrap') {
      throw new Error(`Catalog caption should wrap, got white-space: ${state.copyWhiteSpace}`);
    }

    console.log('Catalog mobile layout has no horizontal overflow.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
