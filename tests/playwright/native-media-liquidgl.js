/**
 * テスト概要:
 *  - 目的: CIから分離したmacOS固有のH.264デコードとLiquidGL動画テクスチャ更新を、ローカルのリリース前ゲートで検証する。
 *  - 期待値: ChromiumとmacOS WebKitの両方で製品一覧の3本のMP4がデコード・再生され、LiquidGLが各video要素をtextureへ登録して実時間frameを更新する。Bartical詳細ではダーク／ライト両MP4がデコードされ、再生時刻が進む。
 *  - 検証方法: macOS上のPlaywright Chromium／WebKitからローカル静的サーバーを開く。videoのcodec対応、readyState、currentTime、LiquidGLのtexture・video frame stateを条件待ちで取得し、固定sleepに依存せず進行を確認する。
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const BROWSERS = [
  { name: 'chromium', type: chromium },
  { name: 'webkit', type: webkit }
];
const H264_MIME = 'video/mp4; codecs="avc1"';

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `: ${JSON.stringify(details)}` : ''}`);
  }
}

function serveStatic(request, response) {
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(ROOT, relativePath);
  if (pathname.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    const contentTypes = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.mp4': 'video/mp4',
      '.png': 'image/png',
      '.svg': 'image/svg+xml; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8'
    };
    response.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    response.end(data);
  });
}

function startServer() {
  const server = http.createServer(serveStatic);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function createContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 1372, height: 994 },
    colorScheme: 'dark',
    reducedMotion: 'no-preference'
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    if (route.request().resourceType() === 'stylesheet') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
  return context;
}

async function verifyCatalog(page, baseUrl, browserName) {
  await page.goto(`${baseUrl}/products/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((h264Mime) => {
    const videos = Array.from(document.querySelectorAll('.catalog-product-section__video'));
    const renderer = window.__liquidGLRenderer__;
    return videos.length === 3
      && videos.every((video) => (
        video.canPlayType(h264Mime) !== ''
        && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && Number.isFinite(video.duration)
        && video.duration > 0
      ))
      && renderer?.texture
      && renderer.gl
      && !renderer.gl.isContextLost()
      && renderer._videoNodes?.length === 3
      && videos.every((video) => (
        renderer._videoNodes.includes(video)
        && Number.isFinite(renderer._videoFrameState?.get(video)?.time)
      ));
  }, H264_MIME, { timeout: 20000 });

  await page.locator('.catalog-product-section__video').evaluateAll((videos) => (
    Promise.all(videos.map((video) => video.play()))
  ));
  const before = await page.evaluate(() => {
    const renderer = window.__liquidGLRenderer__;
    return renderer._videoNodes.map((video) => ({
      src: video.getAttribute('src'),
      currentTime: video.currentTime,
      frameTime: renderer._videoFrameState.get(video).time,
      duration: video.duration
    })).sort((a, b) => a.src.localeCompare(b.src));
  });

  await page.waitForFunction((previous) => {
    const renderer = window.__liquidGLRenderer__;
    if (!renderer?.texture || !renderer._videoNodes?.length) {
      return false;
    }
    const current = renderer._videoNodes.map((video) => ({
      src: video.getAttribute('src'),
      currentTime: video.currentTime,
      frameTime: renderer._videoFrameState?.get(video)?.time,
      duration: video.duration
    })).sort((a, b) => a.src.localeCompare(b.src));
    return current.length === previous.length && current.every((entry, index) => {
      const initial = previous[index];
      const mediaDelta = (entry.currentTime - initial.currentTime + entry.duration) % entry.duration;
      const frameDelta = (entry.frameTime - initial.frameTime + entry.duration) % entry.duration;
      const frameLag = (entry.currentTime - entry.frameTime + entry.duration) % entry.duration;
      return entry.src === initial.src
        && mediaDelta > 0.1
        && frameDelta > 0.1
        && frameLag < 2.5;
    });
  }, before, { timeout: 15000 });

  const state = await page.evaluate(() => {
    const renderer = window.__liquidGLRenderer__;
    return {
      hasTexture: Boolean(renderer?.texture),
      contextLost: renderer?.gl?.isContextLost() ?? null,
      videoSources: renderer?._videoNodes?.map((video) => video.getAttribute('src')).sort() || []
    };
  });
  assert(state.hasTexture && state.contextLost === false, `[${browserName}] Catalog LiquidGL texture was unavailable`, state);
}

async function verifyBarticalThemeVideo(page, baseUrl, browserName, theme, expectedSource) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem('mdw-theme', selectedTheme);
  }, theme);
  await page.goto(`${baseUrl}/products/Bartical/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(({ h264Mime, source }) => {
    const video = document.querySelector('[data-hero-video]');
    return video?.getAttribute('src') === source
      && video.canPlayType(h264Mime) !== ''
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && Number.isFinite(video.duration)
      && video.duration > 0;
  }, { h264Mime: H264_MIME, source: expectedSource }, { timeout: 20000 });
  const initialTime = await page.locator('[data-hero-video]').evaluate(async (video) => {
    await video.play();
    return video.currentTime;
  });
  await page.waitForFunction((before) => {
    const video = document.querySelector('[data-hero-video]');
    return video && video.currentTime - before > 0.1;
  }, initialTime, { timeout: 10000 });
  const state = await page.locator('[data-hero-video]').evaluate((video) => ({
    src: video.getAttribute('src'),
    readyState: video.readyState,
    currentTime: video.currentTime,
    errorCode: video.error?.code ?? null
  }));
  assert(state.src === expectedSource && state.errorCode === null, `[${browserName}] Bartical ${theme} video failed`, state);
}

async function main() {
  assert(process.platform === 'darwin', 'Native media test requires macOS', process.platform);
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    for (const browserSpec of BROWSERS) {
      const browser = await browserSpec.type.launch({ headless: true });
      try {
        const catalogContext = await createContext(browser);
        try {
          await verifyCatalog(await catalogContext.newPage(), baseUrl, browserSpec.name);
        } finally {
          await catalogContext.close();
        }

        for (const themeSpec of [
          { theme: 'dark', source: './hero-bg-dark.mp4' },
          { theme: 'light', source: './hero-bg-light.mp4' }
        ]) {
          const context = await createContext(browser);
          try {
            await verifyBarticalThemeVideo(
              await context.newPage(),
              baseUrl,
              browserSpec.name,
              themeSpec.theme,
              themeSpec.source
            );
          } finally {
            await context.close();
          }
        }
        console.log(`Native H.264 and LiquidGL media passed in macOS ${browserSpec.name}.`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
