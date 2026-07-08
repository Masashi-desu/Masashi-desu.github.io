/**
 * テスト概要:
 *  - 目的: 共通 footer を取り込むページのスマホ表示で、コピーライトが footer controls より下に表示され、重複しないことを確認する。
 *  - 期待値: iPhone 幅の viewport で .site-footer__shared が column 方向となり、.site-footer__copyright は .site-footer__actions の下に 1 回だけ表示される。
 *  - 検証方法: ローカル静的サーバーで主要ページを配信し、Playwright の Chromium mobile context で footer partial 読み込み後の矩形と DOM 件数を取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const PAGES = [
  '/',
  '/products/index.html',
  '/products/TypeFetch/index.html',
  '/products/WinKinesis/index.html',
  '/products/Surround1x0-AKDK/index.html',
  '/products/RetreatScreen/privacy.html',
  '/products/RetreatScreen/support.html',
  '/products/RetreatScreen/index.html'
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
      await route.fulfill({ status: 204, body: '' });
    });
    await context.addInitScript(() => {
      window.__mdwFooterLoadCount = 0;
      window.addEventListener('mdw:footer-loaded', () => {
        window.__mdwFooterLoadCount += 1;
      });
      try {
        localStorage.setItem('mdw-theme', 'dark');
        localStorage.setItem('mdw-lang', 'ja');
      } catch (error) {
        // ignore storage write errors
      }
    });

    for (const pathname of PAGES) {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}${pathname}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__mdwFooterLoadCount >= 1, null, { timeout: 10000 });
      await page.waitForSelector('.site-footer__shared .site-footer__copyright', { timeout: 5000 });
      const state = await page.evaluate(() => {
        const shared = document.querySelector('.site-footer__shared');
        const actions = document.querySelector('.site-footer__shared .site-footer__actions');
        const copyright = document.querySelector('.site-footer__shared .site-footer__copyright');
        const sharedStyle = shared ? getComputedStyle(shared) : null;
        const actionsRect = actions ? actions.getBoundingClientRect() : null;
        const copyrightRect = copyright ? copyright.getBoundingClientRect() : null;
        return {
          copyrightCount: document.querySelectorAll('.site-footer__copyright').length,
          copyrightText: copyright ? copyright.textContent.trim() : null,
          flexDirection: sharedStyle ? sharedStyle.flexDirection : null,
          actionsBottom: actionsRect ? Number(actionsRect.bottom.toFixed(2)) : null,
          copyrightTop: copyrightRect ? Number(copyrightRect.top.toFixed(2)) : null
        };
      });
      await page.close();

      if (
        state.copyrightCount !== 1 ||
        state.copyrightText !== '© 2026 Masahi_desu' ||
        state.flexDirection !== 'column' ||
        state.copyrightTop <= state.actionsBottom
      ) {
        throw new Error(`Footer copyright order failed on ${pathname}: ${JSON.stringify(state)}`);
      }
    }

    console.log('Footer copyright appears once below controls on mobile pages.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
