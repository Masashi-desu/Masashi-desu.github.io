/**
 * テスト概要:
 *  - 目的: RetreatScreen のスマホ表示が初回の可視領域に安定して収まり、本家同様にタイトル下から上詰めされ、極端な縦長表示だけ本家比率へ戻ることを確認する。
 *  - 期待値: 通常のスマホではパネル高が初回 visualViewport 高と一致し、ブラウザバーの開閉に伴う同一幅の resize / scroll では変化しない。向き変更では再計測し、縦横比 9:20 以下では 796 × 850 比率を上限にする。スマホ縦持ちのタイトル行からアイコン一覧までを 24〜52px に保ち、ネイティブ比率時は各部品を本家寸法から 1.1px 以内にする。
 *  - 検証方法: ローカル静的サーバーで RetreatScreen を配信し、Playwright Chromium / WebKit の複数 viewport で主要要素の矩形、段組み、タイトル下余白、ネイティブスケールを取得する。iOS 内蔵ブラウザ相当のケースでは visualViewport をレイアウト viewport より低くし、同一幅の高さ変更では固定、orientationchange 後だけ再追従することも再現する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const VIEWPORTS = [
  { name: 'browser-comment', width: 380, height: 619, columns: 3, followsViewport: true, minHeaderGridGap: 40, maxHeaderGridGap: 52 },
  { name: 'ios-in-app-browser', width: 402, height: 874, initialVisibleHeight: 619, browserBarHiddenHeight: 700, orientationVisibleHeight: 650, expectedVisibleHeight: 650, columns: 3, followsViewport: true, minHeaderGridGap: 40, maxHeaderGridGap: 52 },
  { name: 'iphone-17-pro', width: 402, height: 874, columns: 3, followsViewport: true, minHeaderGridGap: 40, maxHeaderGridGap: 52 },
  { name: 'compact-portrait', width: 320, height: 568, columns: 3, followsViewport: true, minHeaderGridGap: 38, maxHeaderGridGap: 50 },
  { name: 'comment-tall-browser', width: 543, height: 1323, columns: 3, clampsOriginalRatio: true, minHeaderGridGap: 40, maxHeaderGridGap: 52 },
  { name: 'brave-tall-boundary', width: 768, height: 1710, columns: 6, clampsOriginalRatio: true },
  { name: 'extreme-tall-browser', width: 380, height: 1000, columns: 3, clampsOriginalRatio: true, minHeaderGridGap: 24, maxHeaderGridGap: 52 },
  { name: 'compact-landscape', width: 667, height: 375, columns: 6, maxTitleGap: 48, followsViewport: true },
  { name: 'wide-responsive', width: 705, height: 619, columns: 6, minTitleGap: 56, maxTitleGap: 72, followsViewport: true },
  { name: 'original-proportion', width: 796, height: 1000, columns: 6, minTitleGap: 48, maxTitleGap: 80, clampsOriginalRatio: true, nativeMetrics: true },
  { name: 'browser-comment-native', width: 869, height: 1323, columns: 6, minTitleGap: 52, maxTitleGap: 76, clampsOriginalRatio: true, nativeMetrics: true }
];
const LAYOUT_TOLERANCE = 1;
const ORIGINAL_PANEL_HEIGHT_RATIO = 850 / 796;
const BROWSER_ENGINE = process.env.RETREATSCREEN_BROWSER || 'chromium';
const BROWSER_TYPES = { chromium, webkit };

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
      '.svg': 'image/svg+xml',
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

function assertLayout(viewport, state) {
  const expectedViewportHeight = viewport.expectedVisibleHeight ?? viewport.initialVisibleHeight ?? viewport.height;
  const maxBottom = expectedViewportHeight + LAYOUT_TOLERANCE;
  if (state.launcher.bottom > maxBottom || state.screen.bottom > maxBottom) {
    throw new Error(`Launcher exceeded ${viewport.name} viewport: ${JSON.stringify(state)}`);
  }
  if (
    state.panel.top < state.screen.top - LAYOUT_TOLERANCE ||
    state.panel.bottom > state.screen.bottom + LAYOUT_TOLERANCE ||
    state.grid.bottom > state.dots.top + LAYOUT_TOLERANCE
  ) {
    throw new Error(`Launcher content did not fit ${viewport.name}: ${JSON.stringify(state)}`);
  }
  const minTitleGap = viewport.minTitleGap ?? 0;
  if (viewport.maxTitleGap != null && (state.titleToIconGap < minTitleGap || state.titleToIconGap > viewport.maxTitleGap)) {
    throw new Error(`Title/icon spacing was too large on ${viewport.name}: ${JSON.stringify(state)}`);
  }
  if (viewport.followsViewport && Math.abs(state.launcher.height - expectedViewportHeight) > LAYOUT_TOLERANCE) {
    throw new Error(`Launcher did not follow ${viewport.name} viewport height: ${JSON.stringify(state)}`);
  }
  if (viewport.clampsOriginalRatio) {
    const expectedHeight = Math.min(expectedViewportHeight, viewport.width * ORIGINAL_PANEL_HEIGHT_RATIO);
    if (Math.abs(state.launcher.height - expectedHeight) > LAYOUT_TOLERANCE) {
      throw new Error(`Launcher did not clamp to the original ratio on ${viewport.name}: ${JSON.stringify(state)}`);
    }
  }
  if (
    viewport.minHeaderGridGap != null &&
    (state.headerToGridGap < viewport.minHeaderGridGap || state.headerToGridGap > viewport.maxHeaderGridGap)
  ) {
    throw new Error(`Mobile grid did not follow the title row on ${viewport.name}: ${JSON.stringify(state)}`);
  }
  if (state.columns !== viewport.columns) {
    throw new Error(`Unexpected grid columns on ${viewport.name}: ${JSON.stringify(state)}`);
  }
  if (viewport.nativeMetrics) {
    const nativeScale = Math.min(state.screen.width / 796, state.screen.height / 850);
    const expected = {
      close: 22 * nativeScale,
      titleFont: 28 * nativeScale,
      editFont: 13 * nativeScale,
      editWidth: 82 * nativeScale,
      editHeight: 33 * nativeScale,
      icon: 56 * nativeScale,
      itemWidth: 96 * nativeScale,
      itemHeight: 120 * nativeScale,
      columnGap: 20 * nativeScale,
      panelWidth: 676 * nativeScale,
      panelHeight: 590 * nativeScale
    };
    const actual = {
      close: state.close.width,
      titleFont: state.titleFont,
      editFont: state.editFont,
      editWidth: state.edit.width,
      editHeight: state.edit.height,
      icon: state.icon.width,
      itemWidth: state.item.width,
      itemHeight: state.item.height,
      columnGap: state.columnGap,
      panelWidth: state.panel.width,
      panelHeight: state.panel.height
    };
    for (const [metric, expectedValue] of Object.entries(expected)) {
      if (Math.abs(actual[metric] - expectedValue) > 1.1) {
        throw new Error(`Native ${metric} metric drifted on ${viewport.name}: ${JSON.stringify({ expected, actual, state })}`);
      }
    }
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browserType = BROWSER_TYPES[BROWSER_ENGINE];
  if (!browserType) {
    throw new Error(`Unsupported browser engine: ${BROWSER_ENGINE}`);
  }
  const browser = await browserType.launch();

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: 'dark',
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true
      });
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname === '127.0.0.1' && request.resourceType() !== 'media') {
          await route.continue();
          return;
        }
        if (request.resourceType() === 'stylesheet') {
          await route.fulfill({
            status: 200,
            contentType: 'text/css',
            body: '*,*::before,*::after{box-sizing:border-box}body{margin:0;}'
          });
          return;
        }
        await route.fulfill({ status: 204, body: '' });
      });
      await context.addInitScript(({ initialVisibleHeight }) => {
        try {
          localStorage.setItem('mdw-theme', 'dark');
          localStorage.setItem('mdw-lang', 'en');
        } catch (error) {
          // ignore storage write errors
        }
        if (initialVisibleHeight && window.visualViewport) {
          window.__retreatTestVisibleViewportHeight = initialVisibleHeight;
          Object.defineProperty(window.visualViewport, 'height', {
            configurable: true,
            get: () => window.__retreatTestVisibleViewportHeight
          });
        }
      }, { initialVisibleHeight: viewport.initialVisibleHeight });

      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/products/RetreatScreen/index.html`, {
        waitUntil: 'domcontentloaded'
      });
      await page.waitForSelector('[data-launcher-item="download"] .retreat-app-icon', { state: 'visible' });

      if (viewport.browserBarHiddenHeight) {
        const initialLauncherHeight = await page.locator('#launcher').evaluate((launcher) => (
          launcher.getBoundingClientRect().height
        ));
        await page.evaluate((visibleHeight) => {
          window.__retreatTestVisibleViewportHeight = visibleHeight;
          window.dispatchEvent(new Event('resize'));
          window.visualViewport.dispatchEvent(new Event('resize'));
          window.visualViewport.dispatchEvent(new Event('scroll'));
        }, viewport.browserBarHiddenHeight);
        await page.evaluate(() => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        const stableLauncherHeight = await page.locator('#launcher').evaluate((launcher) => (
          launcher.getBoundingClientRect().height
        ));
        if (Math.abs(stableLauncherHeight - initialLauncherHeight) > LAYOUT_TOLERANCE) {
          throw new Error(`Launcher followed browser chrome on ${viewport.name}: ${JSON.stringify({ initialLauncherHeight, stableLauncherHeight })}`);
        }
      }

      if (viewport.orientationVisibleHeight) {
        await page.evaluate((visibleHeight) => {
          window.__retreatTestVisibleViewportHeight = visibleHeight;
          window.dispatchEvent(new Event('orientationchange'));
        }, viewport.orientationVisibleHeight);
        await page.evaluate(() => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
      }

      const state = await page.evaluate(() => {
        const rect = (selector) => {
          const element = document.querySelector(selector);
          const bounds = element.getBoundingClientRect();
          return {
            top: Number(bounds.top.toFixed(2)),
            bottom: Number(bounds.bottom.toFixed(2)),
            width: Number(bounds.width.toFixed(2)),
            height: Number(bounds.height.toFixed(2))
          };
        };
        const title = rect('.retreat-title');
        const firstIcon = rect('[data-launcher-item="download"] .retreat-app-icon');
        const firstItem = rect('[data-launcher-item="download"]');
        const header = rect('.retreat-launcher-header');
        const grid = rect('.retreat-app-grid-viewport');
        const dots = rect('.retreat-page-dots');
        const appPage = document.querySelector('[data-launcher-page="1"]');
        const titleStyle = getComputedStyle(document.querySelector('.retreat-title'));
        const editStyle = getComputedStyle(document.querySelector('.retreat-edit-toggle'));
        const appPageStyle = getComputedStyle(appPage);
        return {
          launcher: rect('#launcher'),
          screen: rect('.retreat-screen'),
          panel: rect('.retreat-launcher-panel__content'),
          grid,
          dots,
          header,
          close: rect('.retreat-close'),
          edit: rect('.retreat-edit-toggle'),
          icon: firstIcon,
          item: firstItem,
          titleFont: Number.parseFloat(titleStyle.fontSize),
          editFont: Number.parseFloat(editStyle.fontSize),
          columnGap: Number.parseFloat(appPageStyle.columnGap),
          titleToIconGap: Number((firstIcon.top - title.bottom).toFixed(2)),
          headerToGridGap: Number((grid.top - header.bottom).toFixed(2)),
          gridToDotsGap: Number((dots.top - grid.bottom).toFixed(2)),
          columns: appPageStyle.gridTemplateColumns.split(' ').length
        };
      });

      assertLayout(viewport, state);
      await context.close();
    }

    console.log(`RetreatScreen mobile launcher panel fits tested viewports in ${BROWSER_ENGINE}.`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
