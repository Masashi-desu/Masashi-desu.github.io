/**
 * テスト概要:
 *  - 目的: スマホ表示で内蔵NaughtyDOM rasteriserの画像読込がsnapshot timeoutを超えても、fallback表示後にLiquidGLセグメントコントロールへ復帰することを検証する。
 *  - 期待値: iPhone幅のWebKit contextでcatalog nav trackがload未発火中にfallbackとして表示される。再試行でtexture作成後はfallback classと背景styleが外れる。
 *  - 検証方法: DOMContentLoaded時に2.5秒応答を遅延する画像を追加し、1.2秒のsnapshot timeoutを設定して /products/index.html を開く。fallback状態と、内蔵rasteriserの再試行による復帰後のcomputed/inline styleを取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { webkit, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
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
      window.__MDWLiquidGLSnapshotCaptureTimeout = 1200;
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
    await page.waitForTimeout(1100);

    const fallbackState = await page.evaluate(() => {
      const nav = document.querySelector('.catalog-section-nav__track');
      const rect = nav ? nav.getBoundingClientRect() : null;
      const style = nav ? getComputedStyle(nav) : null;
      return {
        loadFired: window.__mdwLoadFiredForTest,
        opacity: style ? Number(style.opacity) : null,
        display: style ? style.display : null,
        width: rect ? Number(rect.width.toFixed(2)) : null,
        height: rect ? Number(rect.height.toFixed(2)) : null,
        className: nav ? nav.className : null,
        hasTexture: !!(window.__liquidGLRenderer__ && window.__liquidGLRenderer__.texture)
      };
    });

    if (fallbackState.loadFired) {
      throw new Error(`Expected to inspect before window load, got loadFired=true: ${JSON.stringify(fallbackState)}`);
    }
    if (fallbackState.display === 'none' || fallbackState.opacity < 0.95 || !fallbackState.width || !fallbackState.height) {
      throw new Error(`LiquidGL segment nav should be visible before load: ${JSON.stringify(fallbackState)}`);
    }
    if (!/is-liquidgl-fallback/.test(fallbackState.className || '') || fallbackState.hasTexture) {
      throw new Error(`Expected pending fallback before retry capture: ${JSON.stringify(fallbackState)}`);
    }
    try {
      await page.waitForFunction(() => {
        const nav = document.querySelector('.catalog-section-nav__track');
        return !!(
          nav &&
          window.__liquidGLRenderer__ &&
          window.__liquidGLRenderer__.texture &&
          !nav.classList.contains('is-liquidgl-fallback')
        );
      }, null, { timeout: 10000 });
    } catch (error) {
      const timeoutState = await page.evaluate(() => {
        const nav = document.querySelector('.catalog-section-nav__track');
        return {
          className: nav ? nav.className : null,
          inlineBackground: nav ? nav.style.background : null,
          inlineBackdropFilter: nav ? nav.style.backdropFilter : null,
          hasRenderer: !!window.__liquidGLRenderer__,
          hasTexture: !!(window.__liquidGLRenderer__ && window.__liquidGLRenderer__.texture),
          isCapturing: !!(window.__liquidGLRenderer__ && window.__liquidGLRenderer__._capturing)
        };
      });
      throw new Error(`Timed out waiting for LiquidGL fallback restore: ${JSON.stringify(timeoutState)}`, { cause: error });
    }

    const restoredState = await page.evaluate(() => {
      const nav = document.querySelector('.catalog-section-nav__track');
      const style = nav ? getComputedStyle(nav) : null;
      return {
        className: nav ? nav.className : null,
        opacity: style ? Number(style.opacity) : null,
        computedBackgroundColor: style ? style.backgroundColor : null,
        inlineBackground: nav ? nav.style.background : null,
        inlineBackdropFilter: nav ? nav.style.backdropFilter : null,
        inlineWebkitBackdropFilter: nav ? nav.style.webkitBackdropFilter : null,
        hasTexture: !!(window.__liquidGLRenderer__ && window.__liquidGLRenderer__.texture)
      };
    });

    if (restoredState.opacity < 0.95 || !restoredState.hasTexture || /is-liquidgl-fallback/.test(restoredState.className || '')) {
      throw new Error(`Expected LiquidGL segment nav to restore after fallback: ${JSON.stringify(restoredState)}`);
    }
    if (/var\\(--home-nav-bg\\)/.test(restoredState.inlineBackground || '')) {
      throw new Error(`Fallback background style should be removed after LiquidGL restore: ${JSON.stringify(restoredState)}`);
    }
    console.log('LiquidGL segment nav restores from a stalled built-in rasteriser snapshot on mobile WebKit.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
