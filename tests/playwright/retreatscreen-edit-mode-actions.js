/**
 * テスト概要:
 *  - 目的: RetreatScreen の編集モードで、一覧内編集を行わず本家同様の専用ウィンドウから名前・画像を変更できることを確認する。
 *  - 期待値: 編集中はリンク遷移とホバー効果が無効になり、アイコンが編集ボタンとして動作する一方、横スクロールによるページ送りは利用できる。変更は保存時だけ反映・永続化され、キャンセルでは破棄、元アイコン復元も保存時だけ反映される。
 *  - 検証方法: ローカル静的サーバーで RetreatScreen を開き、Chromium / WebKit で編集モード中の横スクロール、編集ウィンドウの表示、フォーカス、名前変更、PNG 選択、キャンセル、保存、再読み込み、元アイコン復元、編集終了を順に操作して DOM・URL・localStorage・算出スタイルを取得する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const ICON_FIXTURE = path.join(ROOT, 'products/RetreatScreen/icon.png');
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
    assert(action.role === 'button', `${name} was not exposed as an edit button: ${JSON.stringify(action)}`);
    assert(action.tabIndex === 0, `${name} edit button was missing from the tab order: ${JSON.stringify(action)}`);
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

async function scrollLauncherSurface(page, deltaX, expectedPage) {
  const bounds = await page.locator('.retreat-launcher-panel__content').boundingBox();
  assert(bounds, 'The launcher interaction surface did not have a bounding box.');
  await page.mouse.move(
    bounds.x + bounds.width * 0.75,
    bounds.y + bounds.height * 0.42
  );
  await page.mouse.wheel(deltaX, 0);
  await page.waitForFunction((pageNumber) => (
    window.RetreatLauncher.getState().currentPage === pageNumber
  ), expectedPage);
  await page.waitForFunction(() => (
    !document.querySelector('#retreat-app-grid').classList.contains('is-page-transitioning')
  ));
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
    const context = await browser.newContext({ viewport: { width: 880, height: 619 } });
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

    await page.setViewportSize({ width: 1101, height: 619 });
    await scrollLauncherSurface(page, 48, 2);
    assert(
      await page.locator('[data-page-target="2"]').getAttribute('aria-current') === 'page',
      'Horizontal scrolling on the launcher surface did not activate page 2 in normal mode.'
    );
    await page.waitForTimeout(400);
    await scrollLauncherSurface(page, -48, 1);
    assert(
      await page.locator('[data-page-target="1"]').getAttribute('aria-current') === 'page',
      'Horizontal scrolling on the launcher surface did not return to page 1 in normal mode.'
    );
    await page.waitForTimeout(400);

    await page.locator('#retreat-edit-toggle').click();
    await page.waitForSelector('#retreat-app-grid.is-editing');

    assertEditingActionsDisabled(await readActionState(page));
    assert(await page.getByRole('link', { name: 'Features' }).count() === 0, 'Features remained exposed as a link in edit mode.');
    assert(await page.locator('.retreat-app-rename').count() === 0, 'An inline icon rename field remained in the launcher list.');
    assert(await page.getByRole('button', { name: /Features/u }).count() === 1, 'Features was not exposed as an edit button.');

    await scrollLauncherSurface(page, 48, 2);
    assert(
      await page.locator('[data-page-target="2"]').getAttribute('aria-current') === 'page',
      'Horizontal scrolling did not activate page 2 while editing.'
    );
    assert(
      await page.locator('#retreat-app-grid').evaluate((element) => element.classList.contains('is-editing')),
      'Horizontal scrolling unexpectedly exited edit mode.'
    );
    await page.waitForTimeout(400);
    await scrollLauncherSurface(page, -48, 1);
    assert(
      await page.locator('[data-page-target="1"]').getAttribute('aria-current') === 'page',
      'Horizontal scrolling did not return to page 1 while editing.'
    );
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 880, height: 619 });

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
      await page.locator('#retreat-icon-editor-name').evaluate((input) => input === document.activeElement),
      'Clicking an icon in edit mode did not focus the editor name field.'
    );
    assert(await page.getByRole('dialog').isVisible(), 'Clicking an icon in edit mode did not open the icon editor.');
    assert(await page.getByRole('button', { name: 'Choose File' }).count() === 0, 'The hidden file input leaked into the accessibility tree.');
    const desktopDialogBounds = await page.locator('#retreat-icon-editor').boundingBox();
    assert(
      desktopDialogBounds && desktopDialogBounds.y >= 0 && desktopDialogBounds.y + desktopDialogBounds.height <= 619,
      `The editor did not fit the 880 × 619 browser-comment viewport: ${JSON.stringify(desktopDialogBounds)}`
    );
    assert(
      await page.locator('.retreat-launcher-header').evaluate((header) => header.inert),
      'Underlying launcher content remained interactive while the icon editor was open.'
    );
    assert(
      await page.locator('#retreat-content').evaluate((content) => content.inert),
      'Product-page content remained interactive while the icon editor was open.'
    );
    await page.locator('#retreat-icon-editor-cancel').click();
    await page.waitForSelector('#retreat-icon-editor-overlay', { state: 'hidden' });
    assert(
      await page.locator('[data-launcher-item="support"] .retreat-app-label').textContent() === 'Support',
      'Cancel changed the launcher label.'
    );

    await page.locator('[data-launcher-item="features"] .retreat-app-icon').click();
    await page.locator('#retreat-icon-editor-name').fill('');
    assert(await page.locator('#retreat-icon-editor-save').isDisabled(), 'Save remained enabled for an empty icon name.');
    await page.locator('#retreat-icon-editor-name').fill('Feature Lab');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#retreat-icon-editor-choose').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(ICON_FIXTURE);
    await page.waitForFunction(() => (
      document.querySelector('#retreat-icon-editor-preview img')?.getAttribute('src')?.startsWith('data:image/png')
    ));
    assert(
      (await page.locator('#retreat-icon-editor-selected').textContent()).includes('icon.png'),
      'The selected custom icon filename was not shown.'
    );
    await page.locator('#retreat-icon-editor-cancel').click();
    assert(
      await page.locator('[data-launcher-item="features"] .retreat-app-label').textContent() === 'Features',
      'Cancel applied the draft icon name.'
    );
    assert(
      await page.locator('[data-launcher-item="features"] .retreat-app-icon > i.ph-command').count() === 1,
      'Cancel applied the draft custom image.'
    );

    await page.locator('[data-launcher-item="features"] .retreat-app-icon').click();
    await page.locator('#retreat-icon-editor-name').fill('Feature Lab');
    await page.locator('#retreat-icon-editor-file').setInputFiles(ICON_FIXTURE);
    await page.waitForFunction(() => !document.querySelector('#retreat-icon-editor-save').disabled);
    await page.locator('#retreat-icon-editor-save').click();
    await page.waitForSelector('#retreat-icon-editor-overlay', { state: 'hidden' });
    assert(
      await page.locator('[data-launcher-item="features"] .retreat-app-label').textContent() === 'Feature Lab',
      'Save did not apply the edited icon name.'
    );
    assert(
      (await page.locator('[data-launcher-item="features"] .retreat-app-icon > img').getAttribute('src')).startsWith('data:image/png'),
      'Save did not apply the custom icon image.'
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-launcher-item="features"] .retreat-app-icon', { state: 'visible' });
    assert(
      await page.locator('[data-launcher-item="features"] .retreat-app-label').textContent() === 'Feature Lab',
      'The saved icon name did not survive reload.'
    );
    assert(
      await page.locator('[data-launcher-item="features"] .retreat-app-icon > img').count() === 1,
      'The saved custom icon did not survive reload.'
    );

    await page.locator('#retreat-edit-toggle').click();
    await page.locator('[data-launcher-item="features"] .retreat-app-icon').click();
    await page.locator('#retreat-icon-editor-revert').click();
    assert(
      await page.locator('#retreat-icon-editor-preview > .retreat-app-icon > i.ph-command').count() === 1,
      'Revert did not preview the original icon.'
    );
    await page.locator('#retreat-icon-editor-cancel').click();
    assert(
      await page.locator('[data-launcher-item="features"] .retreat-app-icon > img').count() === 1,
      'Cancel applied the draft revert operation.'
    );

    await page.locator('[data-launcher-item="features"] .retreat-app-icon').click();
    await page.locator('#retreat-icon-editor-revert').click();
    await page.locator('#retreat-icon-editor-save').click();
    assert(
      await page.locator('[data-launcher-item="features"] .retreat-app-icon > i.ph-command').count() === 1,
      'Saving the revert operation did not restore the original icon.'
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
    assert(await page.getByRole('link', { name: 'Feature Lab' }).count() === 1, 'The renamed icon was not exposed as a link after editing.');

    await page.mouse.move(4, 4);
    const normalEffectBeforeHover = await readIconEffect(page, 'features');
    await page.locator('[data-launcher-item="features"] .retreat-app-link').hover();
    const normalEffectAfterHover = await readIconEffect(page, 'features');
    assert(
      JSON.stringify(normalEffectAfterHover) !== JSON.stringify(normalEffectBeforeHover),
      `Normal mode did not restore the link hover effect: ${JSON.stringify({ normalEffectBeforeHover, normalEffectAfterHover })}`
    );

    await page.setViewportSize({ width: 380, height: 619 });
    await page.locator('#retreat-edit-toggle').click();
    await page.locator('[data-launcher-item="features"] .retreat-app-icon').click();
    const mobileDialogBounds = await page.locator('#retreat-icon-editor').boundingBox();
    assert(
      mobileDialogBounds
      && mobileDialogBounds.x >= 0
      && mobileDialogBounds.y >= 0
      && mobileDialogBounds.x + mobileDialogBounds.width <= 380
      && mobileDialogBounds.y + mobileDialogBounds.height <= 619,
      `The editor did not fit the 380 × 619 mobile viewport: ${JSON.stringify(mobileDialogBounds)}`
    );
    await page.locator('#retreat-icon-editor-cancel').click();
    await page.locator('#retreat-edit-toggle').click();

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
