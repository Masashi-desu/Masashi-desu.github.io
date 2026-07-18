/**
 * テスト概要:
 *  - 目的: ホーム Philosophy 背景で、非点灯タイルがほぼ透明になり、fine pointer を芯とした
 *    点灯範囲が円形ではなく、上方へ伸びて輪郭が連続変化する炎状になることを検証する。
 *  - 期待値: 通常タイルの alpha は 0.008 以下、カーソル点灯半径は 72px とする。点灯開始から
 *    80ms 時点では中心 alpha が途中値に留まり、その後は中心・30px・60px の順で低下して、
 *    中心は 0.6 以上、30px は 0.3 以上、60px は 0.005 以上、半径外は 0.02 未満になる。
 *    静止形状でも上側の広がりは下側より 10px 以上長く、通常モーション環境では輪郭エネルギーが
 *    700ms の間に 0.1 以上変化する。
 *    ブラウザ下端の外への実ポインタ移動後は opacity が途中値を経て 0 になり、中心タイルも
 *    通常 alpha へ戻る。境界イベントを取りこぼした場合も `:hover` 監視で残留させない。
 *    カーソル移動直後は旧位置のタイルが点灯状態を保ち、時間を置くと通常 alpha へ戻る。
 *    通常モーション環境では同時点灯タイル間に 0.12 以上の強度差があり、同じタイルも時間変化する。
 *  - 検証方法: reduced motion の Chromium でランダム点滅を停止し、canvas のタイル中心画素を
 *    getImageData で読み取る。Playwright の仮想時計で描画時間を進めながら、カーソル移動前後と
 *    複数距離の alpha を比較し、通常モーションではポインタ中心に近い安定サンプル群の
 *    同一タイルを時系列で比較する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const TILE_SIZE = 10;
const TILE_GAP = 5;

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

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(details)}`);
  }
}

function parseIntensitySample(value) {
  return new Map(
    value
      .split(',')
      .filter(Boolean)
      .map((entry) => {
        const [index, intensity] = entry.split(':');
        return [index, Number(intensity)];
      })
  );
}

function parseNumericList(value) {
  return value.split(',').map(Number);
}

async function readTileSamples(page) {
  return page.evaluate(({ tileSize, tileGap }) => {
    const canvas = document.querySelector('[data-philosophy-tiles]');
    const section = canvas.closest('.home-section--catch');
    const columns = Number(canvas.dataset.tileColumns);
    const rows = Number(canvas.dataset.tileRows);
    const stride = tileSize + tileGap;
    const width = section.getBoundingClientRect().width;
    const height = section.getBoundingClientRect().height;
    const gridWidth = columns * tileSize + (columns - 1) * tileGap;
    const gridHeight = rows * tileSize + (rows - 1) * tileGap;
    const offsetX = (width - gridWidth) / 2;
    const offsetY = (height - gridHeight) / 2;
    const column = Math.max(8, Math.min(columns - 9, Math.round((width / 2 - offsetX - tileSize / 2) / stride)));
    const row = Math.max(1, Math.min(rows - 2, Math.round((height / 2 - offsetY - tileSize / 2) / stride)));
    const centerX = offsetX + column * stride + tileSize / 2;
    const centerY = offsetY + row * stride + tileSize / 2;
    const dprX = canvas.width / width;
    const dprY = canvas.height / height;
    const context = canvas.getContext('2d');
    const alphaAt = (columnOffset) => {
      const x = Math.round((centerX + columnOffset * stride) * dprX);
      const y = Math.round(centerY * dprY);
      return context.getImageData(x, y, 1, 1).data[3] / 255;
    };
    return {
      pointer: {
        x: section.getBoundingClientRect().left + centerX,
        y: section.getBoundingClientRect().top + centerY
      },
      alpha: {
        center: alphaAt(0),
        near: alphaAt(2),
        middle: alphaAt(4),
        outside: alphaAt(8)
      },
      idleOpacity: Number(canvas.dataset.tileIdleOpacity),
      pointerGlowRadius: Number(canvas.dataset.pointerGlowRadius),
      pointerGlowOpacity: Number(canvas.dataset.pointerGlowOpacity),
      pointerGlowIntensity: Number(canvas.dataset.pointerGlowIntensity),
      pointerTileCount: Number(canvas.dataset.pointerTileCount),
      pointerTileIntensitySpread: Number(canvas.dataset.pointerTileIntensitySpread),
      pointerTileIntensitySample: canvas.dataset.pointerTileIntensitySample,
      pointerShapeSignature: canvas.dataset.pointerShapeSignature,
      pointerShapeExtents: canvas.dataset.pointerShapeExtents,
      hoveredTile: Number(canvas.dataset.hoveredTile)
    };
  }, { tileSize: TILE_SIZE, tileGap: TILE_GAP });
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({
      viewport: { width: 900, height: 700 },
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      deviceScaleFactor: 1
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
      localStorage.setItem('mdw-theme', 'dark');
      localStorage.setItem('mdw-lang', 'ja');
    });

    const page = await context.newPage();
    await page.clock.install();
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-philosophy-tiles]');
      return canvas && canvas.width > 0 && canvas.dataset.reducedMotion === 'true';
    });
    const pageTime = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(pageTime + 1000);

    const idle = await readTileSamples(page);
    assert(
      idle.alpha.center <= 0.008 && idle.idleOpacity <= 0.0015,
      'Idle tile remained visibly opaque',
      idle
    );

    await page.mouse.move(idle.pointer.x, idle.pointer.y);
    await page.clock.runFor(80);
    const enteringGlow = await readTileSamples(page);
    assert(
      enteringGlow.alpha.center >= 0.003 && enteringGlow.alpha.center < 0.45 &&
      enteringGlow.pointerGlowOpacity > 0 && enteringGlow.pointerGlowOpacity < 1,
      'Pointer glow appeared immediately instead of fading in',
      enteringGlow
    );
    await page.clock.runFor(320);
    const glow = await readTileSamples(page);
    const [topExtent, , bottomExtent] = parseNumericList(glow.pointerShapeExtents);
    assert(glow.pointerGlowRadius === 72, 'Pointer glow radius changed unexpectedly', glow);
    assert(
      glow.alpha.center >= 0.6 &&
      glow.alpha.near >= 0.3 &&
      glow.alpha.middle >= 0.005 &&
      glow.alpha.center > glow.alpha.near &&
      glow.alpha.near > glow.alpha.middle &&
      glow.alpha.middle > glow.alpha.outside &&
      glow.alpha.outside < 0.02 &&
      topExtent >= bottomExtent + 10,
      'Pointer glow did not form an upward-biased fading range',
      glow
    );

    await page.mouse.move(idle.pointer.x + 180, idle.pointer.y);
    await page.clock.runFor(80);
    const movementFading = await readTileSamples(page);
    assert(
      movementFading.alpha.center > 0.05 && movementFading.alpha.center < glow.alpha.center,
      'Tiles at the previous pointer position did not fade after pointer movement',
      { glow, movementFading }
    );
    await page.clock.runFor(650);
    const movementCleared = await readTileSamples(page);
    assert(
      movementCleared.alpha.center <= 0.02,
      'Tiles at the previous pointer position remained after the movement fade completed',
      movementCleared
    );

    await page.mouse.move(idle.pointer.x, idle.pointer.y);
    await page.clock.runFor(400);
    const restoredGlow = await readTileSamples(page);

    await page.mouse.move(idle.pointer.x, page.viewportSize().height + 20);
    await page.clock.runFor(120);
    const fading = await readTileSamples(page);
    assert(
      fading.pointerGlowOpacity > 0 && fading.pointerGlowOpacity < restoredGlow.pointerGlowOpacity,
      'Pointer glow did not begin fading after leaving the browser',
      { restoredGlow, fading }
    );
    await page.clock.runFor(280);
    const cleared = await readTileSamples(page);
    assert(
      cleared.pointerGlowOpacity === 0 && cleared.alpha.center <= 0.008 && cleared.hoveredTile === -1,
      'Pointer glow remained after its browser-leave fade completed',
      cleared
    );

    await page.mouse.move(idle.pointer.x + TILE_GAP + TILE_SIZE, idle.pointer.y);
    await page.clock.runFor(80);
    const reenteredGlow = await readTileSamples(page);
    assert(
      reenteredGlow.pointerTileCount > 0 &&
      reenteredGlow.pointerGlowOpacity > 0 && reenteredGlow.pointerGlowOpacity < 1,
      'Pointer glow did not fade back in after re-entering from a completed fade-out',
      reenteredGlow
    );

    await context.close();

    const motionContext = await browser.newContext({
      viewport: { width: 900, height: 700 },
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
      deviceScaleFactor: 1
    });
    await motionContext.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });
    await motionContext.addInitScript(() => {
      localStorage.setItem('mdw-theme', 'dark');
      localStorage.setItem('mdw-lang', 'ja');
    });
    const motionPage = await motionContext.newPage();
    await motionPage.clock.install();
    await motionPage.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
    await motionPage.waitForFunction(() => {
      const canvas = document.querySelector('[data-philosophy-tiles]');
      return canvas && canvas.width > 0 && canvas.dataset.reducedMotion === 'false';
    });
    const motionPageTime = await motionPage.evaluate(() => Date.now());
    await motionPage.clock.pauseAt(motionPageTime + 1000);
    const motionIdle = await readTileSamples(motionPage);
    await motionPage.mouse.move(motionIdle.pointer.x, motionIdle.pointer.y);
    await motionPage.clock.runFor(220);
    const firstIntensityState = await readTileSamples(motionPage);
    await motionPage.clock.runFor(700);
    const secondIntensityState = await readTileSamples(motionPage);
    const firstShapeSignature = parseNumericList(firstIntensityState.pointerShapeSignature);
    const secondShapeSignature = parseNumericList(secondIntensityState.pointerShapeSignature);
    const largestShapeChange = Math.max(...firstShapeSignature.map((value, index) => (
      Math.abs(value - secondShapeSignature[index])
    )));
    const firstIntensitySamples = parseIntensitySample(firstIntensityState.pointerTileIntensitySample);
    const secondIntensitySamples = parseIntensitySample(secondIntensityState.pointerTileIntensitySample);
    const matchingTiles = Array.from(firstIntensitySamples.keys()).filter((index) => (
      secondIntensitySamples.has(index)
    ));
    const largestTileChange = Math.max(
      0,
      ...matchingTiles.map((index) => (
        Math.abs(firstIntensitySamples.get(index) - secondIntensitySamples.get(index))
      ))
    );
    assert(
      firstIntensityState.pointerTileIntensitySpread >= 0.12 &&
      secondIntensityState.pointerTileIntensitySpread >= 0.12 &&
      matchingTiles.length >= 4 &&
      largestTileChange >= 0.025 &&
      largestShapeChange >= 0.1,
      'Pointer-lit tiles or their organic outline did not vary independently over time',
      {
        firstIntensityState,
        secondIntensityState,
        matchingTiles,
        largestTileChange,
        largestShapeChange
      }
    );
    await motionContext.close();

    console.log('Home Philosophy tiles form an organic flame, vary independently, fade after movement, and clear after browser leave.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
