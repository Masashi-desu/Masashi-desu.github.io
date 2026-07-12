/**
 * テスト概要:
 *  - 目的: Surround1x0-AKDK の4つのコンテンツとフッタ設定の5停止位置、Three.js描画、テーマ連動モデル、レスポンシブ配置を検証する。
 *  - 期待値: 各セグメントが1 viewportに収まり、02/03で注目する片側ユニットが切り替わり、
 *    移動方式は二次ベジェ曲線とsmootherstep減速になり、スケールのオーバーシュートは発生しない。
 *    ダーク時はBlack GLBと赤いアクセント、ライト時はWhite GLBと
 *    グレーのアクセントが選択される。全セグメントの文字レイヤーは3D canvasより手前に置く。
 *    第1セグメントは中間幅で左右ユニットの距離を縮め、
 *    390px幅でも横スクロールや主要導線の欠けが発生しない。歯車セグメントはフッタを文書末尾に表示し、
 *    04の3Dシーンを維持して同一シーンのモーションを再発火させない。
 *  - 検証方法: Viteの本番ビルドをpreviewして製品アクセントを検証した後、開発サーバーを一時ポートで起動する。
 *    Playwright Chromiumからページを開き、公開された3D状態、セグメント位置、テーマselect、DOMRect、
 *    scrollWidthをデスクトップとモバイルの両方で計測する。
 */
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');

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
  if (!child || child.killed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `: ${JSON.stringify(details)}` : ''}`);
  }
}

async function waitFor3d(page) {
  await page.waitForFunction(() => window.__SURROUND_3D__?.ready === true, null, { timeout: 15000 });
}

async function clickSegment(page, number) {
  const id = `surround-0${number}`;
  await page.locator(`[data-surround-target="${id}"]`).click();
  await page.waitForFunction((expected) => (
    document.body.dataset.surroundScene === String(expected.index) &&
    Math.abs(document.getElementById(expected.id).getBoundingClientRect().top) <= 1
  ), { id, index: number - 1 });
}

async function clickFooter(page) {
  await page.locator('[data-surround-footer-target="surround-footer"]').click();
  await page.waitForFunction(() => (
    document.body.dataset.surroundStop === 'surround-footer' &&
    Math.abs(document.documentElement.scrollHeight - window.innerHeight - window.scrollY) <= 1
  ));
}

async function readLayout(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height
      };
    };
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      },
      canvas: rect('#surround-canvas'),
      nav: rect('.surround-section-nav'),
      title: rect('.surround-segment.is-visible .surround-display'),
      primaryAction: rect('.surround-action--primary'),
      footer: rect('.surround-footer'),
      selects: Array.from(document.querySelectorAll('.surround-footer select')).map((element) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      })
    };
  });
}

async function readAccent(page) {
  return page.evaluate(() => {
    const bodyStyle = getComputedStyle(document.body);
    const indicatorStyle = getComputedStyle(document.querySelector('.surround-section-nav__indicator'));
    return {
      accent: bodyStyle.getPropertyValue('--home-accent').trim(),
      indicator: indicatorStyle.backgroundColor
    };
  });
}

function assertHorizontalFit(layout, label) {
  const tolerance = 1;
  assert(
    layout.document.scrollWidth <= layout.document.clientWidth + tolerance &&
    layout.document.bodyScrollWidth <= layout.document.clientWidth + tolerance,
    `${label} generated horizontal scrolling`,
    layout.document
  );
  assert(layout.nav.left >= -tolerance && layout.nav.right <= layout.viewport.width + tolerance, `${label} nav exceeded viewport`, layout.nav);
  assert(layout.title.left >= -tolerance && layout.title.right <= layout.viewport.width + tolerance, `${label} title exceeded viewport`, layout.title);
}

async function verifyProductionAccent() {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    encoding: 'utf8'
  });
  if (build.status !== 0) {
    throw new Error(`Vite production build failed:\n${build.stdout}${build.stderr}`);
  }

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const pageUrl = `${baseUrl}/products/Surround1x0-AKDK/index.html?from=home`;
  const preview = spawn('npm', ['run', 'preview', '--', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let previewOutput = '';
  preview.stdout.on('data', (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on('data', (chunk) => { previewOutput += chunk.toString(); });

  let browser;
  try {
    await waitForServer(pageUrl);
    browser = await chromium.launch();
    const context = await browser.newContext({ colorScheme: 'dark' });
    await context.addInitScript(() => {
      localStorage.setItem('mdw-theme', 'dark');
    });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: 'load' });

    let accentState = await readAccent(page);
    assert(accentState.accent === '#ff344a', 'Production dark theme accent was overridden by the shared theme', accentState);
    assert(accentState.indicator === 'rgb(255, 52, 74)', 'Production dark nav indicator did not use the product accent', accentState);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await page.waitForFunction(() => (
      getComputedStyle(document.querySelector('.surround-section-nav__indicator')).backgroundColor === 'rgb(104, 109, 117)'
    ));
    accentState = await readAccent(page);
    assert(accentState.accent === '#686d75', 'Production light theme accent was overridden by the shared theme', accentState);
    assert(accentState.indicator === 'rgb(104, 109, 117)', 'Production light nav indicator did not use the product accent', accentState);

    await context.close();
  } catch (error) {
    if (preview.exitCode !== null) {
      error.message += `\nVite preview output:\n${previewOutput}`;
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(preview);
  }
}

async function main() {
  await verifyProductionAccent();

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const pageUrl = `${baseUrl}/products/Surround1x0-AKDK/index.html?from=home`;
  const vite = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
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
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: 'dark'
    });
    await context.addInitScript(() => {
      localStorage.setItem('mdw-theme', 'dark');
      localStorage.setItem('mdw-lang', 'ja');
    });
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: 'load' });
    await waitFor3d(page);

    let rendererState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(rendererState.theme === 'dark', 'Dark theme did not select the black renderer state', rendererState);
    assert(rendererState.modelUrls.dark.endsWith('Surround1x0-AKDK-Black.glb'), 'Black GLB URL is incorrect', rendererState);
    assert(rendererState.exitMotion === 'cubic-diagonal-forward-twist', 'Exit motion did not use the cubic diagonal forward twist', rendererState);
    assert(rendererState.exitCurve === 'cubic-bezier', 'Exit motion did not use its dedicated cubic curve', rendererState);
    assert(rendererState.exitCorner === 'outer-back', 'Exit twist was not anchored to the outer-back corner direction', rendererState);
    assert(rendererState.twistSpace === 'mirrored-local-diagonal', 'Exit twist did not use mirrored local diagonal axes', rendererState);
    assert(rendererState.exitFade === 'final-third', 'Exit motion did not preserve the model until the final third', rendererState);
    assert(rendererState.materialFade === true, 'Pose opacity was not connected to cloned Three.js materials', rendererState);
    assert(rendererState.foregroundRendering === 'single-canvas', '3D rendering was not consolidated behind the copy', rendererState);
    const desktopExit = rendererState.exitTargets.desktop;
    assert(
      desktopExit.right.x >= 0.7 && desktopExit.right.y >= 0.4 && desktopExit.right.z >= 0.17 && desktopExit.right.scale > 2 &&
      desktopExit.right.cornerTwist >= 0.64 &&
      desktopExit.left.x === -desktopExit.right.x &&
      desktopExit.left.y === desktopExit.right.y && desktopExit.left.z === desktopExit.right.z &&
      desktopExit.left.rotationY === -desktopExit.right.rotationY &&
      desktopExit.left.rotationZ === -desktopExit.right.rotationZ,
      'Left and right exit targets were not mirrored toward the upper camera-side corners',
      desktopExit
    );
    let accentState = await readAccent(page);
    assert(accentState.accent === '#ff344a', 'Dark theme accent did not match the red sphere direction', accentState);
    assert(accentState.indicator === 'rgb(255, 52, 74)', 'Dark nav indicator did not use the red accent', accentState);

    await clickSegment(page, 2);
    let motionState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(motionState.activeScene === 1, 'Segment 02 did not activate right-unit scene', motionState);
    assert(motionState.foregroundSide === 'right', 'Segment 02 did not feature the right unit', motionState);
    assert(motionState.motionKind === 'quadratic-bezier', 'Segment 02 did not use curved motion', motionState);
    assert(motionState.motionEasing === 'smootherstep', 'Segment 02 did not use zero-velocity easing', motionState);
    assert(motionState.scaleOvershoot === false, 'Segment 02 still used scale overshoot', motionState);
    assert(motionState.settling === 'zero-velocity', 'Segment 02 did not expose seamless settling', motionState);
    await page.waitForTimeout(1420);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('surround:segment-change', { detail: { index: 2, source: 'test' } }));
    });
    await page.waitForFunction(() => {
      const pose = window.__SURROUND_3D__?.currentPoses?.right;
      return pose && pose.x > 0.105 && pose.y > 0.07 && pose.z > 0.11 &&
        pose.scale > 1.86 && pose.cornerTwist > 0.4 && pose.foreground > 0.95;
    }, null, { timeout: 1000 });
    const rightExitPose = await page.evaluate(() => window.__SURROUND_3D__.currentPoses.right);
    assert(
      rightExitPose.x > 0.105 && rightExitPose.y > 0.07 && rightExitPose.z > 0.11 &&
      rightExitPose.scale > 1.86 && rightExitPose.cornerTwist > 0.4 &&
      rightExitPose.foreground > 0.95,
      'Right unit did not visibly rise, advance, enlarge, and twist while exiting',
      rightExitPose
    );
    const stackingState = await page.evaluate(() => ({
      content: Number.parseInt(getComputedStyle(document.querySelector('.surround-segments')).zIndex, 10),
      canvas: Number.parseInt(getComputedStyle(document.querySelector('.surround-visual')).zIndex, 10)
    }));
    assert(
      stackingState.content > stackingState.canvas,
      'Segment copy was not stacked above the single 3D canvas',
      stackingState
    );
    await clickSegment(page, 3);
    motionState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(motionState.activeScene === 2, 'Segment 03 did not activate left-unit scene', motionState);
    assert(motionState.foregroundSide === 'left', 'Segment 03 did not feature the left unit', motionState);
    await page.waitForTimeout(1420);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('surround:segment-change', { detail: { index: 1, source: 'test' } }));
    });
    await page.waitForFunction(() => {
      const pose = window.__SURROUND_3D__?.currentPoses?.left;
      return pose && pose.x < -0.105 && pose.y > 0.07 && pose.z > 0.11 &&
        pose.scale > 1.86 && pose.cornerTwist > 0.4 && pose.foreground > 0.95;
    }, null, { timeout: 1000 });
    const leftExitPose = await page.evaluate(() => window.__SURROUND_3D__.currentPoses.left);
    assert(
      leftExitPose.x < -0.105 && leftExitPose.y > 0.07 && leftExitPose.z > 0.11 &&
      leftExitPose.scale > 1.86 && leftExitPose.cornerTwist > 0.4 &&
      leftExitPose.foreground > 0.95,
      'Left unit exit did not mirror the right unit toward the upper-left camera side',
      leftExitPose
    );
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('surround:segment-change', { detail: { index: 2, source: 'test-restore' } }));
    });
    await page.waitForTimeout(1420);
    await clickSegment(page, 4);
    const actionOrder = await page.locator('.surround-actions .surround-action').evaluateAll((elements) => (
      elements.map((element) => ({
        primary: element.classList.contains('surround-action--primary'),
        secondary: element.classList.contains('surround-action--secondary')
      }))
    ));
    assert(
      actionOrder.length === 2 && actionOrder[0].secondary && actionOrder[1].primary,
      'Segment 04 actions were not ordered home-left and repository-right',
      actionOrder
    );

    await page.waitForFunction(() => window.__SURROUND_3D__?.motionActive === false);
    const posesBeforeFooter = await page.evaluate(() => window.__SURROUND_3D__.currentPoses);
    await clickFooter(page);
    await page.waitForTimeout(240);
    const footerState = await page.evaluate(() => {
      const control = document.querySelector('[data-surround-footer-target="surround-footer"]');
      return {
        active: control.classList.contains('is-active'),
        ariaCurrent: control.getAttribute('aria-current'),
        hash: window.location.hash,
        scene: document.body.dataset.surroundScene,
        stop: document.body.dataset.surroundStop,
        motionActive: window.__SURROUND_3D__.motionActive,
        poses: window.__SURROUND_3D__.currentPoses
      };
    });
    assert(
      footerState.active && footerState.ariaCurrent === 'true' && footerState.hash === '#surround-footer' &&
      footerState.scene === '3' && footerState.stop === 'surround-footer',
      'Footer settings segment did not activate at document end while preserving scene 04',
      footerState
    );
    assert(
      footerState.motionActive === false && JSON.stringify(footerState.poses) === JSON.stringify(posesBeforeFooter),
      'Footer settings segment restarted motion for the unchanged scene 04',
      { before: posesBeforeFooter, after: footerState }
    );

    await page.locator('.theme-select').selectOption('light');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light' && window.__SURROUND_3D__?.theme === 'light');
    await page.waitForFunction(() => (
      getComputedStyle(document.querySelector('.surround-section-nav__indicator')).backgroundColor === 'rgb(104, 109, 117)'
    ));
    rendererState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(rendererState.modelUrls.light.endsWith('Surround1x0-AKDK-White.glb'), 'White GLB URL is incorrect', rendererState);
    accentState = await readAccent(page);
    assert(accentState.accent === '#686d75', 'Light theme accent did not match the gray sphere direction', accentState);
    assert(accentState.indicator === 'rgb(104, 109, 117)', 'Light nav indicator did not use the gray accent', accentState);

    let layout = await readLayout(page);
    assertHorizontalFit(layout, 'Desktop segment 04');
    assert(layout.primaryAction.top >= 0 && layout.primaryAction.bottom <= layout.viewport.height, 'Desktop repository link is clipped', layout.primaryAction);
    assert(layout.footer.bottom <= layout.viewport.height + 1, 'Desktop footer is clipped', layout.footer);

    await page.setViewportSize({ width: 874, height: 619 });
    await page.reload({ waitUntil: 'load' });
    await waitFor3d(page);
    await clickSegment(page, 1);
    const intermediateState = await page.evaluate(() => window.__SURROUND_3D__);
    assert(
      intermediateState.heroSpread > 0.14 && intermediateState.heroSpread < 0.17,
      'Intermediate viewport did not pull the hero units inward',
      intermediateState
    );
    layout = await readLayout(page);
    assertHorizontalFit(layout, 'Intermediate segment 01');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'load' });
    await waitFor3d(page);
    for (let number = 1; number <= 4; number += 1) {
      await clickSegment(page, number);
      layout = await readLayout(page);
      assertHorizontalFit(layout, `Mobile segment 0${number}`);
    }
    await clickFooter(page);
    layout = await readLayout(page);
    assertHorizontalFit(layout, 'Mobile footer settings');
    assert(layout.primaryAction.top >= 0 && layout.primaryAction.bottom <= layout.viewport.height, 'Mobile repository link is clipped', layout.primaryAction);
    assert(layout.footer.bottom <= layout.viewport.height + 1, 'Mobile footer is clipped', layout.footer);
    layout.selects.forEach((select, index) => {
      assert(select.left >= 0 && select.right <= layout.viewport.width && select.top >= 0 && select.bottom <= layout.viewport.height, `Mobile footer select ${index + 1} is clipped`, select);
    });

    await context.close();
    console.log('Surround1x0-AKDK segmented Three.js experience passed desktop, mobile, and theme checks.');
  } catch (error) {
    if (vite.exitCode !== null) {
      error.message += `\nVite output:\n${viteOutput}`;
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopProcess(vite);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
