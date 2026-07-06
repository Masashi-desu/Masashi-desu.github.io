/**
 * テスト概要:
 *  - 目的: ホームのプロダクトカード carousel(Embla Carousel + AutoScroll)がスマホ表示でも
 *    transform ベースで無限ループし、ネイティブタッチスワイプ中もカードが消えず、DOM の
 *    カード数が操作中に変化せず、操作中は自動スクロールが停止して後で再開することを検証する。
 *  - 期待値: iPhone 幅で Embla の loop が有効になり、自動移動は約 26px/s で track の transform
 *    として進む。タッチスワイプの最中・後も可視カードが 1 枚以上あり、カード数は描画時から
 *    一定のまま(スクロール中の DOM 追加/削除なし)。縦スワイプはセクション移動に渡される。
 *    carousel領域は透明背景かつ通常時の影なしで、viewport resize 後もカードが表示される。
 *  - 検証方法: ローカル静的サーバーでトップページを配信し、Playwright の Chromium/WebKit
 *    mobile context で Embla API(grid.emblaApi)・computed transform・カード矩形を計測する。
 *    ネイティブタッチは CDP(Chromium のみ)で送出する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, webkit, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '../../');
const MOBILE_VIEWPORT = { width: 393, height: 852 };
const EXPECTED_SPEED_PX_PER_SEC = 26;
const MAX_EXPECTED_CARD_SETS = 8;

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
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.end(data);
  });
}

function startServer() {
  const server = http.createServer(serveStatic);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function getCarouselState(page) {
  return page.evaluate(() => {
    const grid = document.querySelector('.home-product-grid');
    const track = document.querySelector('.home-product-track');
    const gridRect = grid.getBoundingClientRect();
    const gridStyle = getComputedStyle(grid);
    const trackStyle = getComputedStyle(track);
    const firstCard = document.querySelector('.home-product-card:not(.home-product-card--clone)');
    const firstCardStyle = firstCard ? getComputedStyle(firstCard) : null;
    const transform = trackStyle.transform;
    let trackTranslateX = null;
    if (transform && transform !== 'none') {
      const matrix = transform.match(/matrix\(([^)]+)\)/);
      if (matrix) {
        trackTranslateX = Number.parseFloat(matrix[1].split(',')[4]);
      }
    }
    const api = grid.emblaApi || null;
    const autoScroll = api && api.plugins() ? api.plugins().autoScroll : null;
    const slides = Array.from(document.querySelectorAll('.home-product-slide'));
    const slideWidths = slides.map((slide) => slide.offsetWidth);
    const slideCardWidthGaps = slides.map((slide) => {
      const card = slide.querySelector('.home-product-card');
      return card ? Math.abs(slide.offsetWidth - card.offsetWidth) : Number.POSITIVE_INFINITY;
    });
    const slideOffsets = slides.map((slide) => slide.offsetLeft);
    const slideLayoutDeltas = slideOffsets.slice(1).map((offset, index) => offset - slideOffsets[index]);
    const slideFlexBasis = slides[0] ? getComputedStyle(slides[0]).flexBasis : null;
    const visibleCards = Array.from(document.querySelectorAll('.home-product-card')).filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.right > gridRect.left + 24 && rect.left < gridRect.right - 24;
    }).length;
    return {
      cardCount: document.querySelectorAll('.home-product-card').length,
      cloneCount: document.querySelectorAll('.home-product-card--clone').length,
      slideCount: document.querySelectorAll('.home-product-slide').length,
      setSize: Number.parseInt(gridStyle.getPropertyValue('--home-product-count'), 10),
      emblaReady: Boolean(api),
      emblaLoop: api ? api.internalEngine().options.loop : null,
      autoScrollPlaying: autoScroll ? autoScroll.isPlaying() : null,
      trackTranslateX,
      slideWidthSpread: Math.max(...slideWidths) - Math.min(...slideWidths),
      maxSlideCardWidthGap: Math.max(...slideCardWidthGaps),
      slideLayoutDeltaSpread: slideLayoutDeltas.length > 0
        ? Math.max(...slideLayoutDeltas) - Math.min(...slideLayoutDeltas)
        : 0,
      slideFlexBasis,
      gridOverflowX: gridStyle.overflowX,
      gridBackgroundColor: gridStyle.backgroundColor,
      gridPaddingBottom: gridStyle.paddingBottom,
      trackBackgroundColor: trackStyle.backgroundColor,
      cardBoxShadow: firstCardStyle ? firstCardStyle.boxShadow : null,
      clientWidth: grid.clientWidth,
      trackScrollWidth: track.scrollWidth,
      visibleCards
    };
  });
}

async function dispatchNativeHorizontalSwipe(cdp, startX, endX, y) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y }]
  });
  const steps = 18;
  for (let index = 1; index <= steps; index += 1) {
    const x = startX + ((endX - startX) * index) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y }]
    });
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
}

async function dispatchNativeVerticalSwipe(cdp, x, startY, endY) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: startY }]
  });
  const steps = 14;
  for (let index = 1; index <= steps; index += 1) {
    const y = startY + ((endY - startY) * index) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y }]
    });
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
}

async function assertNativeTouchScrollKeepsCardsVisible(page, context, expectedCardCount) {
  const cdp = await context.newCDPSession(page);
  const gridBox = await page.locator('.home-product-grid').boundingBox();
  if (!gridBox) {
    throw new Error('Expected product carousel bounds before native touch scroll');
  }
  const y = Math.round(gridBox.y + gridBox.height / 2);
  const leftSwipeStart = Math.round(gridBox.x + gridBox.width - 36);
  const leftSwipeEnd = Math.round(gridBox.x + 44);
  const rightSwipeStart = leftSwipeEnd;
  const rightSwipeEnd = leftSwipeStart;

  for (let index = 0; index < 12; index += 1) {
    await dispatchNativeHorizontalSwipe(cdp, leftSwipeStart, leftSwipeEnd, y);
    await page.waitForTimeout(120);
    const duringSwipe = await getCarouselState(page);
    if (duringSwipe.visibleCards < 1) {
      throw new Error(`Expected visible product cards during native left swipes: ${JSON.stringify(duringSwipe)}`);
    }
    if (duringSwipe.cardCount !== expectedCardCount) {
      throw new Error(`Expected card count to stay constant during native left swipes: ${JSON.stringify({ expectedCardCount, duringSwipe })}`);
    }
  }

  for (let index = 0; index < 12; index += 1) {
    await dispatchNativeHorizontalSwipe(cdp, rightSwipeStart, rightSwipeEnd, y);
    await page.waitForTimeout(120);
    const duringSwipe = await getCarouselState(page);
    if (duringSwipe.visibleCards < 1) {
      throw new Error(`Expected visible product cards during native right swipes: ${JSON.stringify(duringSwipe)}`);
    }
    if (duringSwipe.cardCount !== expectedCardCount) {
      throw new Error(`Expected card count to stay constant during native right swipes: ${JSON.stringify({ expectedCardCount, duringSwipe })}`);
    }
  }

  const afterNativeTouch = await getCarouselState(page);
  if (afterNativeTouch.visibleCards < 1 || afterNativeTouch.cardCount !== expectedCardCount) {
    throw new Error(`Expected carousel to stay visible with constant cards after native touch scroll: ${JSON.stringify({ expectedCardCount, afterNativeTouch })}`);
  }

  // 横スワイプはセクション移動を発生させないこと
  const scrollYAfterHorizontal = await page.evaluate(() => window.scrollY);
  const productsSectionTop = await page.evaluate(() => {
    const section = document.getElementById('products-section');
    return Math.round(section.getBoundingClientRect().top + window.scrollY);
  });
  if (Math.abs(scrollYAfterHorizontal - productsSectionTop) > 8) {
    throw new Error(`Expected horizontal swipes not to change the active section: ${JSON.stringify({ scrollYAfterHorizontal, productsSectionTop })}`);
  }

  return cdp;
}

async function assertVerticalSwipeNavigatesSections(page, cdp) {
  const gridBox = await page.locator('.home-product-grid').boundingBox();
  if (!gridBox) {
    throw new Error('Expected product carousel bounds before native vertical swipe');
  }
  const x = Math.round(gridBox.x + gridBox.width / 2);
  const startY = Math.round(gridBox.y + gridBox.height / 2);
  const scrollYBefore = await page.evaluate(() => window.scrollY);
  await dispatchNativeVerticalSwipe(cdp, x, startY, Math.max(24, startY - 220));
  await page.waitForFunction((before) => Math.abs(window.scrollY - before) > 120, scrollYBefore, { timeout: 2600 });
}

async function runCarouselAssertions(browserType, browserName, port) {
  const browser = await browserType.launch();
  try {
    const context = await browser.newContext({
      ...devices['iPhone 14 Pro'],
      viewport: MOBILE_VIEWPORT,
      colorScheme: 'dark'
    });
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') {
        await route.continue();
        return;
      }
      if (route.request().resourceType() === 'stylesheet') {
        await route.fulfill({
          status: 200,
          contentType: 'text/css',
          body: '*,*::before,*::after{box-sizing:border-box}body{margin:0;}'
        });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('mdw-theme', 'dark');
        localStorage.setItem('mdw-lang', 'ja');
      } catch (error) {
        // ignore storage write errors
      }
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.click('[data-section-target="products-section"]');
    await page.waitForSelector('.home-product-track');
    // AutoScroll は startDelay(900ms)後に動き始める
    await page.waitForTimeout(1400);

    const initial = await getCarouselState(page);
    if (!initial.emblaReady) {
      throw new Error(`Expected Embla carousel to be initialized: ${JSON.stringify(initial)}`);
    }
    if (initial.emblaLoop !== true) {
      throw new Error(`Expected Embla loop mode to be active: ${JSON.stringify(initial)}`);
    }
    if (!Number.isFinite(initial.setSize) || initial.setSize < 2) {
      throw new Error(`Expected multiple products in the carousel: ${JSON.stringify(initial)}`);
    }
    if (initial.cardCount % initial.setSize !== 0 || initial.cardCount > initial.setSize * MAX_EXPECTED_CARD_SETS) {
      throw new Error(`Expected card count to be whole clone sets within the cap: ${JSON.stringify(initial)}`);
    }
    if (initial.slideCount !== initial.cardCount) {
      throw new Error(`Expected every card to be wrapped in a slide element: ${JSON.stringify(initial)}`);
    }
    // スライド幅は明示指定であること(auto だと iOS Safari が入れ子 flex の
    // max-content を画像の固有幅で計算し、カード間隔が大きく壊れる)
    if (!initial.slideFlexBasis || initial.slideFlexBasis === 'auto') {
      throw new Error(`Expected slides to have an explicit flex-basis: ${JSON.stringify(initial)}`);
    }
    if (initial.maxSlideCardWidthGap > 1 || initial.slideWidthSpread > 1) {
      throw new Error(`Expected slide width to match card width for every slide: ${JSON.stringify(initial)}`);
    }
    if (initial.slideLayoutDeltaSpread > 1) {
      throw new Error(`Expected uniform spacing between carousel cards: ${JSON.stringify(initial)}`);
    }
    if (initial.trackScrollWidth <= initial.clientWidth) {
      throw new Error(`Expected carousel content to be wider than the viewport: ${JSON.stringify(initial)}`);
    }
    if (initial.gridOverflowX === 'auto' || initial.gridOverflowX === 'scroll') {
      throw new Error(`Expected carousel not to rely on native horizontal scrolling: ${JSON.stringify(initial)}`);
    }
    if (initial.trackTranslateX === null) {
      throw new Error(`Expected carousel movement to be transform-based: ${JSON.stringify(initial)}`);
    }
    if (initial.visibleCards < 1) {
      throw new Error(`Expected at least one visible product card: ${JSON.stringify(initial)}`);
    }
    if (initial.gridBackgroundColor !== 'rgba(0, 0, 0, 0)' || initial.trackBackgroundColor !== 'rgba(0, 0, 0, 0)') {
      throw new Error(`Expected carousel scroll area to keep the section background visible: ${JSON.stringify(initial)}`);
    }
    if (initial.gridPaddingBottom !== '0px' || initial.cardBoxShadow !== 'none') {
      throw new Error(`Expected carousel area not to create a tinted band below cards: ${JSON.stringify(initial)}`);
    }
    const expectedCardCount = initial.cardCount;

    // 自動スクロール: transform が約 26px/s で進み、カードが常に見えていること
    const speedSamples = [];
    let previous = initial;
    for (let index = 0; index < 4; index += 1) {
      await page.waitForTimeout(500);
      const sample = await getCarouselState(page);
      if (sample.visibleCards < 1) {
        throw new Error(`Expected visible product cards during automatic scroll: ${JSON.stringify(sample)}`);
      }
      if (sample.cardCount !== expectedCardCount) {
        throw new Error(`Expected card count to stay constant during automatic scroll: ${JSON.stringify({ expectedCardCount, sample })}`);
      }
      speedSamples.push(previous.trackTranslateX - sample.trackTranslateX);
      previous = sample;
    }
    // loop の継ぎ目で transform が飛ぶサンプルは除外して速度を評価する
    const steadySamples = speedSamples.filter((delta) => delta >= 0 && delta < 200);
    if (steadySamples.length === 0) {
      throw new Error(`Expected steady auto-scroll samples: ${JSON.stringify(speedSamples)}`);
    }
    const averageSpeed = (steadySamples.reduce((a, b) => a + b, 0) / steadySamples.length) * 2;
    if (averageSpeed < EXPECTED_SPEED_PX_PER_SEC * 0.5 || averageSpeed > EXPECTED_SPEED_PX_PER_SEC * 1.8) {
      throw new Error(`Expected mobile auto-scroll speed near ${EXPECTED_SPEED_PX_PER_SEC}px/s: ${JSON.stringify({ averageSpeed, speedSamples })}`);
    }

    // マウスドラッグ(WebKit でも動く経路): 自動スクロールが止まり、ドラッグで動かせること
    const gridBox = await page.locator('.home-product-grid').boundingBox();
    const dragY = Math.round(gridBox.y + gridBox.height / 2);
    const beforeDrag = await getCarouselState(page);
    await page.mouse.move(Math.round(gridBox.x + gridBox.width - 60), dragY);
    await page.mouse.down();
    await page.mouse.move(Math.round(gridBox.x + 60), dragY, { steps: 12 });
    const duringDrag = await getCarouselState(page);
    if (duringDrag.autoScrollPlaying !== false) {
      throw new Error(`Expected auto-scroll to pause during drag: ${JSON.stringify(duringDrag)}`);
    }
    await page.mouse.up();
    await page.waitForTimeout(320);
    // ドラッグ終了時のクリックがカードリンクへのページ遷移として扱われないこと
    if (new URL(page.url()).pathname !== '/') {
      throw new Error(`Expected drag release not to navigate to a card link: ${page.url()}`);
    }
    const afterDrag = await getCarouselState(page);
    if (afterDrag.visibleCards < 1 || afterDrag.cardCount !== expectedCardCount) {
      throw new Error(`Expected visible cards and constant card count after drag: ${JSON.stringify({ expectedCardCount, beforeDrag, afterDrag })}`);
    }

    // ドラッグ解放後は自動スクロールが再開すること(settle + startDelay 待ち)
    await page.waitForFunction(() => {
      const grid = document.querySelector('.home-product-grid');
      const autoScroll = grid && grid.emblaApi && grid.emblaApi.plugins().autoScroll;
      return Boolean(autoScroll && autoScroll.isPlaying());
    }, null, { timeout: 6000 });
    const beforeResume = await getCarouselState(page);
    await page.waitForTimeout(1200);
    const afterResume = await getCarouselState(page);
    const resumeDelta = beforeResume.trackTranslateX - afterResume.trackTranslateX;
    if (resumeDelta === 0) {
      throw new Error(`Expected automatic scroll to resume after drag settles: ${JSON.stringify({ beforeResume, afterResume })}`);
    }
    if (afterResume.visibleCards < 1) {
      throw new Error(`Expected visible product cards after automatic scroll resumes: ${JSON.stringify(afterResume)}`);
    }

    if (browserName === 'Chromium') {
      const cdp = await assertNativeTouchScrollKeepsCardsVisible(page, context, expectedCardCount);
      // タッチ操作後も自動スクロールが再開すること
      await page.waitForFunction(() => {
        const grid = document.querySelector('.home-product-grid');
        const autoScroll = grid && grid.emblaApi && grid.emblaApi.plugins().autoScroll;
        return Boolean(autoScroll && autoScroll.isPlaying());
      }, null, { timeout: 6000 });
      // カルーセル上の縦スワイプはセクション移動として処理されること
      await assertVerticalSwipeNavigatesSections(page, cdp);
    }

    await page.setViewportSize({ width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height - 92 });
    await page.waitForTimeout(400);
    const afterMobileViewportResize = await getCarouselState(page);
    if (afterMobileViewportResize.visibleCards < 1) {
      throw new Error(`Expected visible product cards after mobile viewport resize: ${JSON.stringify(afterMobileViewportResize)}`);
    }
    if (!afterMobileViewportResize.emblaReady || afterMobileViewportResize.emblaLoop !== true) {
      throw new Error(`Expected Embla loop to stay active after mobile viewport resize: ${JSON.stringify(afterMobileViewportResize)}`);
    }

    console.log(`Home product carousel loops at mobile speed (${browserName}).`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const server = await startServer();
  const port = server.address().port;

  try {
    await runCarouselAssertions(chromium, 'Chromium', port);
    await runCarouselAssertions(webkit, 'WebKit', port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
