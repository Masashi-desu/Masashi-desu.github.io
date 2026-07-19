/**
 * テスト概要:
 *  - 目的: RetreatScreen の編集モード中に各アイコンがリンク／押下対象として動作しないことを確認する。
 *  - 期待値: 編集中は href、リンク role、tab 順、ページ遷移属性、ホバー効果が無効になり、編集終了後は元のリンク状態へ復元する。
 *  - 検証方法: ローカル静的サーバーで RetreatScreen を開き、Chromium / WebKit で編集開始、アイコンクリック、言語変更、編集終了を順に操作して DOM 属性、URL、フォーカス、算出スタイルを取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
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
    const types = {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.mp4': 'video/mp4',
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readActionState(page) {
  return page.evaluate(() => Object.fromEntries(
    Array.from(document.querySelectorAll('[data-launcher-item]')).map((item) => {
      const link = item.querySelector('.retreat-app-link');
      return [item.dataset.launcherItem, {
        href: link.getAttribute('href'),
        pressable: link.getAttribute('data-pressable'),
        role: link.getAttribute('role'),
        tabIndex: link.tabIndex,
        transitionDirection: link.getAttribute('data-transition-direction')
      }];
    })
  ));
}

function assertEditingActionsDisabled(state) {
  Object.entries(state).forEach(([name, action]) => {
    assert(action.href === null, `${name} retained href in edit mode: ${JSON.stringify(action)}`);
    assert(action.pressable === null, `${name} retained data-pressable in edit mode: ${JSON.stringify(action)}`);
    assert(action.role === 'presentation', `${name} retained action semantics in edit mode: ${JSON.stringify(action)}`);
    assert(action.tabIndex === -1, `${name} remained in the tab order in edit mode: ${JSON.stringify(action)}`);
    assert(action.transitionDirection === null, `${name} retained page transition behavior in edit mode: ${JSON.stringify(action)}`);
  });
}

async function readIconEffect(page, itemName) {
  return page.locator(`[data-launcher-item="${itemName}"] .retreat-app-icon`).evaluate((icon) => {
    const style = getComputedStyle(icon);
    return {
      boxShadow: style.boxShadow,
      filter: style.filter
    };
  });
}

async function main() {
  const browserType = BROWSER_TYPES[BROWSER_ENGINE];
  if (!browserType) {
    throw new Error(`Unsupported RETREATSCREEN_BROWSER: ${BROWSER_ENGINE}`);
  }

  const server = await startServer();
  const port = server.address().port;
  const browser = await browserType.launch({ headless: true });

  try {
    const context = await browser.newContext({ viewport: { width: 880, height: 916 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`http://127.0.0.1:${port}/products/RetreatScreen/index.html?from=home`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForSelector('[data-launcher-item="features"] .retreat-app-icon', { state: 'visible' });

    const normalState = await readActionState(page);
    assert(normalState.features.href === '#details', `Features link did not start active: ${JSON.stringify(normalState.features)}`);
    assert(normalState.products.href === '../../index.html#products-section', `Dynamic home link was not initialized: ${JSON.stringify(normalState.products)}`);
    assert(await page.getByRole('link', { name: 'Features' }).count() === 1, 'Features was not exposed as a link in normal mode.');

    await page.locator('#retreat-edit-toggle').click();
    await page.waitForSelector('#retreat-app-grid.is-editing');

    assertEditingActionsDisabled(await readActionState(page));
    assert(await page.getByRole('link', { name: 'Features' }).count() === 0, 'Features remained exposed as a link in edit mode.');

    await page.mouse.move(4, 4);
    const effectBeforeHover = await readIconEffect(page, 'features');
    await page.locator('[data-launcher-item="features"] .retreat-app-link').hover();
    const effectAfterHover = await readIconEffect(page, 'features');
    assert(
      JSON.stringify(effectAfterHover) === JSON.stringify(effectBeforeHover),
      `Edit mode retained the link hover effect: ${JSON.stringify({ effectBeforeHover, effectAfterHover })}`
    );

    const urlBeforeClick = page.url();
    await page.locator('[data-launcher-item="support"] .retreat-app-icon').click({ force: true });
    assert(page.url() === urlBeforeClick, `Support icon navigated during edit mode: ${page.url()}`);
    assert(
      await page.locator('[data-launcher-item="support"] .retreat-app-rename').evaluate((input) => input === document.activeElement),
      'Clicking an icon in edit mode did not focus its rename field.'
    );

    await page.evaluate(() => window.RetreatI18n.apply('en'));
    assertEditingActionsDisabled(await readActionState(page));

    await page.locator('#retreat-edit-toggle').click();
    await page.waitForSelector('#retreat-app-grid:not(.is-editing)');

    const restoredState = await readActionState(page);
    assert(restoredState.features.href === '#details', `Features link was not restored: ${JSON.stringify(restoredState.features)}`);
    assert(restoredState.features.pressable === 'true', `Features pressable state was not restored: ${JSON.stringify(restoredState.features)}`);
    assert(restoredState.features.role === null && restoredState.features.tabIndex === 0, `Features semantics were not restored: ${JSON.stringify(restoredState.features)}`);
    assert(restoredState.products.href === '../../index.html#products-section', `Dynamic home link was not restored: ${JSON.stringify(restoredState.products)}`);
    assert(restoredState.products.transitionDirection === 'left', `Dynamic home transition was not restored: ${JSON.stringify(restoredState.products)}`);
    assert(await page.getByRole('link', { name: 'Features' }).count() === 1, 'Features was not exposed as a link after editing.');

    await page.mouse.move(4, 4);
    const normalEffectBeforeHover = await readIconEffect(page, 'features');
    await page.locator('[data-launcher-item="features"] .retreat-app-link').hover();
    const normalEffectAfterHover = await readIconEffect(page, 'features');
    assert(
      JSON.stringify(normalEffectAfterHover) !== JSON.stringify(normalEffectBeforeHover),
      `Normal mode did not restore the link hover effect: ${JSON.stringify({ normalEffectBeforeHover, normalEffectAfterHover })}`
    );

    await page.locator('[data-launcher-item="features"] .retreat-app-icon').click();
    assert(new URL(page.url()).hash === '#details', `Features link did not navigate after editing: ${page.url()}`);
    assert(pageErrors.length === 0, `Page errors were reported: ${pageErrors.join(' | ')}`);

    await context.close();
    console.log(`RetreatScreen edit-mode actions verified in ${BROWSER_ENGINE}.`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
