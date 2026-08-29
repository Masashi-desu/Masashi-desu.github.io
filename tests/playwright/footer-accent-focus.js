/**
 * テスト概要:
 *  - 目的: 共通フッターの言語・テーマselectが、表示中ページのアクセントカラーへ追従することを確認する。
 *  - 期待値: 境界線は各ページの --accent-color、フォーカスリングは同色を32%で合成した色になる。
 *  - 検証方法: site/をローカル配信し、主要ページをライト／ダークテーマで開いてCSS変数とfocus styleを比較する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const PORT = 3015;
const ORIGIN = `http://127.0.0.1:${PORT}`;

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

function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  if (filePath.endsWith('/')) {
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
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.glb': 'model/gltf-binary'
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.end(data);
  });
}

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(details)}`);
  }
}

async function verifyCase(browser, testCase) {
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
  try {
    await page.goto(`${ORIGIN}${testCase.pathname}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mdwFooterReady === true, null, { timeout: 60000 });
    await page.waitForSelector('#footer-language', { timeout: 2000 });

    const expected = await page.evaluate((accent) => {
      const pageProbe = document.createElement('span');
      const expectedProbe = document.createElement('span');
      pageProbe.style.color = 'var(--accent-color)';
      pageProbe.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--accent-color) 32%, transparent)';
      expectedProbe.style.color = accent;
      document.body.append(pageProbe, expectedProbe);
      const pageStyle = getComputedStyle(pageProbe);
      const result = {
        pageAccent: pageStyle.color,
        expectedAccent: getComputedStyle(expectedProbe).color,
        ring: pageStyle.boxShadow
      };
      pageProbe.remove();
      expectedProbe.remove();
      return result;
    }, testCase.accent);

    assert(
      expected.pageAccent === expected.expectedAccent,
      `${testCase.label} did not expose the expected page accent`,
      expected
    );

    for (const selector of ['#footer-language', '#footer-theme']) {
      await page.locator(selector).focus();
      await page.waitForFunction(({ target, border, ring }) => {
        const element = document.querySelector(target);
        if (!element || document.activeElement !== element) {
          return false;
        }
        const style = getComputedStyle(element);
        return style.borderColor === border && style.boxShadow === ring;
      }, {
        target: selector,
        border: expected.pageAccent,
        ring: expected.ring
      }, { timeout: 2000, polling: 50 });
      const state = await page.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          active: document.activeElement === element,
          border: style.borderColor,
          ring: style.boxShadow
        };
      });
      assert(state.active, `${testCase.label} ${selector} did not receive focus`, state);
      assert(
        state.border === expected.pageAccent,
        `${testCase.label} ${selector} did not use the page accent border`,
        { expected, state }
      );
      assert(
        state.ring === expected.ring,
        `${testCase.label} ${selector} did not use the page accent ring`,
        { expected, state }
      );
    }
  } finally {
    await context.close();
  }
}

async function run() {
  const server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const browser = await chromium.launch();
  try {
    for (const testCase of CASES) {
      await verifyCase(browser, testCase);
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
