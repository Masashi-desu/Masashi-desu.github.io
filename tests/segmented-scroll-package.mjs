/**
 * 目的: 配布アーカイブだけで ESM・型・必須 CSS・任意ナビが独立して動くことを確認する。
 * 期待値: サイト資源への参照ゼロ、選択と到着の区別、1操作1移動、destroy後の入力・CSS解放。
 * 検証方法: npm pack を .temp に展開し、独立HTTPサーバーとheadless Chromium/WebKitで最小ページを操作。
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const engine = process.env.SEGMENTED_BROWSER || 'chromium';
const tempRoot = join(root, '.temp/segmented-package');
await mkdir(tempRoot, { recursive: true });
const temp = await mkdtemp(join(tempRoot, `${engine}-`));
const manifest = JSON.parse(execFileSync('npm', ['pack', './site/shared/segmented-scroll', '--json', '--pack-destination', temp, '--cache', join(tempRoot, 'npm-cache')], { cwd: root, encoding: 'utf8' }))[0];
assert.ok(manifest.files.some(file => file.path === 'index.d.ts'));
assert.ok(manifest.files.some(file => file.path === 'styles.css'));
assert.ok(manifest.files.every(file => !file.path.includes('node_modules') && !file.path.startsWith('site/')));
execFileSync('tar', ['-xzf', join(temp, manifest.filename), '-C', temp]);
const packed = join(temp, 'package');
const api = await import(pathToFileURL(join(packed, 'index.js')));
assert.equal(api.version, manifest.version);
assert.equal(globalThis.MDWSegmentedScroll, undefined, 'ESM import has no browser-global side effects');
assert.equal(typeof api.createScrollController, 'function');
await mkdir(join(temp, 'node_modules/@masahi-desu'), { recursive: true });
await symlink(packed, join(temp, 'node_modules/@masahi-desu/segmented-scroll'));
await cp(join(root, 'tests/fixtures/segmented-scroll/consumer.mts'), join(temp, 'consumer.mts'));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', join(temp, 'consumer.mts')], { stdio: 'inherit' });
await cp(join(root, 'tests/fixtures/segmented-scroll/basic.html'), join(temp, 'index.html'));
const requests = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  requests.push(pathname);
  const file = resolve(temp, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(`${temp}/`)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await ({ chromium, webkit }[engine]).launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: 'no-preference', hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.navigationController?.getState().mounted);
  const initial = await page.evaluate(() => ({
    state: navigationController.getState(),
    touch: getComputedStyle(document.documentElement).touchAction,
    behavior: getComputedStyle(document.documentElement).scrollBehavior,
    snap: getComputedStyle(document.documentElement).scrollSnapType
  }));
  assert.equal(initial.state.settledId, 'first');
  assert.match(initial.touch, /pan-x/);
  assert.equal(initial.behavior, 'auto');
  assert.equal(initial.snap, 'none');
  await page.evaluate(() => {
    for (const deltaY of [0.25, 85.25]) document.body.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
  });
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.evaluate(() => document.body.dispatchEvent(new WheelEvent('wheel', { deltaY: 0.5, bubbles: true, cancelable: true })));
  await page.waitForFunction(() => window.events.some(event => event.type === 'navigationend'));
  const completed = await page.evaluate(() => ({ state: navigationController.getState(), events: window.events, y: scrollY }));
  assert.equal(completed.state.activeId, 'second');
  assert.equal(completed.state.settledId, 'second');
  assert.equal(completed.state.moving, false);
  assert.equal(completed.events.find(event => event.type === 'navigationstart').state.settledId, 'first');
  assert.ok(Math.abs(completed.y - 800) <= 1);
  assert.equal(await page.locator('[data-target="second"]').getAttribute('aria-current'), 'true');
  await page.locator('[data-target="third"]').click();
  await page.waitForFunction(() => navigationController.getState().settledId === 'third');
  assert.equal(await page.locator('[data-target="third"]').getAttribute('aria-current'), 'true');
  await page.evaluate(() => {
    const target = document.body;
    // Desktop WebKit exposes TouchEvent without a public Touch constructor.
    const dispatch = (type, y) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: y === null ? [] : [{ clientX: 100, clientY: y }] });
      target.dispatchEvent(event);
    };
    dispatch('touchstart', 100);
    dispatch('touchmove', 180);
    dispatch('touchend', null);
  });
  await page.waitForFunction(() => navigationController.getState().settledId === 'second');
  assert.equal(await page.locator('[data-target="second"]').getAttribute('aria-current'), 'true');
  const destroyed = await page.evaluate(() => {
    navigationController.destroy();
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return { state: navigationController.getState(), managed: document.documentElement.classList.contains('segmented-scroll-managed'), cancelled: event.defaultPrevented, touch: getComputedStyle(document.documentElement).touchAction };
  });
  assert.equal(destroyed.state.mounted, false);
  assert.equal(destroyed.state.locked, false);
  assert.equal(destroyed.managed, false);
  assert.equal(destroyed.cancelled, false);
  assert.equal(destroyed.touch, 'auto');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(path => path === '/' || path === '/favicon.ico' || path.startsWith('/package/')), JSON.stringify(requests));
  await writeFile(join(temp, 'result.json'), JSON.stringify({ engine, files: manifest.files.map(file => file.path), completed, destroyed, requests }, null, 2));
  console.log(`PASS ${engine}: packed ESM, TypeScript consumer, independent CSS, selection/arrival events, view, destroy`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
