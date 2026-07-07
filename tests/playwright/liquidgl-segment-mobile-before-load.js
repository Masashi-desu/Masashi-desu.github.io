/**
 * テスト概要:
 *  - 目的: スマホ表示で画像読み込みが遅い場合でも、LiquidGL 適用済みセグメントコントロールが window load 前に表示されることを検証する。
 *  - 期待値: iPhone 幅の WebKit context で catalog nav track が load 未発火の状態でも opacity 1 かつ有効な矩形を持つ。
 *  - 検証方法: DOMContentLoaded 時に遅延画像を追加し、該当画像レスポンスを遅延させたまま /products/index.html を開いて computed style と矩形を取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { webkit, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const DELAYED_IMAGE_PATH = '/__liquidgl-delay.png';

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
  const browser = await webkit.launch();

  try {
    const context = await browser.newContext({
      ...devices['iPhone 14 Pro'],
      viewport: MOBILE_VIEWPORT,
      colorScheme: 'dark'
    });
    await context.route(`**${DELAYED_IMAGE_PATH}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({
        status: 204,
        body: ''
      }).catch(() => {});
    });
    await context.addInitScript((delayedImagePath) => {
      window.__mdwLoadFiredForTest = false;
      window.addEventListener('load', () => {
        window.__mdwLoadFiredForTest = true;
      });
      document.addEventListener('DOMContentLoaded', () => {
        const image = document.createElement('img');
        image.alt = '';
        image.src = delayedImagePath;
        image.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;';
        document.body.appendChild(image);
      });
      try {
        localStorage.setItem('mdw-theme', 'dark');
        localStorage.setItem('mdw-lang', 'ja');
      } catch (error) {
        // ignore storage write errors
      }
    }, DELAYED_IMAGE_PATH);

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/products/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);

    const state = await page.evaluate(() => {
      const nav = document.querySelector('.catalog-section-nav__track');
      const rect = nav ? nav.getBoundingClientRect() : null;
      const style = nav ? getComputedStyle(nav) : null;
      return {
        loadFired: window.__mdwLoadFiredForTest,
        opacity: style ? Number(style.opacity) : null,
        display: style ? style.display : null,
        width: rect ? Number(rect.width.toFixed(2)) : null,
        height: rect ? Number(rect.height.toFixed(2)) : null
      };
    });

    if (state.loadFired) {
      throw new Error(`Expected to inspect before window load, got loadFired=true: ${JSON.stringify(state)}`);
    }
    if (state.display === 'none' || state.opacity < 0.95 || !state.width || !state.height) {
      throw new Error(`LiquidGL segment nav should be visible before load: ${JSON.stringify(state)}`);
    }

    console.log('LiquidGL segment nav remains visible on mobile before window load.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
