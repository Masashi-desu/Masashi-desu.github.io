/**
 * テスト概要:
 *  - 目的: TypeFetch 製品ページが共通テーマ設定とOS設定へ追従し、ライトテーマをページ全体へ適用できることを検証する。
 *  - 期待値: ライト時は背景 #f4f7fb、本文 #192231、前面アプリのデモ面 #ffffff、各セクション固有の明るい背景が適用される。
 *    TypeFetch入力パネル自体は実アプリと同じ固定ダーク配色を維持し、配信CTAはテーマごとに判読可能な配色を使う。
 *    CTAは公開itch.ioページへ接続し、文字の左側にSimple Icons v16のitch.ioアイコンを表示する。
 *    1200px以下ではアイコン、見出しと説明文、CTAの順に中央揃えの1列構成にする。見出しを2行以内に保ち、説明文は1180px、944px、908pxで1行、792pxでは必要な場合だけ2行にする。デスクトップ3列でも説明文を不要に折り返さない。
 *    フッターは共通デザインの寸法・配置を使い、角丸selectの外側に矩形背景を描画せず、TypeFetch固有色を適用する。
 *    フッターselectのフォーカス境界線とリングは、ライト／ダーク双方でTypeFetchのページアクセントである青色を使う。
 *    選択は再読み込み後も保持され、system選択はOS配色へ追従する。
 *    ライト／ダークのどちらでもデスクトップと390px幅に横方向のオーバーフローがない。
 *  - 検証方法: 一時ポートのVite開発サーバーを起動し、隔離したPlaywrightブラウザでテーマselectを操作する。
 *    data-theme、computed style、CTA属性とアイコン、localStorage、scrollWidthを取得して期待値と比較する。
 */
const { TypeFetchPage } = require('./pages/typefetch-page');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const playwright = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const VITE_PACKAGE = require.resolve('vite/package.json');
const VITE_CLI = path.resolve(path.dirname(VITE_PACKAGE), 'bin/vite.js');
const BROWSER_NAME = process.env.TYPEFETCH_BROWSER === 'webkit' ? 'webkit' : 'chromium';

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `: ${JSON.stringify(details)}` : ''}`);
  }
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode >= 200 && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Vite did not become ready within ${timeoutMs}ms: ${url}`));
        return;
      }
      setTimeout(check, 120);
    };
    check();
  });
}

function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let forceTimer;
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(forceTimer);
      resolve();
    };
    child.once('exit', finish);
    child.kill('SIGTERM');
    forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      finish();
    }, 3000);
  });
}

function assertNoHorizontalOverflow(state, label) {
  const tolerance = 1;
  assert(
    state.overflow.scrollWidth <= state.overflow.clientWidth + tolerance
      && state.overflow.bodyScrollWidth <= state.overflow.clientWidth + tolerance,
    `${label} generated horizontal overflow`,
    state.overflow
  );
}

function assertDistributionAction(state, theme) {
  const action = state.distribution;
  assert(
    action.href === 'https://masashi-desu.itch.io/typefetch' && action.target === '_blank'
      && action.rel?.includes('noopener') && action.rel.includes('noreferrer') && action.label === 'itch.ioで入手',
    `${theme} TypeFetch distribution action did not keep its published itch.io link and label`, action
  );
  assertDistributionAppearance(state, theme);
}

function assertDistributionAppearance(state, label) {
  const action = state.distribution;
  assert(
    action.backgroundColor === 'rgb(255, 255, 255)' && action.labelColor === 'rgb(21, 92, 191)'
      && action.iconColor === action.labelColor
      && action.iconMask.includes('cdn.jsdelivr.net/npm/simple-icons@v16/icons/itchdotio.svg') && action.iconIsLeftOfLabel,
    `${label} TypeFetch distribution action lost its legible colors or left-side Simple Icons mark`, action
  );
}

function assertResponsivePurchaseLayout(state, label, width) {
  const layout = state.purchaseLayout;
  const contentLeft = layout.section.left + layout.sectionPaddingLeft;
  const contentRight = layout.section.right - layout.sectionPaddingRight;
  const contentCenter = (contentLeft + contentRight) / 2;
  const centerX = (rect) => (rect.left + rect.right) / 2;
  const tolerance = 1;
  assert(
    Math.abs(layout.copy.left - contentLeft) <= tolerance
      && Math.abs(layout.copy.right - contentRight) <= tolerance
      && Math.abs(centerX(layout.icon) - contentCenter) <= tolerance
      && Math.abs(centerX(layout.button) - contentCenter) <= tolerance
      && layout.icon.bottom <= layout.copy.top + tolerance
      && layout.title.bottom <= layout.body.top + tolerance
      && layout.button.top >= layout.copy.bottom - tolerance
      && layout.copyTextAlign === 'center'
      && layout.titleLineCount <= 2
      && layout.bodyLineCount <= (width >= 908 ? 1 : 2),
    `${label} did not stack and center the icon, copy, caption, and CTA in order`,
    layout
  );
}

function assertDesktopFooterDesign(state, theme) {
  const expectedBackground = theme === 'light'
    ? 'rgba(255, 255, 255, 0.72)'
    : 'rgba(255, 255, 255, 0.05)';
  const footer = state.footerDesign;
  assert(footer.sharedDirection === 'row', 'Desktop footer did not use the shared row layout', footer);
  assert(footer.sharedAlign === 'flex-start', 'Desktop footer alignment diverged from the shared design', footer);
  assert(footer.sharedGap === '24px' && footer.actionsGap === '14px', 'Desktop footer spacing diverged from the shared design', footer);
  assert(
    footer.labelSize === '12px' && footer.labelSpacing === 'normal' && footer.labelTransform === 'none',
    'Footer label typography diverged from the shared design',
    footer
  );
  assert(footer.shellBackground === 'rgba(0, 0, 0, 0)', 'Footer select shell rendered a rectangular background', footer);
  assert(footer.selectBackground === expectedBackground, 'Footer select did not use the TypeFetch surface color', footer);
  assert(
    footer.selectRadius === '999px' && footer.selectSize === '13px'
      && footer.selectSpacing === 'normal' && footer.selectTransform === 'none',
    'Footer select geometry or typography diverged from the shared design',
    footer
  );
}

function assertMobileFooterDesign(state) {
  const footer = state.footerDesign;
  assert(footer.sharedDirection === 'column', 'Mobile footer did not use the shared stacked layout', footer);
  assert(footer.sharedAlign === 'center', 'Mobile footer alignment diverged from the shared design', footer);
  assert(footer.actionsDirection === 'row', 'Mobile footer controls did not keep the shared horizontal layout', footer);
  assert(footer.shellBackground === 'rgba(0, 0, 0, 0)', 'Mobile footer select shell rendered a rectangular background', footer);
}

async function assertFooterFocus(footer, theme) {
  const expected = {
    ...await footer.expectedFocus(),
    background: theme === 'light' ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.05)'
  };
  for (const control of ['language', 'theme']) {
    const state = await footer.focusControl(control, expected);
    assert(state.border === expected.border, `${control} did not use the page accent focus border`, state);
    assert(state.background === expected.background, `${control} focus background changed unexpectedly`, state);
    assert(state.ring === expected.ring, `${control} did not use the page accent focus ring`, state);
  }
}

async function run() {
  const port = await getAvailablePort();
  const pageUrl = `http://127.0.0.1:${port}/products/TypeFetch/index.html?from=home`;
  const vite = spawn(process.execPath, [
    VITE_CLI,
    '--host', '127.0.0.1',
    '--port', String(port),
    '--strictPort'
  ], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let viteOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });

  let browser;
  try {
    await waitForServer(pageUrl);
    browser = await playwright[BROWSER_NAME].launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark',
      reducedMotion: 'reduce'
    });
    await context.addInitScript(() => {
      if (!localStorage.getItem('mdw-theme')) {
        localStorage.setItem('mdw-theme', 'dark');
      }
    });
    const page = await context.newPage();
    const typefetch = new TypeFetchPage(page);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await typefetch.footer.waitUntilLoaded();
    await typefetch.waitForTheme('dark');

    let state = await typefetch.readThemeState();
    const darkCallout = state.callout;
    assert(state.body.background === 'rgb(7, 9, 16)', 'Dark page background changed unexpectedly', state);
    assert(state.targetWindow === 'rgb(17, 20, 29)', 'Dark demo surface changed unexpectedly', state);
    assert(state.callout.background.includes('rgba(32, 36, 48, 0.96)') && state.callout.background.includes('rgba(16, 18, 27, 0.96)'), 'TypeFetch panel gradient did not match the app', state);
    assert(state.callout.colorScheme === 'dark', 'TypeFetch panel native controls did not keep the app dark appearance', state);
    assert(state.callout.title === 'rgba(255, 255, 255, 0.92)', 'TypeFetch panel title did not match the app', state);
    assert(state.callout.subtitle === 'rgba(255, 255, 255, 0.55)', 'TypeFetch panel subtitle did not match the app', state);
    assert(state.callout.input === 'rgba(255, 255, 255, 0.06)', 'TypeFetch input surface did not match the app', state);
    assert(state.callout.placeholder === 'rgba(255, 255, 255, 0.38)', 'TypeFetch placeholder did not match the app', state);
    assert(state.callout.cancel === 'rgba(255, 255, 255, 0.08)', 'TypeFetch cancel button did not match the app', state);
    assert(state.callout.cancelText === 'rgba(255, 255, 255, 0.85)', 'TypeFetch cancel text did not match the app', state);
    assert(state.callout.confirm.includes('rgb(74, 145, 255)') && state.callout.confirm.includes('rgb(46, 115, 245)'), 'TypeFetch confirm gradient did not match the app', state);
    assertDistributionAction(state, 'Dark');
    assert(state.purchaseLayout.bodyLineCount === 1, 'Dark desktop purchase caption wrapped unnecessarily', state.purchaseLayout);
    assertDesktopFooterDesign(state, 'dark');
    await assertFooterFocus(typefetch.footer, 'dark');
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} dark desktop`);

    for (const width of [1180, 944, 908, 792]) {
      await page.setViewportSize({ width, height: 619 });
      state = await typefetch.readThemeState();
      assertDistributionAppearance(state, `Dark ${width}px`);
      assertResponsivePurchaseLayout(state, `${BROWSER_NAME} dark ${width}px`, width);
      assertNoHorizontalOverflow(state, `${BROWSER_NAME} dark ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    await typefetch.footer.selectTheme('light');
    await typefetch.waitForTheme('light');
    state = await typefetch.readThemeState();
    assert(state.preference === 'light' && state.stored === 'light' && state.selected === 'light', 'Light preference was not synchronized', state);
    assert(state.colorScheme === 'light', 'Native controls did not switch to light color-scheme', state);
    assert(state.body.background === 'rgb(244, 247, 251)', 'Light page background was not applied', state);
    assert(state.body.color === 'rgb(25, 34, 49)', 'Light primary text was not applied', state);
    assert(state.topbar === 'rgba(244, 247, 251, 0.82)', 'Light fixed header was not applied', state);
    assert(state.story === 'rgb(244, 247, 251)', 'Light story background was not applied', state);
    assert(state.targetWindow === 'rgb(255, 255, 255)', 'Light demo surface was not applied', state);
    assert(JSON.stringify(state.callout) === JSON.stringify(darkCallout), 'TypeFetch panel changed with the Web light theme despite the app using a fixed dark appearance', state);
    assert(state.rules === 'rgba(232, 237, 245, 0.84)', 'Light rules background was not applied', state);
    assert(state.showcase === 'rgb(248, 250, 252)', 'Light showcase background was not applied', state);
    assert(state.facts === 'rgb(237, 242, 248)', 'Light facts background was not applied', state);
    assert(state.purchase === 'rgb(229, 235, 244)', 'Light purchase background was not applied', state);
    assert(state.footer === 'rgb(244, 247, 251)', 'Light footer background was not applied', state);
    assertDistributionAction(state, 'Light');
    assert(state.purchaseLayout.bodyLineCount === 1, 'Light desktop purchase caption wrapped unnecessarily', state.purchaseLayout);
    assertDesktopFooterDesign(state, 'light');
    await assertFooterFocus(typefetch.footer, 'light');
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} light desktop`);

    for (const width of [1180, 944, 908, 792]) {
      await page.setViewportSize({ width, height: 619 });
      state = await typefetch.readThemeState();
      assertDistributionAppearance(state, `Light ${width}px`);
      assertResponsivePurchaseLayout(state, `${BROWSER_NAME} light ${width}px`, width);
      assertNoHorizontalOverflow(state, `${BROWSER_NAME} light ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await typefetch.footer.waitUntilLoaded();
    await typefetch.waitForTheme('light');
    state = await typefetch.readThemeState();
    assert(state.preference === 'light' && state.selected === 'light', 'Light preference did not survive reload', state);

    await page.setViewportSize({ width: 390, height: 844 });
    state = await typefetch.readThemeState();
    assertMobileFooterDesign(state);
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} light mobile`);

    await typefetch.footer.selectTheme('system');
    await typefetch.waitForTheme('dark');
    state = await typefetch.readThemeState();
    assert(state.preference === 'system' && state.stored === 'system', 'System preference was not persisted', state);
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} system-dark mobile`);

    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await typefetch.waitForTheme('light');
    state = await typefetch.readThemeState();
    assert(state.preference === 'system' && state.theme === 'light', 'System preference did not follow the OS light theme', state);
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} system-light mobile`);

    await context.close();
    console.log(`TypeFetch light theme checks passed in ${BROWSER_NAME}.`);
  } catch (error) {
    if (vite.exitCode !== null) {
      throw new Error(`${error.message}\nVite exited early:\n${viteOutput}`);
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(vite);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
