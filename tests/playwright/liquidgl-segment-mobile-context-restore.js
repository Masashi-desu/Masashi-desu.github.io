/**
 * テスト概要:
 *  - 目的: iOS Mobile Safari でページ復帰時に WebGL context が破棄されても、LiquidGL セグメントが復帰することを検証する。
 *  - 期待値: context loss 中は CSS fallback が表示され、context restore 後は texture と不透明な WebGL ピクセルが再生成されて fallback が外れる。
 *  - 検証方法: 初期snapshot更新の完了後、iPhone 幅の WebKit context で WEBGL_lose_context を発生・復帰させる。
 *    復帰後はrendererのcapture/reveal停止状態が安定してから、イベント、class、opacity、描画ピクセルを取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { webkit, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const MOBILE_VIEWPORT = { width: 393, height: 852 };

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

async function getState(page) {
  return page.evaluate(() => {
    const renderer = window.__liquidGLRenderer__;
    const nav = document.querySelector('.home-section-nav__track');
    const gl = renderer && renderer.gl;
    const lens = renderer && renderer.lenses[0];
    let sample = null;

    if (renderer && gl && lens && renderer.texture && !gl.isContextLost()) {
      renderer.render();
      const rect = lens.el.getBoundingClientRect();
      const canvasRect = renderer.canvas.getBoundingClientRect();
      const scaleX = renderer.canvas.width / canvasRect.width;
      const scaleY = renderer.canvas.height / canvasRect.height;
      const x = Math.round((rect.left + rect.width / 2 - canvasRect.left) * scaleX);
      const y = Math.round(
        renderer.canvas.height -
        (rect.top + rect.height / 2 - canvasRect.top) * scaleY
      );
      const pixel = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      sample = Array.from(pixel);
    }

    return {
      events: Array.isArray(window.__mdwLiquidGLContextEvents)
        ? window.__mdwLiquidGLContextEvents.slice()
        : [],
      fallback: Boolean(nav && nav.classList.contains('is-liquidgl-fallback')),
      navOpacity: nav ? Number(getComputedStyle(nav).opacity) : null,
      canvasOpacity: renderer ? Number(getComputedStyle(renderer.canvas).opacity) : null,
      hasRenderer: Boolean(renderer),
      hasTexture: Boolean(renderer && renderer.texture),
      contextLost: Boolean(gl && gl.isContextLost()),
      sample
    };
  });
}

async function waitForRendererSettled(page, requireRestored = false) {
  await page.waitForFunction((needsRestore) => {
    const renderer = window.__liquidGLRenderer__;
    const nav = document.querySelector('.home-section-nav__track');
    const events = Array.isArray(window.__mdwLiquidGLContextEvents)
      ? window.__mdwLiquidGLContextEvents
      : [];
    const ready = Boolean(
      renderer &&
      renderer.gl &&
      !renderer.gl.isContextLost() &&
      renderer.texture &&
      renderer.lenses.length &&
      !renderer._capturing &&
      !renderer._revealAnimating &&
      nav &&
      !nav.classList.contains('is-liquidgl-fallback') &&
      Number(getComputedStyle(nav).opacity) >= 0.95 &&
      Number(getComputedStyle(renderer.canvas).opacity) >= 0.95 &&
      (!needsRestore || events.includes('restored'))
    );
    const marker = needsRestore
      ? '__mdwLiquidGLRestoreSettledAt'
      : '__mdwLiquidGLInitialSettledAt';
    if (!ready) {
      window[marker] = null;
      return false;
    }
    const now = performance.now();
    if (!Number.isFinite(window[marker])) {
      window[marker] = now;
      return false;
    }
    return now - window[marker] >= 250;
  }, requireRestored, { timeout: 15000, polling: 50 });
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await webkit.launch();

  try {
    const context = await browser.newContext({
      ...devices['iPhone 14 Pro'],
      viewport: MOBILE_VIEWPORT,
      colorScheme: 'light'
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(
      window.__liquidGLRenderer__ &&
      window.__liquidGLRenderer__.texture &&
      window.__liquidGLRenderer__.lenses.length
    ), null, { timeout: 12000 });
    // load/footer/transition が予約する初期 refresh を先に完了させ、
    // context restore 後の reveal と競合しない状態から回帰シナリオを開始する。
    await page.waitForTimeout(1500);
    await waitForRendererSettled(page);

    const extensionAvailable = await page.evaluate(() => {
      const renderer = window.__liquidGLRenderer__;
      const extension = renderer.gl.getExtension('WEBGL_lose_context');
      if (!extension) {
        return false;
      }
      window.__mdwLiquidGLContextEvents = [];
      window.addEventListener('liquidgl:context-lost', () => {
        window.__mdwLiquidGLContextEvents.push('lost');
      });
      window.addEventListener('liquidgl:context-restored', () => {
        window.__mdwLiquidGLContextEvents.push('restored');
      });
      window.__mdwLiquidGLLoseContextExtension = extension;
      extension.loseContext();
      return true;
    });

    if (!extensionAvailable) {
      throw new Error('WEBGL_lose_context is required for the LiquidGL context restore regression.');
    }

    await page.waitForFunction(() => {
      const renderer = window.__liquidGLRenderer__;
      const nav = document.querySelector('.home-section-nav__track');
      return Boolean(
        renderer &&
        renderer.gl.isContextLost() &&
        nav &&
        nav.classList.contains('is-liquidgl-fallback')
      );
    }, null, { timeout: 5000 });

    const lostState = await getState(page);
    if (
      !lostState.contextLost ||
      !lostState.fallback ||
      lostState.navOpacity < 0.95 ||
      !lostState.events.includes('lost')
    ) {
      throw new Error(`LiquidGL segment did not enter visible fallback after context loss: ${JSON.stringify(lostState)}`);
    }

    await page.evaluate(() => {
      window.__mdwLiquidGLLoseContextExtension.restoreContext();
    });
    await waitForRendererSettled(page, true);

    const restoredState = await getState(page);
    if (
      restoredState.contextLost ||
      restoredState.fallback ||
      !restoredState.hasTexture ||
      restoredState.canvasOpacity < 0.95 ||
      restoredState.navOpacity < 0.95 ||
      !restoredState.sample ||
      restoredState.sample[3] < 240
    ) {
      throw new Error(`LiquidGL segment did not redraw after context restore: ${JSON.stringify(restoredState)}`);
    }

    console.log(`LiquidGL segment restores after mobile WebGL context loss: ${JSON.stringify(restoredState)}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
