/**
 * テスト概要:
 *  - 目的: Bartical 製品ページのメニューバー型ランチャーが、初期表示・切り替え・セクション移動を実アプリ風に再現することを確認する。
 *  - 期待値: メインメニューは初期表示で展開され、縦型メニューから独立した実アプリ準拠のAboutにappcast.xmlから同期した1.0.0(1)と製品ページURLを表示する。AboutのアイコンとfaviconはBarticalのIcon Composer書類から書き出した正式PNGを使い、ライトテーマではmacOSのライト外観に合わせた明るい半透明ウィンドウと薄いMaterialカードへ切り替わる。Overviewの配置例は境界①・②を持ち、外部アイコンを⌘ドラッグすると右側で最初の境界から所属を再計算し、hover時に「①に所属しています」のような番号付きツールチップを表示する。縦型メニューにSparklesは置かず、所属項目の操作でAboutを閉じない。ヒーローは動的viewportからメニューバー高を引いた範囲へ収まり、Aboutと映像がviewport下へはみ出さない。背景はテーマ別MP4と指定ベース色を使い、縦メニュー末尾の設定も他の所属項目と同じアンカー展開を経て、元アイコン直下のメニューからライト／ダークを切り替える。元アプリメニューの左端は選択した元アイコンの左端へ揃え、狭い画面では8pxの安全余白へ収める。縦書きBARTICALは置かず、左端の戻る導線は矢印アイコンだけを表示する。正式SVGは通常時から右寄りへ固定し、所属項目の展開後も中心座標を変えない。展開した元項目は縦型メニューの上から下の順に対応して右から左へ並べ、選択中の背面だけを白い半透明の横長macOS風ピルとして表示する。右側の他アプリアイコンはアンカー展開中も消さない。
 *  - 検証方法: ローカル静的サーバーで Bartical ページを配信し、ChromiumまたはWebKitで1440×900、1372×619、393×852、320×568のviewportを開く。DOM属性、表示状態、フォーカス順、URL hash、アイコン実体、要素矩形、console/page errorを取得して検証する。H.264デコーダーを同梱しないLinux版WebKitでは動画の設定とレイアウトを検証し、デコード完了はmacOS WebKitとChromiumで検証する。
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium, webkit } = require('playwright');

const ROOT = path.resolve(__dirname, '../../site');
const BARTICAL_ICON = path.join(ROOT, 'products/Bartical/BarticalIconBody.svg');
const BARTICAL_APP_ICON = path.join(ROOT, 'products/Bartical/BarticalAppIcon.png');
const BARTICAL_CATALOG_ICON = path.join(ROOT, 'products/Bartical/BarticalCatalogIcon.png');
const BARTICAL_FAVICON = path.join(ROOT, 'products/Bartical/BarticalFavicon.png');
const BARTICAL_APPCAST = path.join(ROOT, 'products/Bartical/appcast.xml');
const PRODUCT_INDEX = path.join(ROOT, 'products/index.json');
const BROWSER_NAME = process.env.BARTICAL_BROWSER || 'chromium';
const BROWSER_TYPES = { chromium, webkit };
// Playwright's Linux WebKit build does not ship an H.264 decoder. The release
// gate still validates the actual media in macOS WebKit and Mobile Safari.
const HERO_VIDEO_DECODE_REQUIRED = !(BROWSER_NAME === 'webkit' && process.platform === 'linux');
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'desktop-short', width: 1372, height: 619 },
  { name: 'mobile', width: 393, height: 852 },
  { name: 'mobile-minimum', width: 320, height: 568 }
];
const MAIN_GROUPED_ITEM_ORDER = [
  'how-it-works',
  'customize',
  'privacy',
  'requirements',
  'coming-soon',
  'theme'
];
const LAYOUT_TOLERANCE = 1;

function assert(condition, message, details) {
  if (!condition) {
    throw new Error(`${message}${details ? `: ${JSON.stringify(details)}` : ''}`);
  }
}

function readPngSize(filePath) {
  const data = fs.readFileSync(filePath);
  const signature = data.subarray(0, 8).toString('hex');
  assert(signature === '89504e470d0a1a0a', 'Expected a PNG file', filePath);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  };
}

function serveStatic(request, response) {
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(ROOT, relativePath);
  if (pathname.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }

  const rootPrefix = `${ROOT}${path.sep}`;
  if (filePath !== ROOT && !filePath.startsWith(rootPrefix)) {
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
      '.jpeg': 'image/jpeg',
      '.jpg': 'image/jpeg',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.mp4': 'video/mp4',
      '.png': 'image/png',
      '.svg': 'image/svg+xml; charset=utf-8',
      '.webp': 'image/webp'
    };
    response.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    response.end(data);
  });
}

function startServer() {
  const server = http.createServer(serveStatic);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function readInitialState(page) {
  return page.evaluate(() => {
    const mainButton = document.querySelector('[data-launcher="main"]');
    const mainPanel = document.getElementById('bt-menu-main');
    const mainIcon = mainButton?.querySelector('img');
    const numberedIcons = Array.from(document.querySelectorAll('.bt-launcher--number img'));
    const mainButtonRect = mainButton?.getBoundingClientRect();
    const launcherRects = Array.from(document.querySelectorAll('[data-launcher]'))
      .map((button) => button.getBoundingClientRect());
    const mainIconRect = mainIcon?.getBoundingClientRect();
    const firstVisibleSystemItem = Array.from(document.querySelectorAll('.bt-menubar__system > span'))
      .find((item) => item.getBoundingClientRect().width > 0);
    const firstSystemIcon = firstVisibleSystemItem?.querySelector('svg.lucide');
    const firstSystemItemRect = firstVisibleSystemItem?.getBoundingClientRect();
    const visibleSystemItemRects = Array.from(document.querySelectorAll('.bt-menubar__system > span'))
      .map((item) => item.getBoundingClientRect())
      .filter((rect) => rect.width > 0);
    const firstSystemIconRect = firstSystemIcon?.getBoundingClientRect();
    const mainButtonStyle = mainButton ? getComputedStyle(mainButton) : null;
    const panelRect = mainPanel?.getBoundingClientRect();
    const verticalItems = Array.from(document.querySelectorAll('.bt-vertical-menu [data-section-link]'));
    const verticalIcons = verticalItems.map((item) => (
      Array.from(item.children).filter((child) => child.matches('svg, i'))
    ));
    const activationStrip = document.querySelector('[data-activation-strip]');
    const sourceMenu = document.querySelector('[data-source-menu]');
    const aboutWindow = document.querySelector('[data-about-window]');
    const aboutIcon = document.querySelector('.bt-about__app-icon');
    const aboutIconOpaqueBounds = (() => {
      if (!aboutIcon?.complete || aboutIcon.naturalWidth === 0 || aboutIcon.naturalHeight === 0) {
        return null;
      }
      const canvas = document.createElement('canvas');
      canvas.width = aboutIcon.naturalWidth;
      canvas.height = aboutIcon.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(aboutIcon, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[((y * canvas.width) + x) * 4 + 3] < 16) {
            continue;
          }
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      return maxX >= minX ? {
        left: minX,
        top: minY,
        right: maxX,
        bottom: maxY,
        widthRatio: Number(((maxX - minX + 1) / canvas.width).toFixed(3)),
        heightRatio: Number(((maxY - minY + 1) / canvas.height).toFixed(3))
      } : null;
    })();
    const favicon = document.querySelector('link[rel="icon"]');
    const aboutWindowRect = aboutWindow?.getBoundingClientRect();
    const aboutWebsite = document.querySelector('.bt-about__website a');
    const headerBacklink = document.querySelector('.bt-menubar .bt-backlink');
    const headerBacklinkLabel = headerBacklink?.querySelector('[data-product-backlink-label]');
    const headerBacklinkRect = headerBacklink?.getBoundingClientRect();
    const pageShell = document.querySelector('.bt-page');
    const menubar = document.querySelector('.bt-menubar');
    const hero = document.querySelector('.bt-hero');
    const heroVideo = document.querySelector('[data-hero-video]');
    const heroRect = hero?.getBoundingClientRect();
    const heroVideoRect = heroVideo?.getBoundingClientRect();
    const heroStyle = hero ? getComputedStyle(hero) : null;
    const heroVideoStyle = heroVideo ? getComputedStyle(heroVideo) : null;
    const menubarStyle = menubar ? getComputedStyle(menubar) : null;
    const mainPanelStyle = mainPanel ? getComputedStyle(mainPanel) : null;
    const themeSettingsTrigger = document.querySelector('[data-theme-settings-trigger]');
    const themeSourceActions = document.querySelector('[data-theme-source-actions]');
    const themeSettingsStyle = themeSettingsTrigger ? getComputedStyle(themeSettingsTrigger) : null;
    const overview = document.getElementById('overview');
    const overviewInner = overview?.querySelector('.bt-overview__inner');
    const overviewPlacement = overview?.querySelector('.bt-placement');
    const overviewHeading = overview?.querySelector('[data-i18n="heroTitle"]');
    const overviewCaption = overview?.querySelector('[data-i18n="heroLede"]');
    const overviewRect = overview?.getBoundingClientRect();
    const overviewInnerRect = overviewInner?.getBoundingClientRect();
    const overviewPlacementRect = overviewPlacement?.getBoundingClientRect();
    const overviewHeadingRect = overviewHeading?.getBoundingClientRect();
    const overviewCaptionRect = overviewCaption?.getBoundingClientRect();
    const overviewHeadingRange = overviewHeading ? document.createRange() : null;
    overviewHeadingRange?.selectNodeContents(overviewHeading);
    const viewportSectionLayouts = Array.from(document.querySelectorAll('.bt-viewport-section')).map((section) => {
      const inner = section.querySelector(':scope > .bt-section__inner, :scope > .bt-coming__inner');
      const sectionRect = section.getBoundingClientRect();
      const innerRect = inner?.getBoundingClientRect();
      const childRects = inner
        ? Array.from(inner.children)
          .filter((child) => getComputedStyle(child).display !== 'none')
          .map((child) => child.getBoundingClientRect())
        : [];
      return {
        id: section.id,
        height: Number(sectionRect.height.toFixed(2)),
        innerTop: innerRect ? Number((innerRect.top - sectionRect.top).toFixed(2)) : null,
        innerBottom: innerRect ? Number((innerRect.bottom - sectionRect.top).toFixed(2)) : null,
        contentTop: childRects.length
          ? Number((Math.min(...childRects.map((rect) => rect.top)) - sectionRect.top).toFixed(2))
          : null,
        contentBottom: childRects.length
          ? Number((Math.max(...childRects.map((rect) => rect.bottom)) - sectionRect.top).toFixed(2))
          : null,
        innerClientHeight: inner?.clientHeight || 0,
        innerScrollHeight: inner?.scrollHeight || 0,
        overflowY: getComputedStyle(section).overflowY,
        headingCount: section.querySelectorAll('h1, h2').length
      };
    });

    return {
      launcherNames: Array.from(document.querySelectorAll('[data-launcher]')).map((button) => button.dataset.launcher),
      mainExpanded: mainButton?.getAttribute('aria-expanded'),
      mainPanelHidden: mainPanel?.hidden,
      mainPanelVisible: Boolean(mainPanel && mainPanel.getClientRects().length > 0),
      heroDisplayCopyCount: document.querySelectorAll('.bt-hero__copy').length,
      overviewLeadHeadingTag: document.querySelector('.bt-overview-lead [data-i18n="heroTitle"]')?.tagName || null,
      overviewLayout: overviewRect && overviewInnerRect && overviewPlacementRect ? {
        section: {
          top: Number(overviewRect.top.toFixed(2)),
          bottom: Number(overviewRect.bottom.toFixed(2)),
          height: Number(overviewRect.height.toFixed(2))
        },
        inner: {
          top: Number(overviewInnerRect.top.toFixed(2)),
          bottom: Number(overviewInnerRect.bottom.toFixed(2)),
          height: Number(overviewInnerRect.height.toFixed(2))
        },
        placement: {
          top: Number(overviewPlacementRect.top.toFixed(2)),
          bottom: Number(overviewPlacementRect.bottom.toFixed(2)),
          width: Number(overviewPlacementRect.width.toFixed(2))
        },
        heading: overviewHeadingRect ? {
          left: Number(overviewHeadingRect.left.toFixed(2)),
          top: Number(overviewHeadingRect.top.toFixed(2)),
          right: Number(overviewHeadingRect.right.toFixed(2)),
          bottom: Number(overviewHeadingRect.bottom.toFixed(2)),
          lineCount: overviewHeadingRange?.getClientRects().length || 0
        } : null,
        caption: overviewCaptionRect ? {
          left: Number(overviewCaptionRect.left.toFixed(2)),
          top: Number(overviewCaptionRect.top.toFixed(2)),
          right: Number(overviewCaptionRect.right.toFixed(2)),
          bottom: Number(overviewCaptionRect.bottom.toFixed(2))
        } : null,
        featureCardCount: overview.querySelectorAll('.bt-feature-grid article').length,
        headingCount: overview.querySelectorAll('h1, h2').length
      } : null,
      viewportSectionLayouts,
      customize: {
        title: document.querySelector('[data-i18n="customizeTitle"]')?.textContent.trim() || null,
        body: document.querySelector('[data-i18n="customizeBody"]')?.textContent.trim() || null,
        ariaLabel: document.querySelector('.bt-customizer')?.getAttribute('aria-label') || null,
        brandIconCount: document.querySelectorAll('#customize img[src="./BarticalIconBody.svg"]').length,
        primaryCardCount: document.querySelectorAll('#customize .bt-customizer__card--primary').length,
        numberExampleCount: document.querySelectorAll('.bt-customizer__number').length,
        settingLabels: Array.from(document.querySelectorAll('.bt-customizer__name'))
          .map((item) => item.textContent.trim()),
        formatLabels: Array.from(document.querySelectorAll('.bt-customizer__card > p:last-child'))
          .map((item) => item.textContent.trim()),
        chipLabels: Array.from(document.querySelectorAll('.bt-chip-list li span'))
          .map((item) => item.textContent.trim())
      },
      mainIcon: mainIcon ? {
        src: mainIcon.getAttribute('src'),
        complete: mainIcon.complete,
        naturalWidth: mainIcon.naturalWidth,
        naturalHeight: mainIcon.naturalHeight
      } : null,
      numberedIcons: numberedIcons.map((icon) => ({
        src: icon.getAttribute('src'),
        complete: icon.complete,
        naturalWidth: icon.naturalWidth,
        naturalHeight: icon.naturalHeight
      })),
      numberedTextCount: document.querySelectorAll('.bt-launcher--number span').length,
      launcherSurfaces: Array.from(document.querySelectorAll('[data-launcher]')).map((button) => {
        const style = getComputedStyle(button);
        return {
          backgroundColor: style.backgroundColor,
          borderTopWidth: style.borderTopWidth
        };
      }),
      menubarHeight: Number(document.querySelector('.bt-menubar')?.getBoundingClientRect().height.toFixed(2) || 0),
      heroRailCount: document.querySelectorAll('.bt-hero__rail').length,
      aboutVisible: Boolean(aboutWindow && !aboutWindow.hidden && aboutWindow.getClientRects().length > 0),
      aboutRect: aboutWindowRect ? {
        top: Number(aboutWindowRect.top.toFixed(2)),
        right: Number(aboutWindowRect.right.toFixed(2)),
        bottom: Number(aboutWindowRect.bottom.toFixed(2)),
        left: Number(aboutWindowRect.left.toFixed(2)),
        width: Number(aboutWindowRect.width.toFixed(2)),
        height: Number(aboutWindowRect.height.toFixed(2))
      } : null,
      aboutTitle: document.querySelector('[data-i18n="aboutWindowTitle"]')?.textContent.trim() || null,
      aboutVersions: Array.from(document.querySelectorAll('[data-about-version]')).map((item) => item.textContent.trim()),
      aboutVersionSource: document.documentElement.dataset.barticalVersionSource || null,
      aboutTriggerCount: document.querySelectorAll('[data-about-trigger]').length,
      mainMenuSparklesCount: document.querySelectorAll('#bt-menu-main svg.lucide-sparkles').length,
      mainMenuSections: Array.from(document.querySelectorAll('#bt-menu-main [data-section-link]'))
        .map((item) => item.dataset.sectionLink),
      menuSectionOrders: Object.fromEntries(
        Array.from(document.querySelectorAll('[data-menu-panel]')).map((panel) => [
          panel.dataset.menuPanel,
          Array.from(panel.querySelectorAll(':scope > [data-section-link]'))
            .map((item) => item.dataset.sectionLink)
        ])
      ),
      originalItemOrder: Array.from(document.querySelectorAll('.bt-original-items > [data-original-section]'))
        .map((item) => item.dataset.originalSection),
      aboutIcon: aboutIcon ? {
        src: aboutIcon.getAttribute('src'),
        complete: aboutIcon.complete,
        naturalWidth: aboutIcon.naturalWidth,
        naturalHeight: aboutIcon.naturalHeight
      } : null,
      aboutIconOpaqueBounds,
      favicon: favicon ? {
        href: favicon.getAttribute('href'),
        type: favicon.getAttribute('type'),
        sizes: favicon.getAttribute('sizes')
      } : null,
      aboutWebsite: aboutWebsite ? {
        href: aboutWebsite.href,
        text: aboutWebsite.textContent.trim(),
        target: aboutWebsite.getAttribute('target')
      } : null,
      pageBackgroundColor: pageShell ? getComputedStyle(pageShell).backgroundColor : null,
      heroBackgroundColor: hero ? getComputedStyle(hero).backgroundColor : null,
      glassChrome: menubarStyle && mainPanelStyle ? {
        menubarBackgroundColor: menubarStyle.backgroundColor,
        menubarBorderBottomColor: menubarStyle.borderBottomColor,
        menubarBoxShadow: menubarStyle.boxShadow,
        menubarBackdropFilter: menubarStyle.backdropFilter || menubarStyle.webkitBackdropFilter,
        mainPanelBackgroundColor: mainPanelStyle.backgroundColor,
        mainPanelBorderLeftColor: mainPanelStyle.borderLeftColor,
        mainPanelBoxShadow: mainPanelStyle.boxShadow,
        mainPanelBackdropFilter: mainPanelStyle.backdropFilter || mainPanelStyle.webkitBackdropFilter
      } : null,
      backgroundCoverage: heroRect && heroVideoRect ? {
        heroTop: Number(heroRect.top.toFixed(2)),
        heroBottom: Number(heroRect.bottom.toFixed(2)),
        videoTop: Number(heroVideoRect.top.toFixed(2)),
        videoBottom: Number(heroVideoRect.bottom.toFixed(2)),
        videoHeight: Number(heroVideoRect.height.toFixed(2)),
        videoParentIsPage: heroVideo.parentElement === pageShell,
        heroZIndex: heroStyle?.zIndex || null,
        videoZIndex: heroVideoStyle?.zIndex || null
      } : null,
      heroVideo: heroVideo ? {
        src: heroVideo.getAttribute('src'),
        darkSource: heroVideo.dataset.srcDark,
        lightSource: heroVideo.dataset.srcLight,
        muted: heroVideo.muted,
        loop: heroVideo.loop,
        paused: heroVideo.paused,
        readyState: heroVideo.readyState,
        h264Support: heroVideo.canPlayType('video/mp4; codecs="avc1"'),
        errorCode: heroVideo.error?.code ?? null
      } : null,
      themeSettings: themeSettingsTrigger && themeSourceActions ? {
        controls: themeSettingsTrigger.getAttribute('aria-controls'),
        sourceLink: themeSettingsTrigger.dataset.sectionLink,
        themeActionsHidden: themeSourceActions.hidden,
        settingsIconCount: themeSettingsTrigger.querySelectorAll('svg.lucide-settings').length,
        optionCount: themeSourceActions.querySelectorAll('[data-theme-option]').length,
        optionRoleCount: themeSourceActions.querySelectorAll('[role="menuitemradio"]').length,
        sunIconCount: themeSourceActions.querySelectorAll('svg.lucide-sun').length,
        moonIconCount: themeSourceActions.querySelectorAll('svg.lucide-moon').length,
        borderTopWidth: themeSettingsStyle?.borderTopWidth,
        marginTop: themeSettingsStyle?.marginTop
      } : null,
      headerBacklink: headerBacklink ? {
        ariaLabel: headerBacklink.getAttribute('aria-label'),
        visibleLabelClass: headerBacklinkLabel?.classList.contains('bt-sr-only') || false,
        arrowIconCount: headerBacklink.querySelectorAll('svg.lucide-arrow-left').length,
        width: Number((headerBacklinkRect?.width || 0).toFixed(2))
      } : null,
      mainLauncherCenter: mainButtonRect ? Number((mainButtonRect.left + (mainButtonRect.width / 2)).toFixed(2)) : null,
      launcherCenterGaps: launcherRects.slice(1).map((rect, index) => {
        const previousRect = launcherRects[index];
        const previousCenter = previousRect.left + (previousRect.width / 2);
        const center = rect.left + (rect.width / 2);
        return Number((center - previousCenter).toFixed(2));
      }),
      wordmarkCount: document.querySelectorAll('.bt-menubar__wordmark').length,
      primarySurface: mainButtonStyle ? {
        backgroundColor: mainButtonStyle.backgroundColor,
        borderTopWidth: mainButtonStyle.borderTopWidth
      } : null,
      mainToSystemEdgeGap: mainButtonRect && firstSystemItemRect
        ? Number((firstSystemItemRect.left - mainButtonRect.right).toFixed(2))
        : null,
      mainToSystemCenterGap: mainButtonRect && firstSystemItemRect
        ? Number((
          (firstSystemItemRect.left + (firstSystemItemRect.width / 2))
          - (mainButtonRect.left + (mainButtonRect.width / 2))
        ).toFixed(2))
        : null,
      systemCenterGaps: visibleSystemItemRects.slice(1).map((rect, index) => {
        const previousRect = visibleSystemItemRects[index];
        const previousCenter = previousRect.left + (previousRect.width / 2);
        const center = rect.left + (rect.width / 2);
        return Number((center - previousCenter).toFixed(2));
      }),
      systemItemCount: document.querySelectorAll('.bt-menubar__system > span').length,
      systemRightEdge: visibleSystemItemRects.length
        ? Number(Math.max(...visibleSystemItemRects.map((rect) => rect.right)).toFixed(2))
        : null,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      iconSizeDifference: mainIconRect && firstSystemIconRect
        ? Number(Math.abs(mainIconRect.width - firstSystemIconRect.width).toFixed(2))
        : null,
      renderedLucideCount: document.querySelectorAll('svg.lucide').length,
      verticalLinkCount: verticalItems.length,
      verticalLucideCount: verticalIcons.filter((icons) => (
        icons.length === 1 && icons[0].matches('svg.lucide')
      )).length,
      activationStripHidden: activationStrip?.hidden,
      sourceMenuHidden: sourceMenu?.hidden,
      configurationAnchorCount: document.querySelectorAll('.bt-activation-anchor').length,
      originalItemCount: document.querySelectorAll('[data-original-section]').length,
      originalLucideCount: document.querySelectorAll('[data-original-section] > svg.lucide').length,
      originalThemeCount: document.querySelectorAll('[data-original-section="theme"] > svg.lucide-settings').length,
      activationLauncherCount: document.querySelectorAll('[data-activation-launcher]').length,
      sourceMenuItemCount: document.querySelectorAll('[data-source-menu] [role="menuitem"]').length,
      sourceMenuLucideCount: document.querySelectorAll('[data-source-menu] [role="menuitem"] > svg.lucide').length,
      sourceRechooseCount: document.querySelectorAll('[data-source-rechoose]').length,
      sourceCloseText: document.querySelector('[data-source-close]')?.textContent.trim() || null,
      sourceCloseIconCount: document.querySelectorAll('[data-source-close] > svg.lucide-x').length,
      activationNumberedAssetCount: document.querySelectorAll('[data-activation-strip] img[src^="./BarticalNumber"]').length,
      activationOfficialAssetCount: document.querySelectorAll('[data-activation-strip] img[src="./BarticalIconBody.svg"]').length,
      overflow: {
        clientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      panelRect: panelRect ? {
        left: Number(panelRect.left.toFixed(2)),
        top: Number(panelRect.top.toFixed(2)),
        right: Number(panelRect.right.toFixed(2)),
        bottom: Number(panelRect.bottom.toFixed(2)),
        width: Number(panelRect.width.toFixed(2)),
        height: Number(panelRect.height.toFixed(2))
      } : null
    };
  });
}

function assertInitialState(state, viewport) {
  assert(
    state.launcherNames.length === 3 && ['3', '2', 'main'].every((name) => state.launcherNames.includes(name)),
    `[${viewport.name}] Expected the three Bartical launcher buttons`,
    state.launcherNames
  );
  assert(state.mainExpanded === 'true', `[${viewport.name}] Main launcher was not initially expanded`, state);
  assert(!state.mainPanelHidden && state.mainPanelVisible, `[${viewport.name}] Main menu was not initially visible`, state);
  assert(state.heroDisplayCopyCount === 0, `[${viewport.name}] Hero must remain a copy-free simulation canvas`, state);
  assert(state.overviewLeadHeadingTag === 'H1', `[${viewport.name}] Product statement was not moved into the overview section`, state);
  const expectedMainLauncherCenter = viewport.width <= 760
    ? state.overflow.clientWidth - 38
    : Math.min(Math.max(state.overflow.clientWidth * 0.78, 640), state.overflow.clientWidth - 68);
  assert(
    state.mainLauncherCenter !== null
      && state.mainLauncherCenter > (state.overflow.clientWidth / 2)
      && Math.abs(state.mainLauncherCenter - expectedMainLauncherCenter) <= LAYOUT_TOLERANCE,
    `[${viewport.name}] Main Bartical launcher was not fixed at the specified right-side position`,
    { mainLauncherCenter: state.mainLauncherCenter, expectedMainLauncherCenter, clientWidth: state.overflow.clientWidth }
  );
  assert(state.wordmarkCount === 0, `[${viewport.name}] The redundant Bartical wordmark remained in the menu bar`, state);
  assert(
    state.numberedIcons.length === 2
      && state.numberedIcons.every((icon) => (
        /^\.\/BarticalNumber[23]\.png$/.test(icon.src)
        && icon.complete
        && icon.naturalWidth > 0
        && icon.naturalHeight > 0
      )),
    `[${viewport.name}] Numbered launchers did not use rendered Bartical number-icon assets`,
    state.numberedIcons
  );
  assert(state.numberedTextCount === 0, `[${viewport.name}] Numbered launchers still used text glyphs`, state);
  assert(
    state.launcherSurfaces.every((surface) => (
      surface.backgroundColor === 'rgba(0, 0, 0, 0)'
      && surface.borderTopWidth === '0px'
    )),
    `[${viewport.name}] A launcher still used an outer card surface`,
    state.launcherSurfaces
  );
  assert(
    viewport.width <= 760 ? state.menubarHeight === 80 : state.menubarHeight === 120,
    `[${viewport.name}] Menu bar height did not match the enlarged responsive specification`,
    { menubarHeight: state.menubarHeight }
  );
  assert(state.heroRailCount === 0, `[${viewport.name}] Deprecated vertical Bartical wordmark remained`, state);
  const expectedSectionHeight = state.viewport.height - state.menubarHeight;
  const expectedViewportSectionIds = [
    'overview',
    'how-it-works',
    'customize',
    'privacy',
    'requirements',
    'coming-soon'
  ];
  assert(
    state.viewportSectionLayouts.length === expectedViewportSectionIds.length
      && expectedViewportSectionIds.every((id) => state.viewportSectionLayouts.some((section) => section.id === id)),
    `[${viewport.name}] Expected every product chapter to use the one-screen layout`,
    state.viewportSectionLayouts
  );
  state.viewportSectionLayouts.forEach((section) => {
    assert(
      Math.abs(section.height - expectedSectionHeight) <= LAYOUT_TOLERANCE
        && section.innerTop !== null
        && section.innerBottom !== null
        && section.contentTop !== null
        && section.contentBottom !== null
        && section.innerTop >= -LAYOUT_TOLERANCE
        && section.innerBottom <= section.height + LAYOUT_TOLERANCE
        && section.contentTop >= section.innerTop - LAYOUT_TOLERANCE
        && section.contentBottom <= section.innerBottom + LAYOUT_TOLERANCE
        && section.innerScrollHeight <= section.innerClientHeight + LAYOUT_TOLERANCE
        && section.overflowY === 'hidden'
        && section.headingCount === 1,
      `[${viewport.name}] ${section.id} did not fit as one refined header-free viewport`,
      { section, expectedSectionHeight, viewport: state.viewport }
    );
  });
  assert(
    state.overviewLayout
      && Math.abs(state.overviewLayout.section.top - state.viewport.height) <= LAYOUT_TOLERANCE
      && Math.abs(state.overviewLayout.section.height - expectedSectionHeight) <= LAYOUT_TOLERANCE
      && state.overviewLayout.inner.top >= state.overviewLayout.section.top - LAYOUT_TOLERANCE
      && state.overviewLayout.inner.bottom <= state.overviewLayout.section.bottom + LAYOUT_TOLERANCE
      && state.overviewLayout.placement.top >= state.overviewLayout.inner.top - LAYOUT_TOLERANCE
      && state.overviewLayout.placement.bottom <= state.overviewLayout.inner.bottom + LAYOUT_TOLERANCE
      && state.overviewLayout.placement.width > 0,
    `[${viewport.name}] Placement-led Overview did not fit within one header-free viewport`,
    { overviewLayout: state.overviewLayout, expectedSectionHeight, viewport: state.viewport }
  );
  assert(
    state.overviewLayout.featureCardCount === 0 && state.overviewLayout.headingCount === 1,
    `[${viewport.name}] Overview retained secondary feature cards or duplicate headings`,
    state.overviewLayout
  );
  assert(
    state.customize.title === 'Barticalごとに、自分で設定。'
      && state.customize.body === '名称・アイコン・表示方法・色を個別に設定し、必要な数だけ追加できます。'
      && state.customize.ariaLabel === 'Barticalごとに設定できる項目'
      && state.customize.brandIconCount === 0
      && state.customize.primaryCardCount === 0
      && state.customize.numberExampleCount === 0
      && JSON.stringify(state.customize.settingLabels) === JSON.stringify([
        '名称',
        'アイコン',
        '表示方法と色'
      ])
      && JSON.stringify(state.customize.formatLabels) === JSON.stringify([
        '用途に合わせて自由に設定',
        'SF Symbols・任意SVG・番号',
        'Template・Original・Custom Color'
      ])
      && state.customize.chipLabels.includes('必要な数だけ追加')
      && state.customize.chipLabels.includes('Barticalごとに個別設定')
      && !state.customize.title.includes('3'),
    `[${viewport.name}] Customize did not clearly present user-configurable per-Bartical settings`,
    state.customize
  );
  assert(
    state.overviewLayout.heading
      && state.overviewLayout.caption
      && state.overviewLayout.caption.top >= state.overviewLayout.heading.bottom - LAYOUT_TOLERANCE
      && Math.abs(state.overviewLayout.caption.left - state.overviewLayout.heading.left) <= LAYOUT_TOLERANCE
      && (viewport.width <= 760 || state.overviewLayout.heading.lineCount === 1),
    `[${viewport.name}] Overview heading or caption did not follow the requested stacked layout`,
    state.overviewLayout
  );
  assert(state.aboutVisible, `[${viewport.name}] About reproduction was not initially visible`, state);
  assert(state.aboutTitle === 'Barticalについて', `[${viewport.name}] About window title did not match the app`, state);
  assert(
    state.aboutVersionSource === 'appcast'
      && state.aboutVersions.length === 2
      && state.aboutVersions.every((version) => version === '1.0.0(1)'),
    `[${viewport.name}] About versions were not synchronized from Bartical appcast.xml`,
    { source: state.aboutVersionSource, versions: state.aboutVersions }
  );
  assert(
    state.aboutTriggerCount === 0
      && state.mainMenuSparklesCount === 0
      && JSON.stringify(state.mainMenuSections) === JSON.stringify(MAIN_GROUPED_ITEM_ORDER)
      && JSON.stringify(state.menuSectionOrders['2']) === JSON.stringify([
        'how-it-works',
        'customize',
        'requirements'
      ])
      && JSON.stringify(state.menuSectionOrders['3']) === JSON.stringify([
        'privacy',
        'requirements',
        'coming-soon'
      ])
      && JSON.stringify(state.originalItemOrder) === JSON.stringify(MAIN_GROUPED_ITEM_ORDER),
    `[${viewport.name}] About remained coupled to a Sparkles item in the vertical menu`,
    {
      aboutTriggerCount: state.aboutTriggerCount,
      mainMenuSparklesCount: state.mainMenuSparklesCount,
      mainMenuSections: state.mainMenuSections,
      menuSectionOrders: state.menuSectionOrders,
      originalItemOrder: state.originalItemOrder
    }
  );
  assert(
    state.aboutIcon?.src === './BarticalAppIcon.png'
      && state.aboutIcon.complete
      && state.aboutIcon.naturalWidth === 256
      && state.aboutIcon.naturalHeight === 256,
    `[${viewport.name}] The Icon Composer Bartical application icon was not loaded in About`,
    state.aboutIcon
  );
  assert(
    state.aboutIconOpaqueBounds?.left >= 20
      && state.aboutIconOpaqueBounds.top >= 20
      && state.aboutIconOpaqueBounds.right <= 235
      && state.aboutIconOpaqueBounds.bottom <= 235
      && state.aboutIconOpaqueBounds.widthRatio <= 0.84
      && state.aboutIconOpaqueBounds.heightRatio <= 0.84,
    `[${viewport.name}] About icon lost the compiled macOS optical padding and rendered too large`,
    state.aboutIconOpaqueBounds
  );
  assert(
    state.favicon?.href === './BarticalFavicon.png'
      && state.favicon.type === 'image/png'
      && state.favicon.sizes === '32x32',
    `[${viewport.name}] The Bartical favicon did not use the Icon Composer export`,
    state.favicon
  );
  assert(
    state.aboutWebsite?.href === 'https://masashi-desu.github.io/products/Bartical'
      && state.aboutWebsite.text === 'https://masashi-desu.github.io/products/Bartical'
      && state.aboutWebsite.target === null,
    `[${viewport.name}] About website did not point to the published product route`,
    state.aboutWebsite
  );
  assert(
    state.pageBackgroundColor === 'rgb(24, 27, 58)'
      && state.heroBackgroundColor === 'rgba(0, 0, 0, 0)'
      && state.heroVideo?.src === './hero-bg-dark.mp4'
      && state.heroVideo.darkSource === './hero-bg-dark.mp4'
      && state.heroVideo.lightSource === './hero-bg-light.mp4'
      && state.heroVideo.muted
      && state.heroVideo.loop
      && state.heroVideo.paused
      && (!HERO_VIDEO_DECODE_REQUIRED || state.heroVideo.readyState >= 1),
    `[${viewport.name}] Dark hero video and transparent hero base were not initialized correctly`,
    {
      pageBackgroundColor: state.pageBackgroundColor,
      heroBackgroundColor: state.heroBackgroundColor,
      heroVideo: state.heroVideo,
      decodeRequired: HERO_VIDEO_DECODE_REQUIRED
    }
  );
  assert(
    state.glassChrome?.menubarBackgroundColor === 'rgba(3, 5, 22, 0.46)'
      && state.glassChrome.menubarBorderBottomColor === 'rgba(255, 255, 255, 0.08)'
      && state.glassChrome.menubarBoxShadow !== 'none'
      && state.glassChrome.menubarBackdropFilter.includes('blur(24px)')
      && state.glassChrome.mainPanelBackgroundColor === 'rgba(13, 16, 38, 0.48)'
      && state.glassChrome.mainPanelBorderLeftColor === 'rgba(255, 255, 255, 0.1)'
      && state.glassChrome.mainPanelBoxShadow !== 'none'
      && state.glassChrome.mainPanelBackdropFilter.includes('blur(22px)'),
    `[${viewport.name}] Header or Bartical vertical menu did not use the required dark blurred material`,
    state.glassChrome
  );
  assert(
    state.backgroundCoverage
      && Math.abs(state.backgroundCoverage.heroTop - state.menubarHeight) <= LAYOUT_TOLERANCE
      && Math.abs(state.backgroundCoverage.heroBottom - state.viewport.height) <= LAYOUT_TOLERANCE
      && Math.abs(state.backgroundCoverage.videoTop) <= LAYOUT_TOLERANCE
      && Math.abs(state.backgroundCoverage.videoBottom - state.backgroundCoverage.heroBottom) <= LAYOUT_TOLERANCE
      && state.backgroundCoverage.videoParentIsPage
      && state.backgroundCoverage.heroZIndex === '1'
      && state.backgroundCoverage.videoZIndex === '0'
      && Math.abs(
        state.backgroundCoverage.videoHeight
          - ((state.backgroundCoverage.heroBottom - state.backgroundCoverage.heroTop) + state.menubarHeight)
      ) <= LAYOUT_TOLERANCE,
    `[${viewport.name}] Hero video did not extend continuously behind the transparent header`,
    { menubarHeight: state.menubarHeight, backgroundCoverage: state.backgroundCoverage }
  );
  assert(
    state.aboutRect
      && state.aboutRect.top >= state.menubarHeight - LAYOUT_TOLERANCE
      && state.aboutRect.bottom <= state.viewport.height + LAYOUT_TOLERANCE,
    `[${viewport.name}] About window exceeded the visible hero viewport`,
    { aboutRect: state.aboutRect, viewport: state.viewport, menubarHeight: state.menubarHeight }
  );
  const heroCenter = state.backgroundCoverage
    ? (state.backgroundCoverage.heroTop + state.backgroundCoverage.heroBottom) / 2
    : null;
  const aboutCenter = state.aboutRect
    ? (state.aboutRect.top + state.aboutRect.bottom) / 2
    : null;
  assert(
    heroCenter !== null
      && aboutCenter !== null
      && Math.abs(aboutCenter - heroCenter) <= LAYOUT_TOLERANCE,
    `[${viewport.name}] About window was not centered vertically within the uncovered hero region`,
    { heroCenter, aboutCenter, aboutRect: state.aboutRect, backgroundCoverage: state.backgroundCoverage }
  );
  const expectedAboutLeft = viewport.width <= 760
    ? 12
    : Math.min(Math.max(viewport.width * 0.05, 24), 68);
  assert(
    state.aboutRect && Math.abs(state.aboutRect.left - expectedAboutLeft) <= LAYOUT_TOLERANCE,
    `[${viewport.name}] About window horizontal position changed while centering vertically`,
    { aboutLeft: state.aboutRect?.left, expectedAboutLeft }
  );
  assert(
    state.themeSettings?.controls === 'bt-source-menu'
      && state.themeSettings.sourceLink === 'theme'
      && state.themeSettings.themeActionsHidden
      && state.themeSettings.settingsIconCount === 1
      && state.themeSettings.optionCount === 2
      && state.themeSettings.optionRoleCount === 2
      && state.themeSettings.sunIconCount === 1
      && state.themeSettings.moonIconCount === 1
      && state.themeSettings.borderTopWidth === '0px'
      && state.themeSettings.marginTop === '0px',
    `[${viewport.name}] Theme settings did not match the regular grouped-item presentation`,
    state.themeSettings
  );
  assert(
    state.headerBacklink?.ariaLabel === 'プロダクト一覧に戻る'
      && state.headerBacklink.visibleLabelClass
      && state.headerBacklink.arrowIconCount === 1
      && state.headerBacklink.width === (viewport.width <= 760 ? 40 : 56),
    `[${viewport.name}] Header backlink was not rendered as an accessible icon-only control`,
    state.headerBacklink
  );
  assert(
    state.primarySurface?.backgroundColor === 'rgba(0, 0, 0, 0)'
      && state.primarySurface?.borderTopWidth === '0px',
    `[${viewport.name}] The main Bartical icon was still rendered inside a card`,
    state.primarySurface
  );
  const compactMenubar = viewport.width <= 760;
  const expectedLauncherCenterGap = compactMenubar ? 48 : 94;
  const expectedMainToSystemCenterGap = compactMenubar ? 48 : 86;
  const expectedMainToSystemEdgeGap = compactMenubar ? 0 : 18;
  assert(
    state.launcherCenterGaps.length === 2
      && state.launcherCenterGaps.every((gap) => Math.abs(gap - expectedLauncherCenterGap) <= LAYOUT_TOLERANCE),
    `[${viewport.name}] Bartical launchers did not match the reference center spacing`,
    { launcherCenterGaps: state.launcherCenterGaps, expectedLauncherCenterGap }
  );
  assert(
    state.mainToSystemCenterGap !== null
      && Math.abs(state.mainToSystemCenterGap - expectedMainToSystemCenterGap) <= LAYOUT_TOLERANCE,
    `[${viewport.name}] The first other-app icon did not match the reference center spacing`,
    { mainToSystemCenterGap: state.mainToSystemCenterGap, expectedMainToSystemCenterGap }
  );
  assert(
    state.mainToSystemEdgeGap !== null
      && Math.abs(state.mainToSystemEdgeGap - expectedMainToSystemEdgeGap) <= LAYOUT_TOLERANCE,
    `[${viewport.name}] The control groups did not keep their expected edge spacing`,
    { mainToSystemEdgeGap: state.mainToSystemEdgeGap, expectedMainToSystemEdgeGap }
  );
  assert(
    state.systemCenterGaps.every((gap) => Math.abs(gap - (compactMenubar ? 48 : 72)) <= LAYOUT_TOLERANCE),
    `[${viewport.name}] Other menu-bar apps did not keep consistent icon spacing`,
    { systemCenterGaps: state.systemCenterGaps }
  );
  assert(state.systemItemCount === 5, `[${viewport.name}] Right-side menu-bar app icons were removed`, state);
  assert(state.bodyOverflowX === 'clip', `[${viewport.name}] Right-side overflow was not clipped without horizontal scrolling`, state);
  assert(
    state.iconSizeDifference !== null && state.iconSizeDifference <= 2,
    `[${viewport.name}] Other menu-bar app icons did not match the Bartical icon scale`,
    { iconSizeDifference: state.iconSizeDifference }
  );
  assert(
    state.mainIcon?.src === './BarticalIconBody.svg'
      && state.mainIcon.complete
      && state.mainIcon.naturalWidth > 0
      && state.mainIcon.naturalHeight > 0,
    `[${viewport.name}] Local Bartical SVG did not load in the main launcher`,
    state.mainIcon
  );
  assert(state.renderedLucideCount > 0, `[${viewport.name}] No rendered Lucide SVG was found`, state);
  assert(
    state.verticalLinkCount > 0 && state.verticalLucideCount === state.verticalLinkCount,
    `[${viewport.name}] Every vertical-menu link must use exactly one rendered Lucide icon`,
    { verticalLinkCount: state.verticalLinkCount, verticalLucideCount: state.verticalLucideCount }
  );
  assert(state.activationStripHidden === true, `[${viewport.name}] Temporary anchors were visible before item activation`, state);
  assert(state.sourceMenuHidden === true, `[${viewport.name}] Original app menu was visible before item activation`, state);
  assert(
    state.configurationAnchorCount === 3
      && state.originalItemCount === 6
      && state.originalLucideCount === 6
      && state.originalThemeCount === 1
      && state.activationLauncherCount === 3
      && state.sourceMenuItemCount === 2
      && state.sourceMenuLucideCount === 2
      && state.sourceRechooseCount === 0
      && state.sourceCloseText === 'メニューを閉じる'
      && state.sourceCloseIconCount === 1
      && state.activationNumberedAssetCount === 4
      && state.activationOfficialAssetCount === 2,
    `[${viewport.name}] Activation reveal controls were incomplete`,
    state
  );

  assert(state.panelRect && state.panelRect.width > 0 && state.panelRect.height > 0, `[${viewport.name}] Main menu had no layout box`, state.panelRect);
  assert(
    state.panelRect.left >= -LAYOUT_TOLERANCE
      && state.panelRect.top >= -LAYOUT_TOLERANCE
      && state.panelRect.right <= state.viewport.width + LAYOUT_TOLERANCE
      && state.panelRect.bottom <= state.viewport.height + LAYOUT_TOLERANCE,
    `[${viewport.name}] Main menu exceeded the viewport`,
    { panelRect: state.panelRect, viewport: state.viewport }
  );
}

async function verifyInteractions(page, viewport) {
  const mainButton = page.locator('[data-launcher="main"]');
  const mainPanel = page.locator('#bt-menu-main');
  const themeSettingsTrigger = page.locator('[data-theme-settings-trigger]');
  const themeSourceActions = page.locator('[data-theme-source-actions]');
  const sourceSectionActions = page.locator('[data-source-section-actions]');

  await themeSettingsTrigger.click();
  await page.waitForFunction(() => document.documentElement.dataset.barticalActivation === 'revealed');
  const themeActivationState = await page.evaluate(() => {
    const sourceMenu = document.querySelector('[data-source-menu]');
    const sourceMenuRect = sourceMenu?.getBoundingClientRect();
    const originalTheme = document.querySelector('[data-original-section="theme"]');
    const originalThemeRect = originalTheme?.getBoundingClientRect();
    const visibleOriginalItems = Array.from(document.querySelectorAll('[data-original-section]'))
      .filter((item) => item.getClientRects().length > 0);
    return {
      activationVisible: !document.querySelector('[data-activation-strip]')?.hidden,
      selectedOriginal: document.querySelector('[data-original-section][aria-pressed="true"]')?.dataset.originalSection,
      sourceMenuVisible: Boolean(sourceMenu && !sourceMenu.hidden && sourceMenu.getClientRects().length),
      themeActionsVisible: Boolean(document.querySelector('[data-theme-source-actions]')?.getClientRects().length),
      sectionActionsHidden: document.querySelector('[data-source-section-actions]')?.hidden,
      visibleAnchors: Array.from(document.querySelectorAll('.bt-activation-anchor'))
        .filter((item) => item.getClientRects().length > 0).length,
      originalSectionsRightToLeft: visibleOriginalItems
        .slice()
        .sort((left, right) => (
          right.getBoundingClientRect().left - left.getBoundingClientRect().left
        ))
        .map((item) => item.dataset.originalSection),
      sourceMenuRect: sourceMenuRect ? {
        left: sourceMenuRect.left,
        top: sourceMenuRect.top,
        right: sourceMenuRect.right,
        bottom: sourceMenuRect.bottom
      } : null,
      originalThemeRect: originalThemeRect ? {
        left: originalThemeRect.left,
        top: originalThemeRect.top,
        right: originalThemeRect.right,
        bottom: originalThemeRect.bottom
      } : null,
      aboutVisible: !document.querySelector('[data-about-window]')?.hidden,
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
  assert(
    themeActivationState.activationVisible
      && themeActivationState.selectedOriginal === 'theme'
      && themeActivationState.sourceMenuVisible
      && themeActivationState.themeActionsVisible
      && themeActivationState.sectionActionsHidden
      && themeActivationState.visibleAnchors === 3,
    `[${viewport.name}] Theme settings did not use the shared anchor reveal flow`,
    themeActivationState
  );
  assert(
    JSON.stringify(themeActivationState.originalSectionsRightToLeft) === JSON.stringify(
      viewport.width <= 760 ? ['theme'] : MAIN_GROUPED_ITEM_ORDER
    ),
    `[${viewport.name}] Restored main items did not follow the vertical menu from right to left`,
    themeActivationState.originalSectionsRightToLeft
  );
  assert(
    themeActivationState.aboutVisible,
    `[${viewport.name}] Opening display settings hid the independent About window`
  );
  assert(
    themeActivationState.sourceMenuRect
      && themeActivationState.originalThemeRect
      && themeActivationState.sourceMenuRect.top >= themeActivationState.originalThemeRect.bottom
      && themeActivationState.sourceMenuRect.left >= -LAYOUT_TOLERANCE
      && themeActivationState.sourceMenuRect.right <= themeActivationState.viewport.width + LAYOUT_TOLERANCE
      && themeActivationState.sourceMenuRect.bottom <= themeActivationState.viewport.height + LAYOUT_TOLERANCE,
    `[${viewport.name}] Theme menu did not open below the restored original icon`,
    themeActivationState
  );
  assert(await themeSourceActions.isVisible(), `[${viewport.name}] Theme choices were not visible in the source menu`);
  assert(await sourceSectionActions.getAttribute('hidden') !== null, `[${viewport.name}] Section actions remained visible in the theme menu`);
  await page.locator('[data-theme-option="light"]').click();
  await page.waitForFunction(() => (
    document.documentElement.dataset.theme === 'light'
      && document.querySelector('[data-hero-video]')?.getAttribute('src') === './hero-bg-light.mp4'
      && !document.documentElement.dataset.barticalActivation
  ));
  const lightThemeState = await page.evaluate(() => {
    const aboutWindowStyle = getComputedStyle(document.querySelector('.bt-about-window'));
    const aboutDetailsStyle = getComputedStyle(document.querySelector('.bt-about__details'));
    const aboutLinkStyle = getComputedStyle(document.querySelector('.bt-about__website a'));
    return {
      pageBackgroundColor: getComputedStyle(document.querySelector('.bt-page')).backgroundColor,
      heroBackgroundColor: getComputedStyle(document.querySelector('.bt-hero')).backgroundColor,
      aboutWindowBackgroundColor: aboutWindowStyle.backgroundColor,
      aboutWindowColor: aboutWindowStyle.color,
      aboutWindowBackdropFilter: aboutWindowStyle.backdropFilter || aboutWindowStyle.webkitBackdropFilter,
      aboutDetailsBackgroundColor: aboutDetailsStyle.backgroundColor,
      aboutLinkColor: aboutLinkStyle.color,
      stored: localStorage.getItem('mdw-theme'),
      preference: document.documentElement.dataset.themePreference,
      lightChecked: document.querySelector('[data-theme-option="light"]')?.getAttribute('aria-checked'),
      darkChecked: document.querySelector('[data-theme-option="dark"]')?.getAttribute('aria-checked'),
      sourceMenuHidden: document.querySelector('[data-source-menu]')?.hidden
    };
  });
  assert(
    lightThemeState.pageBackgroundColor === 'rgb(234, 244, 252)'
      && lightThemeState.heroBackgroundColor === 'rgba(0, 0, 0, 0)'
      && lightThemeState.stored === 'light'
      && lightThemeState.preference === 'light'
      && lightThemeState.lightChecked === 'true'
      && lightThemeState.darkChecked === 'false'
      && lightThemeState.aboutWindowBackgroundColor === 'rgba(236, 236, 236, 0.94)'
      && lightThemeState.aboutWindowColor === 'rgb(29, 29, 31)'
      && lightThemeState.aboutWindowBackdropFilter.includes('blur(36px)')
      && lightThemeState.aboutDetailsBackgroundColor === 'rgba(255, 255, 255, 0.56)'
      && lightThemeState.aboutLinkColor === 'rgb(0, 122, 255)'
      && lightThemeState.sourceMenuHidden,
    `[${viewport.name}] Light theme choice did not update the hero and shared preference`,
    lightThemeState
  );

  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);
  await themeSettingsTrigger.click();
  await page.waitForFunction(() => document.documentElement.dataset.barticalActivation === 'revealed');
  await page.locator('[data-theme-option="dark"]').click();
  await page.waitForFunction(() => (
    document.documentElement.dataset.theme === 'dark'
      && document.querySelector('[data-hero-video]')?.getAttribute('src') === './hero-bg-dark.mp4'
      && !document.documentElement.dataset.barticalActivation
  ));
  assert(
    await page.evaluate(() => (
      getComputedStyle(document.querySelector('.bt-page')).backgroundColor === 'rgb(24, 27, 58)'
        && getComputedStyle(document.querySelector('.bt-hero')).backgroundColor === 'rgba(0, 0, 0, 0)'
        && localStorage.getItem('mdw-theme') === 'dark'
        && document.querySelector('[data-theme-option="dark"]')?.getAttribute('aria-checked') === 'true'
        && document.querySelector('[data-source-menu]')?.hidden
    )),
    `[${viewport.name}] Dark theme choice did not restore the dark hero`
  );

  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);
  await themeSettingsTrigger.click();
  await page.waitForFunction(() => document.documentElement.dataset.barticalActivation === 'revealed');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.documentElement.dataset.barticalActivation);
  assert(await page.locator('[data-source-menu]').getAttribute('hidden') !== null, `[${viewport.name}] Escape did not close the theme source menu`);
  assert(
    await mainButton.evaluate((button) => document.activeElement === button),
    `[${viewport.name}] Escape did not restore focus to the source launcher`
  );

  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);

  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === true);
  assert(await mainButton.getAttribute('aria-expanded') === 'false', `[${viewport.name}] Main launcher did not collapse`);
  assert(await mainPanel.getAttribute('hidden') !== null, `[${viewport.name}] Collapsed main menu was missing its hidden parent state`);
  assert(
    await mainPanel.locator('[data-section-link]').evaluateAll((items) => items.every((item) => item.getClientRects().length === 0)),
    `[${viewport.name}] Links in the hidden main menu remained rendered`
  );

  await page.keyboard.press('Tab');
  assert(
    !await page.evaluate(() => document.getElementById('bt-menu-main')?.contains(document.activeElement)),
    `[${viewport.name}] Keyboard focus entered links inside the hidden main menu`
  );

  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);
  assert(await mainButton.getAttribute('aria-expanded') === 'true', `[${viewport.name}] Main launcher did not reopen`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === true);
  assert(await mainButton.getAttribute('aria-expanded') === 'false', `[${viewport.name}] Escape did not close the main menu`);
  assert(
    await mainButton.evaluate((button) => document.activeElement === button),
    `[${viewport.name}] Escape did not restore focus to the main launcher`
  );

  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);
  await page.locator('.bt-hero').click({ position: { x: 8, y: 420 } });
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === true);
  assert(await mainButton.getAttribute('aria-expanded') === 'false', `[${viewport.name}] Outside press did not close the main menu`);

  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);

  const launcherTwo = page.locator('[data-launcher="2"]');
  await launcherTwo.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-2')?.hidden === false);
  assert(await launcherTwo.getAttribute('aria-expanded') === 'true', `[${viewport.name}] Launcher 2 did not expand`);
  assert(await mainButton.getAttribute('aria-expanded') === 'false', `[${viewport.name}] Main launcher stayed expanded after switching to launcher 2`);
  assert(await mainPanel.getAttribute('hidden') !== null, `[${viewport.name}] Main panel stayed visible after switching to launcher 2`);

  const customizeSourceItem = page.locator('#bt-menu-2 [data-section-link="customize"]');
  const storedMainLauncherCenter = await mainButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return rect.left + (rect.width / 2);
  });
  await customizeSourceItem.click();
  await page.waitForFunction(() => document.documentElement.dataset.barticalActivation === 'revealed');
  const activationState = await page.evaluate(() => {
    const activationStrip = document.querySelector('[data-activation-strip]');
    const sourceMenu = document.querySelector('[data-source-menu]');
    const sourceMenuRect = sourceMenu?.getBoundingClientRect();
    const visibleOriginalItems = Array.from(document.querySelectorAll('[data-original-section]'))
      .filter((item) => item.getClientRects().length > 0);
    const verticalSections = Array.from(document.querySelectorAll('#bt-menu-2 [data-section-link]'))
      .map((item) => item.dataset.sectionLink);
    const visibleOriginalSectionSet = new Set(
      visibleOriginalItems.map((item) => item.dataset.originalSection)
    );
    return {
      hash: window.location.hash,
      activationVisible: Boolean(activationStrip && !activationStrip.hidden && activationStrip.getClientRects().length > 0),
      sourceMenuVisible: Boolean(sourceMenu && !sourceMenu.hidden && sourceMenu.getClientRects().length > 0),
      sourceMenuRect: sourceMenuRect ? {
        left: sourceMenuRect.left,
        right: sourceMenuRect.right,
        bottom: sourceMenuRect.bottom
      } : null,
      visibleAnchors: Array.from(document.querySelectorAll('.bt-activation-anchor'))
        .filter((item) => item.getClientRects().length > 0).length,
      visibleOriginalItems: visibleOriginalItems.length,
      visibleOriginalSections: visibleOriginalItems.map((item) => item.dataset.originalSection),
      expectedOriginalSectionsRightToLeft: verticalSections.filter((section) => (
        visibleOriginalSectionSet.has(section)
      )),
      actualOriginalSectionsRightToLeft: visibleOriginalItems
        .slice()
        .sort((left, right) => (
          right.getBoundingClientRect().left - left.getBoundingClientRect().left
        ))
        .map((item) => item.dataset.originalSection),
      selectedOriginal: document.querySelector('[data-original-section][aria-pressed="true"]')?.dataset.originalSection || null,
      selectedOriginalPresentation: (() => {
        const item = document.querySelector('[data-original-section][aria-pressed="true"]');
        const itemRect = item?.getBoundingClientRect();
        const pillStyle = item ? getComputedStyle(item, '::before') : null;
        return itemRect && pillStyle ? {
          itemWidth: itemRect.width,
          itemHeight: itemRect.height,
          pillWidth: Number.parseFloat(pillStyle.width),
          pillHeight: Number.parseFloat(pillStyle.height),
          pillBorderRadius: pillStyle.borderRadius,
          pillBackgroundColor: pillStyle.backgroundColor,
          pillOpacity: pillStyle.opacity
        } : null;
      })(),
      visibleActivationLaunchers: Array.from(document.querySelectorAll('[data-activation-launcher]'))
        .filter((item) => item.getClientRects().length > 0).length,
      visibleSystemItems: Array.from(document.querySelectorAll('.bt-menubar__system > span'))
        .filter((item) => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden').length,
      systemClockVisible: (() => {
        const clock = document.querySelector('.bt-menubar__clock');
        return Boolean(clock && clock.getClientRects().length > 0 && getComputedStyle(clock).visibility !== 'hidden');
      })(),
      aboutVisible: (() => {
        const about = document.querySelector('[data-about-window]');
        return Boolean(about && !about.hidden && about.getClientRects().length > 0);
      })(),
      revealedMainLauncherCenter: (() => {
        const item = document.querySelector('[data-activation-launcher="main"]');
        const rect = item?.getBoundingClientRect();
        return rect ? rect.left + (rect.width / 2) : null;
      })(),
      normalLauncherVisibility: Array.from(document.querySelectorAll('[data-launcher]'))
        .map((item) => getComputedStyle(item).visibility),
      overflow: {
        clientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      },
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
  assert(activationState.hash !== '#customize', `[${viewport.name}] Vertical item navigated before the original menu action`, activationState);
  assert(activationState.activationVisible, `[${viewport.name}] Configuration anchors and original items were not revealed`, activationState);
  assert(activationState.sourceMenuVisible, `[${viewport.name}] Original app menu was not shown`, activationState);
  assert(activationState.aboutVisible, `[${viewport.name}] Opening another grouped item hid the independent About window`, activationState);
  assert(activationState.visibleAnchors === 3, `[${viewport.name}] All configuration anchors were not temporarily shown`, activationState);
  assert(
    activationState.visibleOriginalItems === (viewport.width <= 760 ? 1 : 3),
    `[${viewport.name}] Anchor reveal included items outside the selected launcher's vertical menu`,
    activationState
  );
  assert(
    activationState.visibleOriginalSections.every((section) => (
      ['how-it-works', 'customize', 'requirements'].includes(section)
    )),
    `[${viewport.name}] Anchor reveal restored an original item absent from launcher 2`,
    activationState
  );
  assert(
    JSON.stringify(activationState.actualOriginalSectionsRightToLeft)
      === JSON.stringify(activationState.expectedOriginalSectionsRightToLeft),
    `[${viewport.name}] Restored original items did not follow the vertical menu from right to left`,
    activationState
  );
  assert(activationState.selectedOriginal === 'customize', `[${viewport.name}] Selected original item was not highlighted`, activationState);
  assert(
    activationState.selectedOriginalPresentation
      && activationState.selectedOriginalPresentation.pillWidth
        > activationState.selectedOriginalPresentation.pillHeight
      && activationState.selectedOriginalPresentation.pillWidth
        > activationState.selectedOriginalPresentation.itemWidth
      && activationState.selectedOriginalPresentation.pillHeight
        === activationState.selectedOriginalPresentation.itemHeight
      && activationState.selectedOriginalPresentation.pillBorderRadius === '999px'
      && activationState.selectedOriginalPresentation.pillBackgroundColor === 'rgba(255, 255, 255, 0.18)'
      && activationState.selectedOriginalPresentation.pillOpacity === '1',
    `[${viewport.name}] Selected original item did not use the macOS-style pill highlight`,
    activationState.selectedOriginalPresentation
  );
  assert(activationState.visibleActivationLaunchers === 3, `[${viewport.name}] Launchers were not kept available during activation`, activationState);
  assert(
    activationState.visibleSystemItems === (viewport.width <= 760 ? 1 : 5),
    `[${viewport.name}] Right-side menu-bar app icons disappeared during anchor reveal`,
    activationState
  );
  assert(
    activationState.systemClockVisible === (viewport.width > 980),
    `[${viewport.name}] Right-side clock visibility changed during anchor reveal`,
    activationState
  );
  assert(
    activationState.revealedMainLauncherCenter !== null
      && Math.abs(activationState.revealedMainLauncherCenter - storedMainLauncherCenter) <= LAYOUT_TOLERANCE,
    `[${viewport.name}] Main Bartical icon moved when anchors and original items were revealed`,
    { storedMainLauncherCenter, revealedMainLauncherCenter: activationState.revealedMainLauncherCenter }
  );
  assert(
    activationState.normalLauncherVisibility.every((visibility) => visibility === 'hidden'),
    `[${viewport.name}] Stored-state launcher strip remained visible during activation`,
    activationState
  );
  assert(
    activationState.sourceMenuRect
      && activationState.sourceMenuRect.left >= -LAYOUT_TOLERANCE
      && activationState.sourceMenuRect.right <= activationState.viewport.width + LAYOUT_TOLERANCE
      && activationState.sourceMenuRect.bottom <= activationState.viewport.height + LAYOUT_TOLERANCE,
    `[${viewport.name}] Original app menu exceeded the viewport`,
    activationState
  );

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.documentElement.dataset.barticalActivation);
  assert(await page.locator('[data-activation-strip]').getAttribute('hidden') !== null, `[${viewport.name}] Escape did not restore the stored layout`);
  assert(
    await launcherTwo.evaluate((button) => document.activeElement === button),
    `[${viewport.name}] Escape did not restore focus to the source launcher`
  );

  await launcherTwo.click();
  await customizeSourceItem.click();
  await page.waitForFunction(() => document.documentElement.dataset.barticalActivation === 'revealed');
  await page.locator('[data-source-close]').click();
  await page.waitForFunction(() => !document.documentElement.dataset.barticalActivation);
  assert(await page.locator('[data-source-menu]').getAttribute('hidden') !== null, `[${viewport.name}] Close menu action left the original menu open`);
  assert(await page.locator('[data-activation-strip]').getAttribute('hidden') !== null, `[${viewport.name}] Close menu action left anchors and original items visible`);
  assert(await launcherTwo.getAttribute('aria-expanded') === 'false', `[${viewport.name}] Close menu action reopened the launcher`);

  await launcherTwo.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-2')?.hidden === false);
  await customizeSourceItem.click();
  await page.waitForFunction(() => document.documentElement.dataset.barticalActivation === 'revealed');
  await page.locator('[data-source-navigation]').click();
  await page.waitForFunction(() => window.location.hash === '#customize');
  assert(await page.locator('[data-source-menu]').getAttribute('hidden') !== null, `[${viewport.name}] Original menu stayed open after section navigation`);
  assert(await page.locator('[data-activation-strip]').getAttribute('hidden') !== null, `[${viewport.name}] Anchors and original items stayed visible after section navigation`);
  assert(await page.locator('#bt-menu-2').getAttribute('hidden') !== null, `[${viewport.name}] Vertical menu stayed open after section navigation`);
  assert(
    await page.locator('[data-launcher]').evaluateAll((buttons) => buttons.every((button) => button.getAttribute('aria-expanded') === 'false')),
    `[${viewport.name}] A launcher remained expanded after section navigation`
  );
  assert(
    await page.locator('[data-about-window]').getAttribute('hidden') === null,
    `[${viewport.name}] Navigating from another grouped item hid the independent About window`
  );

  const comingSoonButton = page.locator('#coming-soon .bt-coming__button');
  assert(await comingSoonButton.isDisabled(), `[${viewport.name}] Coming Soon control was not disabled`);
  assert(
    await page.locator('#coming-soon a[href]').count() === 0,
    `[${viewport.name}] Coming Soon section exposed a distribution link`
  );

  const aboutWindow = page.locator('[data-about-window]');
  const aboutClose = page.locator('[data-about-close]');
  await page.evaluate(() => window.scrollTo(0, 0));
  assert(await aboutWindow.isVisible(), `[${viewport.name}] About did not remain visible after grouped-item interactions`);
  assert(await page.locator('[data-about-trigger]').count() === 0, `[${viewport.name}] Removed About trigger was still rendered`);
  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);
  await aboutClose.click();
  await page.waitForFunction(() => document.querySelector('[data-about-window]')?.hidden === true);
  assert(
    await page.locator('[data-about-version]').evaluateAll((items) => items.every((item) => item.textContent.trim() === '1.0.0(1)')),
    `[${viewport.name}] Independent About version display changed`
  );
  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);
  await page.locator('#bt-menu-main [data-section-link="how-it-works"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.barticalActivation === 'revealed');
  assert(
    await aboutWindow.getAttribute('hidden') !== null,
    `[${viewport.name}] Another grouped item reopened About after its own close control hid it`
  );
}

async function verifySourceMenuAlignment(page, viewport) {
  const mainButton = page.locator('[data-launcher="main"]');
  const mainPanel = page.locator('#bt-menu-main');

  for (const section of MAIN_GROUPED_ITEM_ORDER) {
    if (await mainPanel.getAttribute('hidden') !== null) {
      await mainButton.click();
      await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);
    }

    await page.locator(`#bt-menu-main [data-section-link="${section}"]`).click();
    await page.waitForFunction((activeSection) => (
      document.documentElement.dataset.barticalActivation === 'revealed'
        && document.querySelector('[data-source-menu]')?.hidden === false
        && document.querySelector('[data-original-section][aria-pressed="true"]')?.dataset.originalSection === activeSection
    ), section);

    const alignment = await page.evaluate((activeSection) => {
      const itemRect = document.querySelector(
        `[data-original-section="${activeSection}"]`
      )?.getBoundingClientRect();
      const menuRect = document.querySelector('[data-source-menu]')?.getBoundingClientRect();
      if (!itemRect || !menuRect) {
        return null;
      }
      const expectedLeft = Math.min(
        Math.max(itemRect.left, 8),
        document.documentElement.clientWidth - menuRect.width - 8
      );
      return {
        itemLeft: itemRect.left,
        menuLeft: menuRect.left,
        expectedLeft,
        offset: Math.abs(menuRect.left - expectedLeft)
      };
    }, section);

    assert(
      alignment && alignment.offset <= LAYOUT_TOLERANCE,
      `[${viewport.name}] ${section} menu left edge did not align with its original icon`,
      alignment
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.documentElement.dataset.barticalActivation);
  }

  await mainButton.click();
  await page.waitForFunction(() => document.getElementById('bt-menu-main')?.hidden === false);
}

async function verifyPlacementSimulation(page, viewport) {
  await page.evaluate(() => document.getElementById('overview')?.scrollIntoView({
    behavior: 'auto',
    block: 'start'
  }));
  await page.waitForFunction(() => {
    const rect = document.querySelector('[data-placement-bar]')?.getBoundingClientRect();
    return Boolean(rect && rect.top < innerHeight && rect.bottom > 0);
  });

  const readPlacementState = () => page.evaluate(() => ({
    boundaryCount: document.querySelectorAll('[data-placement-boundary]').length,
    order: Array.from(document.querySelector('[data-placement-bar]')?.children || [])
      .map((item) => item.dataset.placementItem
        || (item.dataset.placementBoundary ? `boundary-${item.dataset.placementBoundary}` : null))
      .filter(Boolean),
    memberships: Object.fromEntries(
      Array.from(document.querySelectorAll('[data-placement-item]'))
        .map((item) => [item.dataset.placementItem, item.dataset.placementMembership])
    )
  }));

  const initial = await readPlacementState();
  assert(
    initial.boundaryCount === 2
      && JSON.stringify(initial.order) === JSON.stringify([
        'calendar', 'cloud', 'boundary-2', 'bell', 'wifi', 'boundary-1'
      ])
      && initial.memberships.calendar === '2'
      && initial.memberships.cloud === '2'
      && initial.memberships.bell === '1'
      && initial.memberships.wifi === '1',
    `[${viewport.name}] Overview placement was not ordered ②→① from left to right`,
    initial
  );

  const bell = page.locator('[data-placement-item="bell"]');
  await bell.hover();
  const initialTooltip = await bell.evaluate((item) => {
    const tooltip = item.querySelector('.bt-placement__membership');
    return {
      text: tooltip?.textContent.trim() || '',
      visibility: tooltip ? getComputedStyle(tooltip).visibility : null,
      opacity: tooltip ? getComputedStyle(tooltip).opacity : null,
      ariaLabel: item.getAttribute('aria-label')
    };
  });
  assert(
    initialTooltip.text === '①①に所属しています'
      && initialTooltip.visibility === 'visible'
      && initialTooltip.opacity === '1'
      && initialTooltip.ariaLabel.includes('①に所属しています'),
    `[${viewport.name}] Placement item hover did not reveal its numbered membership`,
    initialTooltip
  );

  const bellBox = await bell.boundingBox();
  const boundaryTwoBox = await page.locator('[data-placement-boundary="2"]').boundingBox();
  assert(bellBox && boundaryTwoBox, `[${viewport.name}] Placement drag targets had no layout boxes`);
  await bell.dispatchEvent('pointerdown', {
    button: 0,
    buttons: 1,
    metaKey: true,
    pointerId: 41,
    clientX: bellBox.x + bellBox.width / 2,
    clientY: bellBox.y + bellBox.height / 2
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      buttons: 1,
      metaKey: true,
      pointerId: 41,
      clientX: x,
      clientY: y
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      button: 0,
      buttons: 0,
      metaKey: true,
      pointerId: 41,
      clientX: x,
      clientY: y
    }));
  }, {
    x: boundaryTwoBox.x + boundaryTwoBox.width / 2 - 2,
    y: boundaryTwoBox.y + boundaryTwoBox.height / 2
  });

  const regrouped = await readPlacementState();
  assert(
    JSON.stringify(regrouped.order) === JSON.stringify([
      'calendar', 'cloud', 'bell', 'boundary-2', 'wifi', 'boundary-1'
    ])
      && regrouped.memberships.bell === '2',
    `[${viewport.name}] Command-drag did not recalculate physical boundary membership`,
    regrouped
  );

  await bell.hover();
  const regroupedTooltip = await bell.locator('.bt-placement__membership').textContent();
  assert(
    regroupedTooltip.trim() === '②②に所属しています',
    `[${viewport.name}] Membership tooltip did not update after Command-drag`,
    regroupedTooltip
  );

  const movedBellBox = await bell.boundingBox();
  const movedBoundaryBox = await page.locator('[data-placement-boundary="2"]').boundingBox();
  const wifiBox = await page.locator('[data-placement-item="wifi"]').boundingBox();
  assert(movedBellBox && movedBoundaryBox && wifiBox, `[${viewport.name}] Placement reset targets had no layout boxes`);
  await bell.dispatchEvent('pointerdown', {
    button: 0,
    buttons: 1,
    metaKey: true,
    pointerId: 42,
    clientX: movedBellBox.x + movedBellBox.width / 2,
    clientY: movedBellBox.y + movedBellBox.height / 2
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      buttons: 1,
      metaKey: true,
      pointerId: 42,
      clientX: x,
      clientY: y
    }));
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      button: 0,
      buttons: 0,
      metaKey: true,
      pointerId: 42,
      clientX: x,
      clientY: y
    }));
  }, {
    x: (movedBoundaryBox.x + movedBoundaryBox.width + wifiBox.x) / 2,
    y: wifiBox.y + wifiBox.height / 2
  });

  const restored = await readPlacementState();
  assert(
    JSON.stringify(restored.order) === JSON.stringify(initial.order)
      && restored.memberships.bell === '1',
    `[${viewport.name}] Placement simulation did not restore its initial physical order`,
    restored
  );
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function verifyViewport(browser, baseUrl, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });

  try {
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

    await page.goto(`${baseUrl}/products/Bartical/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.BarticalHero) && document.querySelectorAll('svg.lucide').length > 0);
    await page.waitForFunction(() => document.documentElement.dataset.barticalVersionSource === 'appcast');
    await page.waitForLoadState('networkidle');

    const initialState = await readInitialState(page);
    assertInitialState(initialState, viewport);
    await verifyPlacementSimulation(page, viewport);
    await verifySourceMenuAlignment(page, viewport);
    await verifyInteractions(page, viewport);

    assert(pageErrors.length === 0, `[${viewport.name}] Page errors were reported`, pageErrors);
    assert(consoleErrors.length === 0, `[${viewport.name}] Console errors were reported`, consoleErrors);
  } finally {
    await context.close();
  }
}

async function main() {
  const browserType = BROWSER_TYPES[BROWSER_NAME];
  if (!browserType) {
    throw new Error(`Unsupported BARTICAL_BROWSER: ${BROWSER_NAME}`);
  }
  assert(fs.existsSync(BARTICAL_ICON), 'Local BarticalIconBody.svg is missing', BARTICAL_ICON);
  assert(fs.existsSync(BARTICAL_APP_ICON), 'Icon Composer BarticalAppIcon.png is missing', BARTICAL_APP_ICON);
  assert(fs.existsSync(BARTICAL_CATALOG_ICON), 'BarticalCatalogIcon.png is missing', BARTICAL_CATALOG_ICON);
  assert(fs.existsSync(BARTICAL_FAVICON), 'Icon Composer BarticalFavicon.png is missing', BARTICAL_FAVICON);
  assert(fs.existsSync(BARTICAL_APPCAST), 'Bartical appcast.xml is missing', BARTICAL_APPCAST);
  const barticalAppcast = fs.readFileSync(BARTICAL_APPCAST, 'utf8');
  assert(
    barticalAppcast.includes('<sparkle:shortVersionString>1.0.0</sparkle:shortVersionString>')
      && barticalAppcast.includes('<sparkle:version>1</sparkle:version>')
      && barticalAppcast.includes('<sparkle:informationalUpdate/>')
      && !barticalAppcast.includes('<enclosure'),
    'Bartical appcast did not describe the unreleased 1.0.0(1) informational update',
    barticalAppcast
  );
  assert(
    JSON.stringify(readPngSize(BARTICAL_APP_ICON)) === JSON.stringify({ width: 256, height: 256 }),
    'BarticalAppIcon.png did not have the expected Icon Composer export dimensions',
    readPngSize(BARTICAL_APP_ICON)
  );
  assert(
    JSON.stringify(readPngSize(BARTICAL_CATALOG_ICON)) === JSON.stringify({ width: 222, height: 222 }),
    'BarticalCatalogIcon.png did not have the expected tightly cropped dimensions',
    readPngSize(BARTICAL_CATALOG_ICON)
  );
  assert(
    JSON.stringify(readPngSize(BARTICAL_FAVICON)) === JSON.stringify({ width: 32, height: 32 }),
    'BarticalFavicon.png did not have the expected Icon Composer export dimensions',
    readPngSize(BARTICAL_FAVICON)
  );
  const productIndex = JSON.parse(fs.readFileSync(PRODUCT_INDEX, 'utf8'));
  const barticalProduct = productIndex.find((product) => product.dir === 'Bartical/');
  assert(
    barticalProduct?.image === 'BarticalAppIcon.png'
      && barticalProduct.catalog_image === 'BarticalCatalogIcon.png',
    'Bartical product cards did not use the Icon Composer application icon',
    barticalProduct
  );

  const server = await startServer();
  const port = server.address().port;
  let browser;

  try {
    browser = await browserType.launch({ headless: true });
    for (const viewport of VIEWPORTS) {
      await verifyViewport(browser, `http://127.0.0.1:${port}`, viewport);
    }
    console.log(`Bartical menu simulation passed in ${BROWSER_NAME}.`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
