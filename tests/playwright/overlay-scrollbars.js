/**
 * 目的: 共通スクロールバーがコンテンツ領域を縮めず、縦横のスクロール位置に追従することを確認する。
 * 期待値: スクロールできる方向だけに幅5pxのつまみが重なり、ドラッグで両端に移動できる。
 * 検証方法: Chromium/WebKitで両軸スクロールするfixture、製品一覧、Surroundを開き、寸法、位置、ポインター操作を確認する。
 */
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { CatalogPage } = require('./pages/catalog-page');
const { SurroundPage } = require('./pages/surround-page');
const { startServer } = require('./support/static-server');

const viewport = { width: 900, height: 650 };
const fixture = `<!doctype html>
<link rel="stylesheet" href="/theme.css">
<style>
  html { overflow: auto; }
  body { margin: 0; min-width: 1800px; min-height: 1300px; }
  main { position: relative; margin: 20px; }
  #pane { width: 280px; height: 200px; overflow: auto; }
  #content { width: 560px; height: 600px; }
</style>
<main><div id="pane" data-overlay-scroll><div id="content"></div></div></main>
<script src="/shared/overlay-scrollbars.js"></script>`;

async function dragToEnd(page, layer, thumb, axis) {
  const horizontal = axis === 'x';
  const position = await thumb.boundingBox();
  const track = await layer.boundingBox();
  const start = { x: position.x + position.width / 2, y: position.y + position.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(horizontal ? track.x + track.width - 1 : start.x,
    horizontal ? start.y : track.y + track.height - 1, { steps: 8 });
  await page.mouse.up();
}

async function checkAxis(page, target, layer, axis) {
  const thumb = layer.locator(`.overlay-scrollbar--${axis}`);
  const horizontal = axis === 'x';
  const offset = horizontal ? 'scrollLeft' : 'scrollTop';
  const scrollSize = horizontal ? 'scrollWidth' : 'scrollHeight';
  const clientSize = horizontal ? 'clientWidth' : 'clientHeight';
  const position = await thumb.boundingBox();
  assert.ok(position, `${axis} scrollbar should appear`);
  assert.equal(await thumb.evaluate((element, axis) => {
    const style = getComputedStyle(element, '::before');
    return axis === 'x' ? style.height : style.width;
  }, axis), '5px');

  const maximum = await target.evaluate((element, sizes) => element[sizes[0]] - element[sizes[1]], [scrollSize, clientSize]);
  await dragToEnd(page, layer, thumb, axis);
  await target.evaluate(async (element, { offset, maximum }) => {
    if (Math.abs(element[offset] - maximum) > 1) throw new Error(`Drag ended at ${element[offset]} instead of ${maximum}`);
  }, { offset, maximum });

  const coordinate = horizontal ? 'x' : 'y';
  const size = horizontal ? 'width' : 'height';
  await thumb.evaluate((element, { coordinate, size }) => new Promise((resolve, reject) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const thumb = element.getBoundingClientRect();
      const track = element.parentElement.getBoundingClientRect();
      const endGap = track[coordinate] + track[size] - thumb[coordinate] - thumb[size];
      if (Math.abs(endGap - 15) > 1) reject(new Error(`Unexpected end gap: ${endGap}`));
      else resolve();
    }));
  }), { coordinate, size });
}

async function checkFixture(page, base) {
  await page.route('**/scrollbar-fixture', route => route.fulfill({ body: fixture, contentType: 'text/html' }));
  await page.goto(`${base}/scrollbar-fixture`);
  const pane = page.locator('#pane');
  const paneLayer = page.locator('#pane + .overlay-scrollbars');
  const documentLayer = page.locator('.overlay-scrollbars--page');
  assert.deepEqual(await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.clientHeight]),
    [viewport.width, viewport.height]);
  assert.deepEqual(await pane.evaluate(element => [element.clientWidth, element.clientHeight]), [280, 200]);
  assert.deepEqual(await paneLayer.boundingBox(), await pane.boundingBox());
  assert.deepEqual(await page.evaluate(() => {
    const hit = document.elementFromPoint(100, 100);
    return [hit?.id, document.querySelector('#pane + .overlay-scrollbars').getAttribute('aria-hidden')];
  }), ['content', 'true']);

  await checkAxis(page, pane, paneLayer, 'x');
  await checkAxis(page, pane, paneLayer, 'y');
  await checkAxis(page, page.locator('html'), documentLayer, 'x');
  await checkAxis(page, page.locator('html'), documentLayer, 'y');
  await page.locator('#content').evaluate(element => { element.parentElement.replaceChildren('Fits in the viewport'); });
  await paneLayer.locator('.overlay-scrollbar--x').waitFor({ state: 'hidden' });
  await paneLayer.locator('.overlay-scrollbar--y').waitFor({ state: 'hidden' });
}

async function main() {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const type of [chromium, webkit]) {
      const browser = await type.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await checkFixture(page, base);

        const catalog = new CatalogPage(page);
        await page.goto(`${base}/products/`, { waitUntil: 'domcontentloaded' });
        await catalog.numberTabs.first().waitFor();
        await catalog.numberTabs.first().click();
        await page.waitForFunction(() => document.querySelector('.catalog-section-nav__number')?.getAttribute('aria-current') === 'true');
        assert.deepEqual(errors, []);

        // Keep the 3D renderer out of this check so the feature exit can be tested on its own.
        await page.route('**/surround-3d.js', route => route.fulfill({ body: '', contentType: 'text/javascript' }));
        const surround = new SurroundPage(page);
        await page.goto(`${base}/products/Surround1x0-AKDK/`, { waitUntil: 'domcontentloaded' });
        await surround.featureTab.waitFor();
        const layer = page.locator('.overlay-scrollbars--page');
        const thumb = layer.locator('.overlay-scrollbar--y');
        await thumb.waitFor();
        await dragToEnd(page, layer, thumb, 'y');
        await page.waitForFunction(() => {
          const root = document.scrollingElement;
          return Math.abs(root.scrollTop - (root.scrollHeight - root.clientHeight)) <= 1
            && !root.hasAttribute('data-overlay-scroll-dragging');
        });
        // The free range is part of the page thumb's travel. A drag
        // beginning inside the range stays within it for that gesture.
        await surround.showSection(2);
        await page.waitForFunction(() => window.MDWSurroundNavigation?.isSettled());
        const featureScroll = page.locator('.surround-feature-scroll');
        const nestedThumb = page.locator('.surround-feature-scroll + .overlay-scrollbars .overlay-scrollbar--y');
        await nestedThumb.waitFor({ state: 'hidden' });
        const bounds = await featureScroll.evaluate(async (element) => {
          element.scrollTop = 0;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return { maximum: element.scrollHeight - element.clientHeight, documentTop: window.scrollY };
        });
        const initialThumb = await thumb.boundingBox();
        await featureScroll.evaluate((element, maximum) => { element.scrollTop = maximum / 2; }, bounds.maximum);
        await page.waitForFunction((initialY) => document.querySelector('.overlay-scrollbars--page .overlay-scrollbar--y')
          .getBoundingClientRect().y > initialY + 5, initialThumb.y);
        await dragToEnd(page, layer, thumb, 'y');
        assert.ok(Math.abs(await featureScroll.evaluate(element => element.scrollTop) - bounds.maximum) <= 1);
        assert.equal(await page.evaluate(() => scrollY), bounds.documentTop);
        // A fresh outward drag at the boundary can reach document end.
        await dragToEnd(page, layer, thumb, 'y');
        await page.waitForFunction(() => {
          const root = document.scrollingElement;
          return Math.abs(root.scrollTop - (root.scrollHeight - root.clientHeight)) <= 1;
        });
        assert.deepEqual(errors, []);
        console.log(`Overlay scrollbar geometry and drag passed in ${type.name()}.`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
