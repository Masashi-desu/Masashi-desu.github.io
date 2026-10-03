/**
 * テスト概要:
 *  - 目的: RetreatScreen の編集モードと、表示言語に応じた App Store リンクを確認する。
 *  - 期待値: 編集中はリンク遷移とホバー効果が無効になり、アイコンが編集ボタンとして動作する一方、横スクロールによるページ送りは利用できる。変更は保存時だけ反映・永続化され、キャンセルでは破棄、元アイコン復元も保存時だけ反映される。App Store リンクは日本語で日本ストア、英語で米国ストアを指す。
 *  - 検証方法: ローカル静的サーバーで RetreatScreen を開き、Chromium / WebKit で App Store リンク、編集モード中の横スクロール、編集ウィンドウの表示、フォーカス、名前変更、PNG 選択、キャンセル、保存、再読み込み、元アイコン復元、言語切替、編集終了を順に操作して DOM・URL・localStorage・算出スタイルを取得する。
 */
const { RetreatScreenPage } = require('./pages/retreatscreen-page');
const { startServer } = require('./support/static-server');
const path = require('path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const ICON_FIXTURE = path.join(ROOT, 'products/RetreatScreen/icon.png');
const BROWSER_ENGINE = process.env.RETREATSCREEN_BROWSER || 'chromium';
const BROWSER_TYPES = { chromium, webkit };

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
    const retreat = new RetreatScreenPage(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`http://127.0.0.1:${port}/products/RetreatScreen/index.html?from=home`, {
      waitUntil: 'domcontentloaded'
    });
    await retreat.icon('features').waitFor({ state: 'visible' });

    const normalState = await retreat.readActionState();
    assert(normalState.features.href === '#details', `Features link did not start active: ${JSON.stringify(normalState.features)}`);
    assert(normalState.products.href === '../../index.html#products-section', `Dynamic home link was not initialized: ${JSON.stringify(normalState.products)}`);
    assert(await page.getByRole('link', { name: 'Features' }).count() === 1, 'Features was not exposed as a link in normal mode.');
    const japaneseStoreHrefs = await retreat.readAppStoreHrefs();
    assert(
      japaneseStoreHrefs.length === 2 && japaneseStoreHrefs.every((href) => href.startsWith('https://apps.apple.com/jp/app/retreatscreen/id6757686282?')),
      `Japanese App Store links were not initialized: ${JSON.stringify(japaneseStoreHrefs)}`
    );

    await page.setViewportSize({ width: 1101, height: 619 });
    await retreat.scrollLauncher(48, 2);
    assert(
      await retreat.pageTab(2).getAttribute('aria-current') === 'page',
      'Horizontal scrolling on the launcher surface did not activate page 2 in normal mode.'
    );
    await page.waitForTimeout(400);
    await retreat.scrollLauncher(-48, 1);
    assert(
      await retreat.pageTab(1).getAttribute('aria-current') === 'page',
      'Horizontal scrolling on the launcher surface did not return to page 1 in normal mode.'
    );
    await page.waitForTimeout(400);

    await retreat.toggleEditing();
    await page.waitForSelector('#retreat-app-grid.is-editing');

    assertEditingActionsDisabled(await retreat.readActionState());
    assert(await page.getByRole('link', { name: 'Features' }).count() === 0, 'Features remained exposed as a link in edit mode.');
    assert(await retreat.renameInputs.count() === 0, 'An inline icon rename field remained in the launcher list.');
    assert(await page.getByRole('button', { name: /Features/u }).count() === 1, 'Features was not exposed as an edit button.');

    await retreat.scrollLauncher(48, 2);
    assert(
      await retreat.pageTab(2).getAttribute('aria-current') === 'page',
      'Horizontal scrolling did not activate page 2 while editing.'
    );
    assert(
      await retreat.grid.evaluate((element) => element.classList.contains('is-editing')),
      'Horizontal scrolling unexpectedly exited edit mode.'
    );
    await page.waitForTimeout(400);
    await retreat.scrollLauncher(-48, 1);
    assert(
      await retreat.pageTab(1).getAttribute('aria-current') === 'page',
      'Horizontal scrolling did not return to page 1 while editing.'
    );
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 880, height: 619 });

    await page.mouse.move(4, 4);
    const effectBeforeHover = await retreat.readIconEffect('features');
    await retreat.itemLink('features').hover();
    const effectAfterHover = await retreat.readIconEffect('features');
    assert(
      JSON.stringify(effectAfterHover) === JSON.stringify(effectBeforeHover),
      `Edit mode retained the link hover effect: ${JSON.stringify({ effectBeforeHover, effectAfterHover })}`
    );

    const urlBeforeClick = page.url();
    await retreat.editIcon('support', { force: true });
    assert(page.url() === urlBeforeClick, `Support icon navigated during edit mode: ${page.url()}`);
    assert(
      await retreat.editorName.evaluate((input) => input === document.activeElement),
      'Clicking an icon in edit mode did not focus the editor name field.'
    );
    assert(await page.getByRole('dialog').isVisible(), 'Clicking an icon in edit mode did not open the icon editor.');
    assert(await page.getByRole('button', { name: 'Choose File' }).count() === 0, 'The hidden file input leaked into the accessibility tree.');
    const desktopDialogBounds = await retreat.editor.boundingBox();
    assert(
      desktopDialogBounds && desktopDialogBounds.y >= 0 && desktopDialogBounds.y + desktopDialogBounds.height <= 619,
      `The editor did not fit the 880 × 619 browser-comment viewport: ${JSON.stringify(desktopDialogBounds)}`
    );
    assert(
      await retreat.header.evaluate((header) => header.inert),
      'Underlying launcher content remained interactive while the icon editor was open.'
    );
    assert(
      await retreat.content.evaluate((content) => content.inert),
      'Product-page content remained interactive while the icon editor was open.'
    );
    await retreat.cancelIconEdit();
    await page.waitForSelector('#retreat-icon-editor-overlay', { state: 'hidden' });
    assert(
      await retreat.itemLabel('support').textContent() === 'Support',
      'Cancel changed the launcher label.'
    );

    await retreat.editIcon('features');
    await retreat.renameIcon('');
    assert(await retreat.editorSave.isDisabled(), 'Save remained enabled for an empty icon name.');
    await retreat.renameIcon('Feature Lab');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await retreat.editorChoose.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(ICON_FIXTURE);
    await page.waitForFunction(() => (
      document.querySelector('#retreat-icon-editor-preview img')?.getAttribute('src')?.startsWith('data:image/png')
    ));
    assert(
      (await retreat.editorSelected.textContent()).includes('icon.png'),
      'The selected custom icon filename was not shown.'
    );
    await retreat.cancelIconEdit();
    assert(
      await retreat.itemLabel('features').textContent() === 'Features',
      'Cancel applied the draft icon name.'
    );
    assert(
      await retreat.icon('features').locator('> i.ph-command').count() === 1,
      'Cancel applied the draft custom image.'
    );

    await retreat.editIcon('features');
    await retreat.renameIcon('Feature Lab');
    await retreat.editorFile.setInputFiles(ICON_FIXTURE);
    await page.waitForFunction(() => !document.querySelector('#retreat-icon-editor-save').disabled);
    await retreat.saveIconEdit();
    await page.waitForSelector('#retreat-icon-editor-overlay', { state: 'hidden' });
    assert(
      await retreat.itemLabel('features').textContent() === 'Feature Lab',
      'Save did not apply the edited icon name.'
    );
    assert(
      (await retreat.icon('features').locator('> img').getAttribute('src')).startsWith('data:image/png'),
      'Save did not apply the custom icon image.'
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await retreat.icon('features').waitFor({ state: 'visible' });
    assert(
      await retreat.itemLabel('features').textContent() === 'Feature Lab',
      'The saved icon name did not survive reload.'
    );
    assert(
      await retreat.icon('features').locator('> img').count() === 1,
      'The saved custom icon did not survive reload.'
    );

    await retreat.toggleEditing();
    await retreat.editIcon('features');
    await retreat.revertIcon();
    assert(
      await retreat.editorPreview.locator(':scope > .retreat-app-icon > i.ph-command').count() === 1,
      'Revert did not preview the original icon.'
    );
    await retreat.cancelIconEdit();
    assert(
      await retreat.icon('features').locator('> img').count() === 1,
      'Cancel applied the draft revert operation.'
    );

    await retreat.editIcon('features');
    await retreat.revertIcon();
    await retreat.saveIconEdit();
    assert(
      await retreat.icon('features').locator('> i.ph-command').count() === 1,
      'Saving the revert operation did not restore the original icon.'
    );

    await retreat.applyLanguage('en');
    assertEditingActionsDisabled(await retreat.readActionState());
    const editingStoreHrefs = await retreat.readAppStoreHrefs();
    assert(
      editingStoreHrefs[0] === null && editingStoreHrefs[1].startsWith('https://apps.apple.com/us/app/retreatscreen/id6757686282?'),
      `English App Store links were not synchronized during editing: ${JSON.stringify(editingStoreHrefs)}`
    );

    await retreat.toggleEditing();
    await page.waitForSelector('#retreat-app-grid:not(.is-editing)');

    const restoredState = await retreat.readActionState();
    assert(restoredState.features.href === '#details', `Features link was not restored: ${JSON.stringify(restoredState.features)}`);
    assert(restoredState.features.pressable === 'true', `Features pressable state was not restored: ${JSON.stringify(restoredState.features)}`);
    assert(restoredState.features.role === null && restoredState.features.tabIndex === 0, `Features semantics were not restored: ${JSON.stringify(restoredState.features)}`);
    assert(restoredState.products.href === '../../index.html#products-section', `Dynamic home link was not restored: ${JSON.stringify(restoredState.products)}`);
    assert(restoredState.products.transitionDirection === 'left', `Dynamic home transition was not restored: ${JSON.stringify(restoredState.products)}`);
    assert(
      restoredState.download.href.startsWith('https://apps.apple.com/us/app/retreatscreen/id6757686282?'),
      `The English launcher App Store link was not restored: ${JSON.stringify(restoredState.download)}`
    );
    const englishStoreHrefs = await retreat.readAppStoreHrefs();
    assert(
      englishStoreHrefs.length === 2 && englishStoreHrefs.every((href) => href.startsWith('https://apps.apple.com/us/app/retreatscreen/id6757686282?')),
      `English App Store links were not applied: ${JSON.stringify(englishStoreHrefs)}`
    );
    assert(await page.getByRole('link', { name: 'Feature Lab' }).count() === 1, 'The renamed icon was not exposed as a link after editing.');

    await page.mouse.move(4, 4);
    const normalEffectBeforeHover = await retreat.readIconEffect('features');
    await retreat.itemLink('features').hover();
    const normalEffectAfterHover = await retreat.readIconEffect('features');
    assert(
      JSON.stringify(normalEffectAfterHover) !== JSON.stringify(normalEffectBeforeHover),
      `Normal mode did not restore the link hover effect: ${JSON.stringify({ normalEffectBeforeHover, normalEffectAfterHover })}`
    );

    await page.setViewportSize({ width: 380, height: 619 });
    await retreat.toggleEditing();
    await retreat.editIcon('features');
    const mobileDialogBounds = await retreat.editor.boundingBox();
    assert(
      mobileDialogBounds
      && mobileDialogBounds.x >= 0
      && mobileDialogBounds.y >= 0
      && mobileDialogBounds.x + mobileDialogBounds.width <= 380
      && mobileDialogBounds.y + mobileDialogBounds.height <= 619,
      `The editor did not fit the 380 × 619 mobile viewport: ${JSON.stringify(mobileDialogBounds)}`
    );
    await retreat.cancelIconEdit();
    await retreat.toggleEditing();

    await retreat.editIcon('features');
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
