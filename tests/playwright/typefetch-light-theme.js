/**
 * テスト概要:
 *  - 目的: TypeFetch 製品ページが共通テーマ設定とOS設定へ追従し、ライトテーマをページ全体へ適用できることを検証する。
 *  - 期待値: ライト時は背景 #f4f7fb、本文 #192231、前面アプリのデモ面 #ffffff、各セクション固有の明るい背景が適用される。
 *    TypeFetch入力パネル自体は実アプリと同じ固定ダーク配色を維持し、itch.io 埋め込みはライト配色URLへ切り替わる。
 *    フッターは共通デザインの寸法・配置を使い、角丸selectの外側に矩形背景を描画せず、TypeFetch固有色を適用する。
 *    フッターselectのフォーカス境界線とリングは、ライト／ダーク双方でTypeFetchアプリアイコン由来の紫色を使う。
 *    選択は再読み込み後も保持され、system選択はOS配色へ追従する。
 *    ライト／ダークのどちらでもデスクトップと390px幅に横方向のオーバーフローがない。
 *  - 検証方法: 一時ポートのVite開発サーバーを起動し、隔離したPlaywrightブラウザでテーマselectを操作する。
 *    data-theme、computed style、iframe URL、localStorage、scrollWidthを取得して期待値と比較する。
 */
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

async function waitForTheme(page, theme) {
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
  await page.waitForFunction((expected) => {
    const iframe = document.querySelector('.tf-purchase__embed iframe');
    return iframe && iframe.src.includes(expected === 'light' ? 'bg_color=ffffff' : 'bg_color=202430');
  }, theme);
  await page.waitForFunction((expected) => {
    const topbar = document.querySelector('.tf-topbar');
    const targetWindow = document.querySelector('.tf-target-window');
    if (!topbar || !targetWindow) {
      return false;
    }
    const expectedTopbar = expected === 'light' ? 'rgba(244, 247, 251, 0.82)' : 'rgba(7, 9, 16, 0.78)';
    const expectedWindow = expected === 'light' ? 'rgb(255, 255, 255)' : 'rgb(17, 20, 29)';
    return getComputedStyle(topbar).backgroundColor === expectedTopbar
      && getComputedStyle(targetWindow).backgroundColor === expectedWindow;
  }, theme);
}

async function readThemeState(page) {
  return page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.dataset.theme,
      preference: document.documentElement.dataset.themePreference,
      stored: localStorage.getItem('mdw-theme'),
      selected: document.querySelector('.theme-select')?.value,
      colorScheme: rootStyle.colorScheme,
      body: {
        background: style('body').backgroundColor,
        color: style('body').color
      },
      topbar: style('.tf-topbar').backgroundColor,
      story: style('.tf-operation-story').backgroundColor,
      targetWindow: style('.tf-target-window').backgroundColor,
      callout: {
        background: style('.tf-callout').backgroundImage,
        colorScheme: style('.tf-callout').colorScheme,
        title: style('.tf-callout__heading h2').color,
        subtitle: style('.tf-callout__heading p').color,
        input: style('#tf-callout-input').backgroundColor,
        inputText: style('#tf-callout-input').color,
        placeholder: getComputedStyle(document.querySelector('#tf-callout-input'), '::placeholder').color,
        cancel: style('.tf-callout-button--cancel').backgroundColor,
        cancelText: style('.tf-callout-button--cancel').color,
        confirm: style('.tf-callout-button--confirm').backgroundImage
      },
      rules: style('.tf-rules').backgroundColor,
      showcase: style('.tf-showcase').backgroundColor,
      facts: style('.tf-facts').backgroundColor,
      purchase: style('.tf-purchase').backgroundColor,
      footer: style('.tf-footer').backgroundColor,
      footerDesign: {
        sharedDirection: style('.site-footer__shared').flexDirection,
        sharedAlign: style('.site-footer__shared').alignItems,
        sharedGap: style('.site-footer__shared').gap,
        actionsDirection: style('.site-footer__actions').flexDirection,
        actionsGap: style('.site-footer__actions').gap,
        labelSize: style('.site-footer__label').fontSize,
        labelSpacing: style('.site-footer__label').letterSpacing,
        labelTransform: style('.site-footer__label').textTransform,
        shellBackground: style('.site-footer__select-shell').backgroundColor,
        selectBackground: style('.lang-select').backgroundColor,
        selectRadius: style('.lang-select').borderRadius,
        selectSize: style('.lang-select').fontSize,
        selectSpacing: style('.lang-select').letterSpacing,
        selectTransform: style('.lang-select').textTransform
      },
      iframe: document.querySelector('.tf-purchase__embed iframe')?.src,
      overflow: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      }
    };
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

function getExpectedFooterFocus(theme) {
  return theme === 'light'
    ? {
        border: 'rgb(77, 70, 178)',
        background: 'rgba(255, 255, 255, 0.72)',
        ring: 'rgba(113, 112, 204, 0.24)'
      }
    : {
        border: 'rgb(157, 159, 220)',
        background: 'rgba(255, 255, 255, 0.05)',
        ring: 'rgba(113, 112, 204, 0.32)'
      };
}

async function readFooterFocusStates(page, theme) {
  const expected = getExpectedFooterFocus(theme);
  const states = {};
  for (const selector of ['.lang-select', '.theme-select']) {
    const locator = page.locator(selector);
    let focusError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await locator.focus();
      try {
        await page.waitForFunction(({ target, border, background, ring }) => {
          const element = document.querySelector(target);
          if (!element || document.activeElement !== element) {
            return false;
          }
          const style = getComputedStyle(element);
          return style.borderColor === border
            && style.backgroundColor === background
            && style.boxShadow.includes(ring);
        }, {
          target: selector,
          border: expected.border,
          background: expected.background,
          ring: expected.ring
        }, { timeout: 2000, polling: 50 });
        focusError = null;
        break;
      } catch (error) {
        focusError = error;
      }
    }
    if (focusError) {
      const details = await locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          activeElement: document.activeElement
            ? `${document.activeElement.tagName}.${document.activeElement.className}`
            : null,
          border: style.borderColor,
          background: style.backgroundColor,
          ring: style.boxShadow
        };
      });
      throw new Error(`${selector} focus style did not settle: ${JSON.stringify(details)}`);
    }
    states[selector] = await page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        border: style.borderColor,
        background: style.backgroundColor,
        ring: style.boxShadow
      };
    });
  }
  return states;
}

function assertFooterFocus(states, theme) {
  const expected = getExpectedFooterFocus(theme);
  for (const [selector, state] of Object.entries(states)) {
    assert(state.border === expected.border, `${selector} did not use the icon-derived focus border`, state);
    assert(state.background === expected.background, `${selector} focus background changed unexpectedly`, state);
    assert(state.ring.includes(expected.ring), `${selector} did not use the icon-derived focus ring`, state);
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
    await context.route('https://itch.io/**', (route) => route.abort());
    await context.addInitScript(() => {
      if (!localStorage.getItem('mdw-theme')) {
        localStorage.setItem('mdw-theme', 'dark');
      }
    });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.theme-select');
    await waitForTheme(page, 'dark');

    let state = await readThemeState(page);
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
    assertDesktopFooterDesign(state, 'dark');
    assertFooterFocus(await readFooterFocusStates(page, 'dark'), 'dark');
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} dark desktop`);

    await page.locator('.theme-select').selectOption('light');
    await waitForTheme(page, 'light');
    state = await readThemeState(page);
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
    assert(state.iframe.includes('bg_color=ffffff') && state.iframe.includes('fg_color=192231'), 'Light itch.io embed URL was not applied', state);
    assertDesktopFooterDesign(state, 'light');
    assertFooterFocus(await readFooterFocusStates(page, 'light'), 'light');
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} light desktop`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.theme-select');
    await waitForTheme(page, 'light');
    state = await readThemeState(page);
    assert(state.preference === 'light' && state.selected === 'light', 'Light preference did not survive reload', state);

    await page.setViewportSize({ width: 390, height: 844 });
    state = await readThemeState(page);
    assertMobileFooterDesign(state);
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} light mobile`);

    await page.locator('.theme-select').selectOption('system');
    await waitForTheme(page, 'dark');
    state = await readThemeState(page);
    assert(state.preference === 'system' && state.stored === 'system', 'System preference was not persisted', state);
    assertNoHorizontalOverflow(state, `${BROWSER_NAME} system-dark mobile`);

    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await waitForTheme(page, 'light');
    state = await readThemeState(page);
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
