/**
 * テスト概要:
 *  - 目的: 共通フッターの言語・テーマselectが、表示中ページのアクセントカラーへ追従することを確認する。
 *  - 期待値: 境界線は各ページの --accent-color、フォーカスリングは同色を32%で合成した色になる。
 *  - 検証方法: site/をローカル配信し、主要ページをライト／ダークテーマで開いてCSS変数とfocus styleを比較する。
 */
const { FooterControls } = require('./components/footer-controls');
const { startServer } = require('./support/static-server');
const { chromium } = require('playwright');


const CASES = [
  { label: 'home light', pathname: '/index.html', theme: 'light', accent: '#2f49ff' },
  { label: 'home dark', pathname: '/index.html', theme: 'dark', accent: '#d8ff5f' },
  { label: 'catalog light', pathname: '/products/index.html', theme: 'light', accent: '#2f49ff' },
  { label: 'catalog dark', pathname: '/products/index.html', theme: 'dark', accent: '#d8ff5f' },
  { label: 'RetreatScreen light', pathname: '/products/RetreatScreen/index.html', theme: 'light', accent: '#a3e5e6' },
  { label: 'RetreatScreen dark', pathname: '/products/RetreatScreen/index.html', theme: 'dark', accent: '#ac7be0' },
  { label: 'RetreatScreen privacy', pathname: '/products/RetreatScreen/privacy.html', theme: 'dark', accent: '#ff6b4a' },
  { label: 'RetreatScreen support', pathname: '/products/RetreatScreen/support.html', theme: 'light', accent: '#ff6b4a' },
  { label: 'TypeFetch light', pathname: '/products/TypeFetch/index.html', theme: 'light', accent: '#1769df' },
  { label: 'TypeFetch dark', pathname: '/products/TypeFetch/index.html', theme: 'dark', accent: '#4a91ff' },
  { label: 'Bartical light', pathname: '/products/Bartical/index.html', theme: 'light', accent: '#6155f5' },
  { label: 'Bartical dark', pathname: '/products/Bartical/index.html', theme: 'dark', accent: '#6155f5' },
  { label: 'Surround1x0 light', pathname: '/products/Surround1x0-AKDK/index.html', theme: 'light', accent: '#686d75' },
  { label: 'Surround1x0 dark', pathname: '/products/Surround1x0-AKDK/index.html', theme: 'dark', accent: '#ff344a' }
];

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(details)}`);
  }
}

async function verifyCase(browser, testCase, origin) {
  const context = await browser.newContext({
    colorScheme: testCase.theme,
    reducedMotion: 'reduce'
  });
  await context.route(/^https:\/\//, (route) => route.abort());
  await context.addInitScript((theme) => {
    localStorage.setItem('mdw-theme', theme);
    window.__mdwFooterReady = false;
    window.addEventListener('mdw:footer-loaded', () => {
      window.__mdwFooterReady = true;
    }, { once: true });
  }, testCase.theme);

  const page = await context.newPage();
  const footer = new FooterControls(page);
  try {
    await page.goto(`${origin}${testCase.pathname}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdwFooterReady === true, null, { timeout: 60000 });
    await footer.waitUntilLoaded({ timeout: 2000 });

    const expected = await footer.expectedFocus(testCase.accent);
    assert(expected.border === expected.expectedAccent, `${testCase.label} did not expose the expected page accent`, expected);

    for (const control of ['language', 'theme']) {
      const state = await footer.focusControl(control, expected);
      assert(state.active, `${testCase.label} ${control} did not receive focus`, state);
      assert(state.border === expected.border, `${testCase.label} ${control} did not use the page accent border`, { expected, state });
      assert(state.ring === expected.ring, `${testCase.label} ${control} did not use the page accent ring`, { expected, state });
    }
  } finally {
    await context.close();
  }
}

async function run() {
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  try {
    for (const testCase of CASES) {
      await verifyCase(browser, testCase, origin);
    }
    console.log(`Footer selects use each page accent across ${CASES.length} page/theme cases.`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
