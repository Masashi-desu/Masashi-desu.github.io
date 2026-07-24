/**
 * テスト概要:
 *  - 目的: TypeFetch の操作説明が透明な前景としてヒーローデモへ重なり、スクロール位置に応じて呼び出し・入力・受け渡しの3段階を再現することを確認する。
 *  - 期待値: 操作説明の背景は透明、ヒーローは sticky、左見出しは上詰めで current 行だけ不透過、右手順は右寄せ、番号レールは存在しない。縦に短い viewport では操作説明が画面へ入る前にヒーローデモが上へ移動し、TypeFetch入力パネル全体が見えて操作できる。モバイルでは前面アプリの外枠は viewport 幅へ追従する一方、本文の文字、ウィンドウバー、余白、フッター操作は小さい縮尺を保つ。操作説明の先頭が viewport 中央へ到達するまではヒーローが操作可能で、中央を越えてから同じデモが現在位置から viewport 中央へ連続移動・縮小し、逆方向も連続する。ルール終端側からストーリーへ再進入した後にヒーローへ戻っても、デモは画面外へ消えず、その時点のヒーロー内の実位置まで連続して戻る。各手順の中央表示時に対応する手順が current となり、2段階目では入力、3段階目では前面アプリへの挿入が反映される。ルールセクションは半透明で、最終状態の固定デモを同セクションの終端まで維持する。先頭へ戻ると手動デモの初期状態へ復帰する。
 *  - 検証方法: ローカル静的サーバーで TypeFetch を開き、390px と 426px 幅で前面アプリの viewport 幅比、文字サイズ、バー、余白、フッター配置を算出スタイルから確認する。短い viewport で説明領域が画面外にある間のデモ移動量、入力パネル下端、focus 状態を確認し、複数 viewport で中央引き継ぎ線の直前・直後の active/inert/focus 状態を確認する。続いて Chromium の 1387 × 994 viewport で切り替え前後のデモ矩形を animation frame ごとに採取し、各手順とルールセクションを順に中央へスクロールする。さらに 1280 × 666 viewport でルール終端側から再進入して上方向へ戻り、デモが全フレームで viewport 内に残り、終点でも座標ジャンプせず relative 配置へ復帰することを確認する。公開状態 API、textarea 値、aria 属性、console/page error も取得する。
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const VIEWPORT = { width: 1387, height: 994 };
const EXPECTED_SAMPLE = '入力した文字を、前面へ。';

function serveStatic(request, response) {
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname.replace(/^\//u, ''));
  if (filePath.endsWith(path.sep)) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!filePath.startsWith(ROOT)) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    const contentTypes = {
      '.css': 'text/css; charset=utf-8',
      '.gif': 'image/gif',
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };
    response.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    response.end(data);
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

function assertMonotonic(values, direction, label) {
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const isValid = direction === 'decreasing' ? delta <= 1 : delta >= -1;
    assert(isValid, `${label} was not ${direction}: ${JSON.stringify(values)}`);
  }
}

async function captureHeroHandoff(page, direction) {
  const before = await page.evaluate(async (requestedDirection) => {
    document.documentElement.style.scrollBehavior = 'auto';
    const manual = document.querySelector('#manual');
    const demo = document.querySelector('.tf-demo');
    const target = document.querySelector('.tf-target-window');
    const story = document.querySelector('[data-operation-story]');
    const absoluteTop = window.scrollY + manual.getBoundingClientRect().top;
    const boundaryScroll = absoluteTop - window.innerHeight * 0.5;

    window.scrollTo(0, requestedDirection === 'forward' ? boundaryScroll - 2 : boundaryScroll + 3);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const demoRect = demo.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const start = {
      centerY: demoRect.top + demoRect.height / 2,
      targetWidth: targetRect.width,
      manualTop: manual.getBoundingClientRect().top,
      active: story.classList.contains('is-manual-active')
    };

    window.scrollTo(0, requestedDirection === 'forward' ? boundaryScroll + 3 : boundaryScroll - 2);
    const samples = [];
    await new Promise((resolve) => {
      const sample = () => {
        const currentDemoRect = demo.getBoundingClientRect();
        const currentTargetRect = target.getBoundingClientRect();
        samples.push({
          centerY: currentDemoRect.top + currentDemoRect.height / 2,
          targetWidth: currentTargetRect.width,
          manualTop: manual.getBoundingClientRect().top
        });
        if (samples.length >= 34) {
          resolve();
          return;
        }
        window.requestAnimationFrame(sample);
      };
      window.requestAnimationFrame(sample);
    });

    return {
      start,
      samples,
      viewportCenterY: window.innerHeight / 2
    };
  }, direction);

  return before;
}

async function captureReverseHandoffAfterBottomReentry(page) {
  return page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    const manual = document.querySelector('#manual');
    const demo = document.querySelector('.tf-demo');
    const target = document.querySelector('.tf-target-window');
    const story = document.querySelector('[data-operation-story]');
    const rules = document.querySelector('.tf-rules');
    const topbarHeight = document.querySelector('.tf-topbar')?.getBoundingClientRect().height ?? 0;
    const absoluteTop = window.scrollY + manual.getBoundingClientRect().top;
    const absoluteBottom = window.scrollY + rules.getBoundingClientRect().bottom;
    const boundaryScroll = absoluteTop - window.innerHeight * 0.5;

    window.scrollTo(0, absoluteBottom - topbarHeight + 2);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    window.scrollTo(0, absoluteBottom - topbarHeight - 3);
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    window.scrollTo(0, boundaryScroll + 3);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const startDemoRect = demo.getBoundingClientRect();
    const startTargetRect = target.getBoundingClientRect();
    const start = {
      active: story.classList.contains('is-manual-active'),
      centerY: startDemoRect.top + startDemoRect.height / 2,
      position: getComputedStyle(demo).position,
      targetWidth: startTargetRect.width
    };

    window.scrollTo(0, boundaryScroll - 2);
    const samples = [];
    await new Promise((resolve) => {
      const sample = () => {
        const demoRect = demo.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        samples.push({
          centerY: demoRect.top + demoRect.height / 2,
          top: demoRect.top,
          bottom: demoRect.bottom,
          targetWidth: targetRect.width
        });
        if (samples.length >= 34) {
          resolve();
          return;
        }
        window.requestAnimationFrame(sample);
      };
      window.requestAnimationFrame(sample);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const settledDemoRect = demo.getBoundingClientRect();
    const settledTargetRect = target.getBoundingClientRect();
    return {
      start,
      samples,
      settled: {
        centerY: settledDemoRect.top + settledDemoRect.height / 2,
        top: settledDemoRect.top,
        bottom: settledDemoRect.bottom,
        position: getComputedStyle(demo).position,
        targetWidth: settledTargetRect.width
      },
      viewportHeight: window.innerHeight
    };
  });
}

async function verifyDeferredControlHandoff(page, viewport) {
  await page.setViewportSize(viewport);
  const setup = await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

    const manual = document.querySelector('#manual');
    const hero = document.querySelector('.tf-hero');
    const demo = document.querySelector('.tf-demo');
    const input = document.querySelector('#tf-callout-input');
    const story = document.querySelector('[data-operation-story]');
    const absoluteTop = window.scrollY + manual.getBoundingClientRect().top;
    const boundaryScroll = absoluteTop - window.innerHeight * 0.5;

    window.scrollTo(0, boundaryScroll - 3);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    return {
      before: {
        active: story.classList.contains('is-manual-active'),
        heroInert: hero.inert,
        demoPosition: getComputedStyle(demo).position,
        manualTopDelta: manual.getBoundingClientRect().top - window.innerHeight * 0.5
      },
      boundaryScroll
    };
  });

  await page.locator('#tf-callout-input').click({ position: { x: 16, y: 16 } });
  const inputFocused = await page.locator('#tf-callout-input').evaluate((input) => document.activeElement === input);
  const after = await page.evaluate(async (boundaryScroll) => {
    const manual = document.querySelector('#manual');
    const hero = document.querySelector('.tf-hero');
    const demo = document.querySelector('.tf-demo');
    const story = document.querySelector('[data-operation-story]');
    window.scrollTo(0, boundaryScroll + 3);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    return {
      active: story.classList.contains('is-manual-active'),
      heroInert: hero.inert,
      demoPosition: getComputedStyle(demo).position,
      manualTopDelta: manual.getBoundingClientRect().top - window.innerHeight * 0.5
    };
  }, setup.boundaryScroll);

  const state = {
    before: { ...setup.before, inputFocused },
    after,
    viewport
  };

  assert(state.before.manualTopDelta > 0, `The pre-handoff sample was not before the viewport center: ${JSON.stringify(state)}`);
  assert(!state.before.active, `The story took control before the manual reached viewport center: ${JSON.stringify(state)}`);
  assert(!state.before.heroInert, `The hero became inert before the manual reached viewport center: ${JSON.stringify(state)}`);
  assert(state.before.inputFocused, `The hero input was not operable before the handoff: ${JSON.stringify(state)}`);
  assert(state.before.demoPosition === 'relative', `The demo left its hero position before the handoff: ${JSON.stringify(state)}`);
  assert(state.after.manualTopDelta < 0, `The post-handoff sample did not cross the viewport center: ${JSON.stringify(state)}`);
  assert(state.after.manualTopDelta >= -8, `The manual jumped past the viewport center during the handoff: ${JSON.stringify(state)}`);
  assert(state.after.active, `The story did not take control after crossing viewport center: ${JSON.stringify(state)}`);
  assert(state.after.heroInert, `The hero did not become inert after the handoff: ${JSON.stringify(state)}`);
  assert(state.after.demoPosition === 'fixed', `The demo did not begin its fixed transition after the handoff: ${JSON.stringify(state)}`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !window.TypeFetchScrollStory.getState().active);
  await page.waitForTimeout(480);
}

async function verifyMobileTargetVisualHierarchy(page) {
  const samples = [];

  for (const width of [390, 426]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => !window.TypeFetchScrollStory.getState().active);

    samples.push(await page.evaluate(() => {
      const target = document.querySelector('.tf-target-window');
      const targetRect = target.getBoundingClientRect();
      const input = document.querySelector('#tf-target-input');
      const bar = document.querySelector('.tf-target-window__bar');
      const light = document.querySelector('.tf-target-window__lights i');
      const body = document.querySelector('.tf-target-window__body');
      const footer = document.querySelector('.tf-target-window__footer');
      const openButton = document.querySelector('.tf-open-button');
      const inputFontSize = Number.parseFloat(getComputedStyle(input).fontSize);

      return {
        viewportWidth: window.innerWidth,
        targetViewportWidthRatio: targetRect.width / window.innerWidth,
        inputFontSize,
        inputFontViewportRatio: inputFontSize / window.innerWidth,
        barHeight: bar.getBoundingClientRect().height,
        lightDiameter: light.getBoundingClientRect().width,
        bodyPaddingLeft: Number.parseFloat(getComputedStyle(body).paddingLeft),
        footerFlexDirection: getComputedStyle(footer).flexDirection,
        openButtonHeight: openButton.getBoundingClientRect().height,
        openButtonWidthRatio: openButton.getBoundingClientRect().width / targetRect.width
      };
    }));
  }

  for (const sample of samples) {
    assert(sample.targetViewportWidthRatio >= 0.9, `Mobile target app did not follow the viewport width: ${JSON.stringify(samples)}`);
    assert(sample.inputFontSize <= 24, `Mobile target text was too large: ${JSON.stringify(samples)}`);
    assert(sample.inputFontViewportRatio <= 0.06, `Mobile target text did not keep a compact viewport-relative scale: ${JSON.stringify(samples)}`);
    assert(sample.barHeight <= 42, `Mobile target window bar was too tall: ${JSON.stringify(samples)}`);
    assert(sample.lightDiameter <= 8, `Mobile target window controls were too large: ${JSON.stringify(samples)}`);
    assert(sample.bodyPaddingLeft <= 16, `Mobile target window padding was too large: ${JSON.stringify(samples)}`);
    assert(sample.footerFlexDirection === 'row', `Mobile target footer did not keep the compact horizontal layout: ${JSON.stringify(samples)}`);
    assert(sample.openButtonHeight >= 44, `Mobile target open button did not keep a usable touch target: ${JSON.stringify(samples)}`);
    assert(sample.openButtonWidthRatio < 0.6, `Mobile target open button occupied too much width: ${JSON.stringify(samples)}`);
  }

  assert(
    samples[1].inputFontSize > samples[0].inputFontSize,
    `Mobile target text did not follow the viewport width within its compact scale: ${JSON.stringify(samples)}`
  );

  await page.setViewportSize(VIEWPORT);
  await page.evaluate(() => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }));
  await page.waitForTimeout(480);
}

async function verifyPreviewApproachBeforeManual(page) {
  const viewport = { width: 1280, height: 666 };
  await page.setViewportSize(viewport);
  const setup = await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    const manual = document.querySelector('#manual');
    const demo = document.querySelector('.tf-demo');
    const callout = document.querySelector('.tf-callout');
    const absoluteManualTop = window.scrollY + manual.getBoundingClientRect().top;
    return {
      revealScroll: absoluteManualTop - window.innerHeight,
      initialDemoTop: demo.getBoundingClientRect().top,
      initialCalloutBottom: callout.getBoundingClientRect().bottom
    };
  });

  assert(setup.initialCalloutBottom > viewport.height, `The short-viewport fixture did not begin with a clipped input panel: ${JSON.stringify(setup)}`);

  await page.evaluate(async (revealScroll) => {
    window.scrollTo(0, revealScroll - 2);
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  }, setup.revealScroll);
  await page.locator('#tf-callout-input').click({ position: { x: 16, y: 16 } });
  const approached = await page.evaluate(() => {
    const manual = document.querySelector('#manual');
    const demo = document.querySelector('.tf-demo');
    const callout = document.querySelector('.tf-callout');
    const story = document.querySelector('[data-operation-story]');
    return {
      active: story.classList.contains('is-manual-active'),
      heroInert: document.querySelector('.tf-hero').inert,
      inputFocused: document.activeElement === document.querySelector('#tf-callout-input'),
      manualTop: manual.getBoundingClientRect().top,
      demoTop: demo.getBoundingClientRect().top,
      demoBottom: demo.getBoundingClientRect().bottom,
      calloutBottom: callout.getBoundingClientRect().bottom,
      approachProgress: Number.parseFloat(getComputedStyle(story).getPropertyValue('--tf-demo-approach-progress'))
    };
  });

  assert(approached.manualTop > viewport.height, `The manual entered the viewport before the preview approach finished: ${JSON.stringify({ setup, approached })}`);
  assert(approached.demoTop < setup.initialDemoTop - 40, `The preview did not move upward before the manual appeared: ${JSON.stringify({ setup, approached })}`);
  assert(approached.demoBottom <= viewport.height - 10, `The full preview was still clipped even though it fits the viewport: ${JSON.stringify({ setup, approached })}`);
  assert(approached.calloutBottom <= viewport.height - 10, `The TypeFetch panel was still clipped after the preview approach: ${JSON.stringify({ setup, approached })}`);
  assert(!approached.active && !approached.heroInert, `The story took control during the preview approach: ${JSON.stringify({ setup, approached })}`);
  assert(approached.inputFocused, `The TypeFetch panel was not operable after moving into view: ${JSON.stringify({ setup, approached })}`);
  assert(approached.approachProgress >= 0.99, `The preview approach did not finish before the manual appeared: ${JSON.stringify({ setup, approached })}`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !window.TypeFetchScrollStory.getState().active);
}

async function scrollMoveToStoryLine(page, index) {
  await page.locator('.tf-move__key').nth(index).evaluate((keyRow) => {
    document.documentElement.style.scrollBehavior = 'auto';
    const absoluteTop = window.scrollY + keyRow.getBoundingClientRect().top;
    window.scrollTo(0, absoluteTop - window.innerHeight * 0.55);
  });
  await page.waitForFunction((expectedStep) => (
    window.TypeFetchScrollStory?.getState().step === expectedStep
  ), index + 1);
  await page.waitForFunction((currentIndex) => {
    const opacities = Array.from(document.querySelectorAll('.tf-manual__title-step'))
      .map((step) => Number(getComputedStyle(step).opacity));
    return opacities[currentIndex] === 1
      && opacities.every((opacity, opacityIndex) => opacityIndex === currentIndex || opacity <= 0.5);
  }, index);
  await page.waitForFunction(() => {
    const demo = document.querySelector('.tf-demo');
    const rect = demo.getBoundingClientRect();
    return getComputedStyle(demo).position === 'fixed'
      && Math.abs((rect.top + rect.height / 2) - window.innerHeight / 2) <= 1;
  });
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      reducedMotion: 'no-preference'
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const { url } = message.location();
        consoleErrors.push(url ? `${message.text()} (${url})` : message.text());
      }
    });

    await page.goto(`http://127.0.0.1:${port}/products/TypeFetch/index.html?from=home`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForFunction(() => Boolean(window.TypeFetchScrollStory));

    const initial = await page.evaluate(() => ({
      heroPosition: getComputedStyle(document.querySelector('.tf-hero')).position,
      manualBackground: getComputedStyle(document.querySelector('.tf-manual')).backgroundColor,
      targetValue: document.querySelector('#tf-target-input').value,
      calloutHidden: document.querySelector('#tf-callout').getAttribute('aria-hidden'),
      numberRailCount: document.querySelectorAll('.tf-move__number').length,
      moveTextAlign: getComputedStyle(document.querySelector('.tf-move__body')).textAlign,
      keyJustification: getComputedStyle(document.querySelector('.tf-move__key')).justifyContent,
      headerAlignment: getComputedStyle(document.querySelector('.tf-manual__header')).alignItems,
      titleStepCount: document.querySelectorAll('.tf-manual__title-step').length,
      titleLefts: Array.from(document.querySelectorAll('.tf-manual__title-step')).map((step) => Math.round(step.getBoundingClientRect().left)),
      pageTransitionTransform: getComputedStyle(document.querySelector('.tf-page')).transform,
      demoSurfaceCount: document.querySelectorAll('.tf-demo > .tf-demo__surface').length,
      rulesBackground: getComputedStyle(document.querySelector('.tf-rules')).backgroundColor,
      rulesInsideStory: Boolean(document.querySelector('.tf-rules').closest('[data-operation-story]'))
    }));
    assert(initial.heroPosition === 'sticky', `Hero was not sticky: ${JSON.stringify(initial)}`);
    assert(initial.manualBackground === 'rgba(0, 0, 0, 0)', `Manual background was not transparent: ${JSON.stringify(initial)}`);
    assert(initial.numberRailCount === 0, `The vertical number rail remained: ${JSON.stringify(initial)}`);
    assert(initial.moveTextAlign === 'right', `Move cards were not right aligned: ${JSON.stringify(initial)}`);
    assert(initial.keyJustification === 'flex-end', `Move key rows were not right aligned: ${JSON.stringify(initial)}`);
    assert(initial.headerAlignment === 'flex-start', `Manual header was not aligned from the upper left: ${JSON.stringify(initial)}`);
    assert(initial.titleStepCount === 3, `Manual title was not split into three scroll states: ${JSON.stringify(initial)}`);
    assert(new Set(initial.titleLefts).size === 1, `Manual title lines did not share the same left edge: ${JSON.stringify(initial)}`);
    assert(initial.pageTransitionTransform === 'none', `The page entrance created a fixed-position containing block: ${JSON.stringify(initial)}`);
    assert(initial.demoSurfaceCount === 1, `The demo transition surface was missing: ${JSON.stringify(initial)}`);
    assert(initial.rulesInsideStory, `The rules section was outside the scroll story: ${JSON.stringify(initial)}`);
    assert(
      /^rgba\(\s*16,\s*19,\s*29,\s*0\.\d+\s*\)$/u.test(initial.rulesBackground),
      `The rules section background was not translucent: ${JSON.stringify(initial)}`
    );

    await verifyMobileTargetVisualHierarchy(page);
    await verifyPreviewApproachBeforeManual(page);
    await verifyDeferredControlHandoff(page, { width: 1387, height: 815 });
    await verifyDeferredControlHandoff(page, { width: 599, height: 994 });
    await page.setViewportSize(VIEWPORT);

    const forwardHandoff = await captureHeroHandoff(page, 'forward');
    const forwardCenters = forwardHandoff.samples.map((sample) => sample.centerY);
    const forwardWidths = forwardHandoff.samples.map((sample) => sample.targetWidth);
    const forwardManualTops = forwardHandoff.samples.map((sample) => sample.manualTop);
    assert(!forwardHandoff.start.active, `The forward handoff did not start in the hero: ${JSON.stringify(forwardHandoff)}`);
    assert(Math.abs(forwardCenters[0] - forwardHandoff.start.centerY) <= 1, `The demo jumped when the manual became active: ${JSON.stringify(forwardHandoff)}`);
    assertMonotonic(forwardCenters, 'decreasing', 'Forward demo centers');
    assertMonotonic(forwardWidths, 'decreasing', 'Forward demo widths');
    assert(forwardManualTops.every((top) => Math.abs(top - forwardManualTops[0]) <= 1), `The manual shifted while the demo entered the story: ${JSON.stringify(forwardHandoff)}`);
    assert(Math.abs(forwardCenters.at(-1) - forwardHandoff.viewportCenterY) <= 1, `The forward handoff did not settle at viewport center: ${JSON.stringify(forwardHandoff)}`);

    const reverseHandoff = await captureHeroHandoff(page, 'reverse');
    const reverseCenters = reverseHandoff.samples.map((sample) => sample.centerY);
    const reverseWidths = reverseHandoff.samples.map((sample) => sample.targetWidth);
    assert(reverseHandoff.start.active, `The reverse handoff did not start in the manual: ${JSON.stringify(reverseHandoff)}`);
    assert(Math.abs(reverseCenters[0] - reverseHandoff.start.centerY) <= 1, `The demo jumped when returning to the hero: ${JSON.stringify(reverseHandoff)}`);
    assertMonotonic(reverseCenters, 'increasing', 'Reverse demo centers');
    assertMonotonic(reverseWidths, 'increasing', 'Reverse demo widths');
    assert(Math.abs(reverseCenters.at(-1) - forwardHandoff.start.centerY) <= 1, `The reverse handoff did not settle at the hero position: ${JSON.stringify(reverseHandoff)}`);

    await scrollMoveToStoryLine(page, 0);
    const stepOne = await page.evaluate(() => ({
      state: window.TypeFetchScrollStory.getState(),
      current: Array.from(document.querySelectorAll('.tf-move')).findIndex((move) => move.classList.contains('is-current')) + 1,
      calloutHidden: document.querySelector('#tf-callout').getAttribute('aria-hidden'),
      heroInert: document.querySelector('.tf-hero').inert,
      demoPosition: getComputedStyle(document.querySelector('.tf-demo')).position,
      demoCenterDelta: (() => {
        const rect = document.querySelector('.tf-demo').getBoundingClientRect();
        return Math.abs((rect.top + rect.height / 2) - window.innerHeight / 2);
      })(),
      demoOpacity: Number(getComputedStyle(document.querySelector('.tf-demo')).opacity),
      titleOpacities: Array.from(document.querySelectorAll('.tf-manual__title-step')).map((step) => Number(getComputedStyle(step).opacity))
    }));
    assert(stepOne.current === 1, `Step 01 was not current: ${JSON.stringify(stepOne)}`);
    assert(stepOne.calloutHidden === 'false', `Step 01 did not show TypeFetch: ${JSON.stringify(stepOne)}`);
    assert(stepOne.heroInert, `Background hero remained interactive during the story: ${JSON.stringify(stepOne)}`);
    assert(stepOne.demoPosition === 'fixed', `Background demo was not fixed to the viewport: ${JSON.stringify(stepOne)}`);
    assert(stepOne.demoCenterDelta <= 1, `Background demo was not vertically centered: ${JSON.stringify(stepOne)}`);
    assert(stepOne.demoOpacity >= 0.9, `Background demo was not legible enough during the story: ${JSON.stringify(stepOne)}`);
    assert(stepOne.titleOpacities[0] === 1 && stepOne.titleOpacities.slice(1).every((opacity) => opacity <= 0.5), `Step 01 title emphasis was incorrect: ${JSON.stringify(stepOne)}`);

    await scrollMoveToStoryLine(page, 1);
    const stepTwo = await page.evaluate(() => ({
      state: window.TypeFetchScrollStory.getState(),
      current: Array.from(document.querySelectorAll('.tf-move')).findIndex((move) => move.classList.contains('is-current')) + 1,
      calloutValue: document.querySelector('#tf-callout-input').value,
      calloutHidden: document.querySelector('#tf-callout').getAttribute('aria-hidden'),
      titleOpacities: Array.from(document.querySelectorAll('.tf-manual__title-step')).map((step) => Number(getComputedStyle(step).opacity))
    }));
    assert(stepTwo.current === 2, `Step 02 was not current: ${JSON.stringify(stepTwo)}`);
    assert(stepTwo.calloutValue.length > 0, `Step 02 did not type into TypeFetch: ${JSON.stringify(stepTwo)}`);
    assert(EXPECTED_SAMPLE.startsWith(stepTwo.calloutValue), `Step 02 typed unexpected text: ${JSON.stringify(stepTwo)}`);
    assert(stepTwo.calloutHidden === 'false', `Step 02 hid TypeFetch too early: ${JSON.stringify(stepTwo)}`);
    assert(stepTwo.titleOpacities[1] === 1 && [stepTwo.titleOpacities[0], stepTwo.titleOpacities[2]].every((opacity) => opacity <= 0.5), `Step 02 title emphasis was incorrect: ${JSON.stringify(stepTwo)}`);

    await scrollMoveToStoryLine(page, 2);
    const stepThree = await page.evaluate(() => ({
      state: window.TypeFetchScrollStory.getState(),
      current: Array.from(document.querySelectorAll('.tf-move')).findIndex((move) => move.classList.contains('is-current')) + 1,
      targetValue: document.querySelector('#tf-target-input').value,
      calloutHidden: document.querySelector('#tf-callout').getAttribute('aria-hidden'),
      titleOpacities: Array.from(document.querySelectorAll('.tf-manual__title-step')).map((step) => Number(getComputedStyle(step).opacity))
    }));
    assert(stepThree.current === 3, `Step 03 was not current: ${JSON.stringify(stepThree)}`);
    assert(stepThree.targetValue === `${initial.targetValue} ${EXPECTED_SAMPLE}`, `Step 03 did not insert the sample: ${JSON.stringify(stepThree)}`);
    assert(stepThree.calloutHidden === 'true', `Step 03 did not close TypeFetch: ${JSON.stringify(stepThree)}`);
    assert(stepThree.titleOpacities[2] === 1 && stepThree.titleOpacities.slice(0, 2).every((opacity) => opacity <= 0.5), `Step 03 title emphasis was incorrect: ${JSON.stringify(stepThree)}`);

    await page.locator('.tf-rules').evaluate((rules) => {
      const absoluteTop = window.scrollY + rules.getBoundingClientRect().top;
      window.scrollTo(0, absoluteTop + Math.min(rules.offsetHeight * 0.24, window.innerHeight * 0.3));
    });
    await page.waitForFunction(() => {
      const rect = document.querySelector('.tf-rules').getBoundingClientRect();
      return rect.top < window.innerHeight * 0.35 && rect.bottom > window.innerHeight * 0.65;
    });
    await page.waitForFunction(() => {
      const demo = document.querySelector('.tf-demo');
      const rect = demo.getBoundingClientRect();
      return window.TypeFetchScrollStory.getState().active
        && window.TypeFetchScrollStory.getState().step === 3
        && getComputedStyle(demo).position === 'fixed'
        && Math.abs((rect.top + rect.height / 2) - window.innerHeight / 2) <= 1;
    });

    const rulesState = await page.evaluate(() => {
      const rules = document.querySelector('.tf-rules');
      const demo = document.querySelector('.tf-demo');
      const demoRect = demo.getBoundingClientRect();
      const background = getComputedStyle(rules).backgroundColor;
      const alphaMatch = background.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)/u);

      return {
        story: window.TypeFetchScrollStory.getState(),
        demoPosition: getComputedStyle(demo).position,
        demoCenterDelta: Math.abs((demoRect.top + demoRect.height / 2) - window.innerHeight / 2),
        rulesBackground: background,
        rulesAlpha: alphaMatch ? Number(alphaMatch[1]) : 1,
        calloutHidden: document.querySelector('#tf-callout').getAttribute('aria-hidden'),
        targetValue: document.querySelector('#tf-target-input').value
      };
    });
    assert(rulesState.story.active, `The scroll story ended before the rules section: ${JSON.stringify(rulesState)}`);
    assert(rulesState.story.step === 3, `The rules section did not preserve the final demo state: ${JSON.stringify(rulesState)}`);
    assert(rulesState.demoPosition === 'fixed', `The app demo was not fixed behind the rules section: ${JSON.stringify(rulesState)}`);
    assert(rulesState.demoCenterDelta <= 1, `The app demo was not vertically centered behind the rules section: ${JSON.stringify(rulesState)}`);
    assert(rulesState.rulesAlpha > 0 && rulesState.rulesAlpha < 1, `The rules section was not translucent: ${JSON.stringify(rulesState)}`);
    assert(rulesState.calloutHidden === 'true', `The final demo panel state changed behind the rules section: ${JSON.stringify(rulesState)}`);
    assert(rulesState.targetValue === `${initial.targetValue} ${EXPECTED_SAMPLE}`, `The inserted text did not persist through the rules section: ${JSON.stringify(rulesState)}`);

    await page.locator('.tf-rules').evaluate((rules) => {
      const absoluteBottom = window.scrollY + rules.getBoundingClientRect().bottom;
      const topbarHeight = document.querySelector('.tf-topbar')?.getBoundingClientRect().height ?? 0;
      window.scrollTo(0, absoluteBottom - topbarHeight + 2);
    });
    await page.waitForFunction(() => !window.TypeFetchScrollStory.getState().active);

    await page.setViewportSize({ width: 1280, height: 666 });
    await page.locator('.tf-rules').evaluate((rules) => {
      const absoluteBottom = window.scrollY + rules.getBoundingClientRect().bottom;
      const topbarHeight = document.querySelector('.tf-topbar')?.getBoundingClientRect().height ?? 0;
      window.scrollTo(0, absoluteBottom - topbarHeight + 2);
    });
    await page.waitForFunction(() => !window.TypeFetchScrollStory.getState().active);
    const bottomReentryReturn = await captureReverseHandoffAfterBottomReentry(page);
    const bottomReentryCenters = bottomReentryReturn.samples.map((sample) => sample.centerY);
    const bottomReentryWidths = bottomReentryReturn.samples.map((sample) => sample.targetWidth);
    assert(bottomReentryReturn.start.active, `The story did not reactivate while returning from below: ${JSON.stringify(bottomReentryReturn)}`);
    assert(bottomReentryReturn.start.position === 'fixed', `The reentered story demo was not fixed: ${JSON.stringify(bottomReentryReturn)}`);
    assert(
      Math.abs(bottomReentryReturn.samples[0].centerY - bottomReentryReturn.start.centerY) <= 1,
      `The demo jumped when the bottom-reentry return began: ${JSON.stringify(bottomReentryReturn)}`
    );
    assertMonotonic(bottomReentryCenters, 'increasing', 'Bottom-reentry reverse demo centers');
    assertMonotonic(bottomReentryWidths, 'increasing', 'Bottom-reentry reverse demo widths');
    assert(
      bottomReentryReturn.samples.every((sample) => sample.bottom > 0 && sample.top < bottomReentryReturn.viewportHeight),
      `The demo left the viewport during the bottom-reentry return: ${JSON.stringify(bottomReentryReturn)}`
    );
    assert(
      Math.abs(bottomReentryReturn.samples.at(-1).centerY - bottomReentryReturn.settled.centerY) <= 1,
      `The demo jumped at the end of the bottom-reentry return: ${JSON.stringify(bottomReentryReturn)}`
    );
    assert(bottomReentryReturn.settled.position === 'relative', `The demo did not settle back into hero flow: ${JSON.stringify(bottomReentryReturn)}`);

    await page.setViewportSize(VIEWPORT);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(({ targetValue, calloutHidden }) => (
      !window.TypeFetchScrollStory.getState().active
      && document.querySelector('#tf-target-input').value === targetValue
      && document.querySelector('#tf-callout').getAttribute('aria-hidden') === calloutHidden
    ), {
      targetValue: initial.targetValue,
      calloutHidden: initial.calloutHidden
    });
    const restored = await page.evaluate(() => ({
      targetValue: document.querySelector('#tf-target-input').value,
      calloutHidden: document.querySelector('#tf-callout').getAttribute('aria-hidden'),
      heroInert: document.querySelector('.tf-hero').inert
    }));
    assert(restored.targetValue === initial.targetValue, `Returning to the hero did not restore its target text: ${JSON.stringify(restored)}`);
    assert(restored.calloutHidden === initial.calloutHidden, `Returning to the hero did not restore its callout: ${JSON.stringify(restored)}`);
    assert(!restored.heroInert, `Returning to the hero left it inert: ${JSON.stringify(restored)}`);

    await page.setViewportSize({ width: 390, height: 844 });
    await scrollMoveToStoryLine(page, 1);
    const mobileCenter = await page.evaluate(() => {
      const demo = document.querySelector('.tf-demo');
      const rect = demo.getBoundingClientRect();
      const targetRect = document.querySelector('.tf-target-window').getBoundingClientRect();
      const calloutRect = document.querySelector('.tf-callout').getBoundingClientRect();
      return {
        centerDelta: Math.abs((rect.top + rect.height / 2) - window.innerHeight / 2),
        calloutRatio: calloutRect.width / calloutRect.height,
        targetViewportWidthRatio: targetRect.width / window.innerWidth,
        calloutFitsTarget: calloutRect.width <= targetRect.width && calloutRect.height <= targetRect.height,
        position: getComputedStyle(demo).position,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    });
    assert(mobileCenter.position === 'fixed', `Mobile demo was not fixed to the viewport: ${JSON.stringify(mobileCenter)}`);
    assert(mobileCenter.centerDelta <= 1, `Mobile demo was not vertically centered: ${JSON.stringify(mobileCenter)}`);
    assert(mobileCenter.targetViewportWidthRatio >= 0.9, `Mobile target app did not follow the viewport width: ${JSON.stringify(mobileCenter)}`);
    assert(Math.abs(mobileCenter.calloutRatio - (560 / 388)) <= 0.02, `Mobile TypeFetch panel did not preserve its aspect ratio: ${JSON.stringify(mobileCenter)}`);
    assert(mobileCenter.calloutFitsTarget, `Mobile TypeFetch panel did not fit inside the target app: ${JSON.stringify(mobileCenter)}`);

    assert(pageErrors.length === 0, `Page errors were reported: ${pageErrors.join(' | ')}`);
    assert(consoleErrors.length === 0, `Console errors were reported: ${consoleErrors.join(' | ')}`);

    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  // eslint-disable-next-line no-console
  console.log('TypeFetch scroll story keeps the manual transparent and synchronizes all three demo steps.');
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
