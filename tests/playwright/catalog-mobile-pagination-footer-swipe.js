/**
 * テスト概要:
 *  - 目的: 製品一覧ページのスマホ操作で、細い pagination/footer セグメントからの縦スワイプが
 *    1 セグメントずつ移動し、footer から上へ戻る際に product section まで飛ばないことを確認する。
 *  - 期待値: footer 内からの上スワイプは pagination に停止し、pagination から下は footer、
 *    pagination から上は最後の product section に停止する。中途半端な停止位置も最寄りの
 *    pagination/footer 停止点へ自己修復され、active nav と scrollY が一致する。
 *  - 検証方法: ローカル静的サーバーで /products/ を配信し、Playwright WebKit の iPhone context で
 *    対象要素へ合成 TouchEvent を dispatch して、scrollY・active target・各セグメントの距離を取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { webkit, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const SECTION_TOLERANCE = 4;

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

async function dispatchSwipeOnSelector(page, selector, startY, endY, steps = 14) {
  await page.evaluate(async ({ selector, startY, endY, steps }) => {
    const target = document.querySelector(selector);
    if (!target) {
      throw new Error(`Missing swipe target: ${selector}`);
    }
    const x = Math.round(window.innerWidth / 2);
    const fire = (type, y) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      event.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
      target.dispatchEvent(event);
      return event;
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    fire('touchstart', startY);
    for (let index = 1; index <= steps; index += 1) {
      const y = startY + ((endY - startY) * index) / steps;
      fire('touchmove', y);
      await wait(16);
    }
    fire('touchend', endY);
  }, { selector, startY, endY, steps });
}

async function waitForAnimationFrames(page, frameCount) {
  await page.evaluate((count) => new Promise((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }), frameCount);
}

async function getCatalogState(page) {
  return page.evaluate(() => {
    const active = document.querySelector(
      '.catalog-section-nav__icon-button.is-active, .catalog-section-nav__number.is-active, .catalog-section-nav__footer-link.is-active'
    );
    const pagination = document.getElementById('catalog-pagination-section');
    const footer = document.getElementById('catalog-footer');
    const productSections = Array.from(document.querySelectorAll('[data-catalog-section="product"]'));
    const lastProduct = productSections[productSections.length - 1] || null;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const paginationScrollTop = pagination
      ? Math.max(0, Math.round(pagination.getBoundingClientRect().bottom + window.scrollY - viewportHeight))
      : null;
    return {
      scrollY: Math.round(window.scrollY),
      activeTarget: active
        ? active.dataset.sectionTarget || active.dataset.paginationTarget || active.dataset.footerTarget
        : null,
      lastProductTarget: lastProduct ? lastProduct.id : null,
      lastProductTop: lastProduct ? Number(lastProduct.getBoundingClientRect().top.toFixed(2)) : null,
      paginationDistance: paginationScrollTop === null ? null : Math.abs(Math.round(window.scrollY) - paginationScrollTop),
      paginationTop: pagination ? Number(pagination.getBoundingClientRect().top.toFixed(2)) : null,
      footerTop: footer ? Number(footer.getBoundingClientRect().top.toFixed(2)) : null,
      distanceFromBottom: Math.round(documentHeight - (window.scrollY + viewportHeight))
    };
  });
}

function assertPaginationState(state, label) {
  if (state.activeTarget !== 'catalog-pagination-section') {
    throw new Error(`[${label}] Expected pagination nav active, got ${state.activeTarget}: ${JSON.stringify(state)}`);
  }
  if (state.paginationDistance === null || state.paginationDistance > SECTION_TOLERANCE) {
    throw new Error(`[${label}] Expected pagination scroll stop, got ${JSON.stringify(state)}`);
  }
}

function assertFooterState(state, label) {
  if (state.activeTarget !== 'catalog-footer') {
    throw new Error(`[${label}] Expected footer nav active, got ${state.activeTarget}: ${JSON.stringify(state)}`);
  }
  if (state.distanceFromBottom > SECTION_TOLERANCE) {
    throw new Error(`[${label}] Expected footer bottom stop, got ${JSON.stringify(state)}`);
  }
}

function assertLastProductState(state, label) {
  if (!state.lastProductTarget || state.activeTarget !== state.lastProductTarget) {
    throw new Error(`[${label}] Expected last product nav active, got ${state.activeTarget}: ${JSON.stringify(state)}`);
  }
  if (state.lastProductTop === null || Math.abs(state.lastProductTop) > SECTION_TOLERANCE) {
    throw new Error(`[${label}] Expected last product section top near 0px, got ${JSON.stringify(state)}`);
  }
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
    await page.waitForSelector('#footer-language', { timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('[data-catalog-section="product"]').length >= 1);
    await page.waitForTimeout(500);

    const scrollControl = await page.evaluate(() => ({
      touchAction: getComputedStyle(document.documentElement).touchAction,
      scrollSnapType: getComputedStyle(document.documentElement).scrollSnapType,
      coarsePointer: window.matchMedia('(any-pointer: coarse)').matches
    }));
    if (!scrollControl.touchAction.includes('pan-x')) {
      throw new Error(`Expected catalog html touch-action to include pan-x, got "${scrollControl.touchAction}"`);
    }
    if (!scrollControl.coarsePointer) {
      throw new Error('Expected the emulated iPhone context to report a coarse pointer');
    }
    if (scrollControl.scrollSnapType !== 'none') {
      throw new Error(`Expected catalog CSS scroll snap to be disabled under JS touch control, got "${scrollControl.scrollSnapType}"`);
    }

    await page.click('.catalog-section-nav__footer-link');
    await page.waitForTimeout(1300);
    assertFooterState(await getCatalogState(page), 'nav click to footer');
    await waitForAnimationFrames(page, 40);

    await page.evaluate(() => {
      const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const footerHeight = document.getElementById('catalog-footer').offsetHeight;
      window.scrollTo({
        left: 0,
        top: documentHeight - window.innerHeight - Math.round(footerHeight * 0.55),
        behavior: 'auto'
      });
    });
    await dispatchSwipeOnSelector(page, '#catalog-footer', 190, 650);
    await page.waitForTimeout(1300);
    assertPaginationState(await getCatalogState(page), 'partial footer upward swipe');
    await waitForAnimationFrames(page, 40);

    await dispatchSwipeOnSelector(page, '#catalog-pagination-section', 650, 190);
    await page.waitForTimeout(1300);
    assertFooterState(await getCatalogState(page), 'pagination downward swipe');
    await waitForAnimationFrames(page, 40);

    await dispatchSwipeOnSelector(page, '#catalog-footer', 190, 650);
    await page.waitForTimeout(1300);
    assertPaginationState(await getCatalogState(page), 'footer upward swipe');
    await waitForAnimationFrames(page, 40);

    await dispatchSwipeOnSelector(page, '#catalog-pagination-section', 190, 650);
    await page.waitForTimeout(1300);
    assertLastProductState(await getCatalogState(page), 'pagination upward swipe');
    await waitForAnimationFrames(page, 40);

    await page.evaluate(() => {
      document.documentElement.style.scrollSnapType = 'none';
      const pagination = document.getElementById('catalog-pagination-section');
      const footer = document.getElementById('catalog-footer');
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const paginationTop = Math.max(0, Math.round(pagination.getBoundingClientRect().bottom + window.scrollY - viewportHeight));
      const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const footerTop = Math.max(0, Math.round(documentHeight - viewportHeight));
      window.scrollTo({
        left: 0,
        top: Math.round(paginationTop + ((footerTop - paginationTop) * 0.45)),
        behavior: 'auto'
      });
    });
    await page.waitForTimeout(1500);
    assertPaginationState(await getCatalogState(page), 'unmanaged stop near pagination');
    await waitForAnimationFrames(page, 40);

    await page.evaluate(() => {
      document.documentElement.style.scrollSnapType = 'none';
      const pagination = document.getElementById('catalog-pagination-section');
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const paginationTop = Math.max(0, Math.round(pagination.getBoundingClientRect().bottom + window.scrollY - viewportHeight));
      const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const footerTop = Math.max(0, Math.round(documentHeight - viewportHeight));
      window.scrollTo({
        left: 0,
        top: Math.round(paginationTop + ((footerTop - paginationTop) * 0.65)),
        behavior: 'auto'
      });
    });
    await page.waitForTimeout(1500);
    assertFooterState(await getCatalogState(page), 'unmanaged stop near footer');

    await page.evaluate(() => {
      document.documentElement.style.scrollSnapType = '';
    });

    console.log('Catalog mobile pagination/footer swipe stays on adjacent stops.');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
