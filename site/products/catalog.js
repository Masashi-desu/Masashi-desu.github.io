(function () {
  const STORAGE_KEY = 'mdw-lang';
  const SECTION_NAV_LOCK_MS = 720;
  const SECTION_SCROLL_SETTLE_MS = 640;
  const WHEEL_SECTION_THRESHOLD = 86;
  const WHEEL_RESET_MS = 180;
  const TOUCH_SECTION_THRESHOLD = 48;
  const TOUCH_INTENT_THRESHOLD = 10;
  const TOUCH_MOMENTUM_SETTLE_MS = 520;
  const SECTION_ALIGN_ENFORCE_FRAMES = 36;
  const TOUCH_ACTIVITY_STALE_MS = 1100;
  const PRODUCT_NAV_PAGE_SIZE = 5;
  const PRODUCT_SEGMENT_DESIGNS = {
    KeycapMaker: { className: 'catalog-product-section--right' },
    RetreatScreen: { className: 'catalog-product-section--left' },
    WinKinesis: { className: 'catalog-product-section--center' },
    TypeFetch: { className: 'catalog-product-section--right' },
    'Surround1x0-AKDK': { className: 'catalog-product-section--left catalog-product-section--compact-title' }
  };
  const FALLBACK_SEGMENT_CLASSES = [
    'catalog-product-section--right',
    'catalog-product-section--left',
    'catalog-product-section--center'
  ];

  const grid = document.getElementById('product-grid');
  const updated = document.getElementById('catalog-updated');
  const updatedScope = document.querySelector('[data-i18n-scope="updatedLabel"]');
  const searchSection = document.getElementById('catalog-search-section');
  const sectionNav = document.querySelector('.catalog-section-nav__track');
  const searchNavButton = document.querySelector('.catalog-section-nav__icon-button[data-section-target="catalog-search-section"]');
  const numberNav = document.getElementById('catalog-product-nav');
  const paginationButton = document.getElementById('catalog-pagination-nav');
  const paginationTarget = paginationButton ? document.getElementById(paginationButton.dataset.paginationTarget) : null;
  const paginationStatus = document.getElementById('catalog-pagination-status');
  const paginationPrev = document.getElementById('catalog-pagination-prev');
  const paginationNext = document.getElementById('catalog-pagination-next');
  const footerNavLink = document.querySelector('.catalog-section-nav__footer-link');
  const footerTarget = footerNavLink ? document.getElementById(footerNavLink.dataset.footerTarget) : null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const controls = {
    wrapper: document.getElementById('product-controls'),
    category: document.getElementById('category-filter'),
    categoryLabel: document.getElementById('category-filter-label'),
    sort: document.getElementById('sort-order'),
    sortLabel: document.getElementById('sort-order-label'),
    count: document.getElementById('product-count')
  };
  const fallbackCopy = {};
  const localeConfig = {
    ja: {
      sectionLabel: 'Product Portfolio',
      sectionTitle: 'Product',
      sectionBody: 'macOS向けのプロダクティビティツールからハードウェアまで。ビルドを重ねてきたプロジェクトのスナップショットをこちらにまとめています。',
      backHome: '← ホーム',
      updatedLabel: '更新日: ',
      ctaExternal: '公式サイトへ',
      ctaInternal: '詳細を見る',
      navSearchLabel: '検索と絞り込み',
      navPaginationLabel: 'ページネーション',
      navSettingsLabel: 'フッター設定',
      paginationPrevLabel: '前のページ',
      paginationNextLabel: '次のページ',
      paginationCurrentLabel: (current, total) => `${current} / ${total}`,
      productNavLabel: (index, title) => `${index}番目: ${title}`,
      themeLabel: 'テーマ',
      themeSystem: 'システム',
      themeLight: 'ライト',
      themeDark: 'ダーク',
      dateFormat: new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
      updatedFormat: new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      categoryFilterLabel: 'カテゴリ',
      sortOrderLabel: '並び替え',
      allCategoriesOption: 'すべて',
      sortOptionDate: '新しい順',
      sortOptionCategory: 'カテゴリ順',
      emptyState: '該当するプロダクトがありません。',
      loadingState: 'プロダクトを読み込み中です。',
      formatResultCount: (shown, total) => `${shown}件表示 / 全${total}件`
    },
    en: {
      sectionLabel: 'Product Portfolio',
      sectionTitle: 'Product',
      sectionBody: 'From macOS productivity tools to experimental hardware - discover snapshots of the projects we keep iterating on.',
      backHome: '← Home',
      updatedLabel: 'Updated: ',
      ctaExternal: 'Visit Website',
      ctaInternal: 'View Details',
      navSearchLabel: 'Search and filters',
      navPaginationLabel: 'Pagination',
      navSettingsLabel: 'Footer settings',
      paginationPrevLabel: 'Previous page',
      paginationNextLabel: 'Next page',
      paginationCurrentLabel: (current, total) => `${current} of ${total}`,
      productNavLabel: (index, title) => `Product ${index}: ${title}`,
      themeLabel: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      dateFormat: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      updatedFormat: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      categoryFilterLabel: 'Category',
      sortOrderLabel: 'Sort',
      allCategoriesOption: 'All categories',
      sortOptionDate: 'Newest first',
      sortOptionCategory: 'Category (A-Z)',
      emptyState: 'No products match this filter.',
      loadingState: 'Loading products.',
      formatResultCount: (shown, total) => `Showing ${shown} of ${total}`
    }
  };

  let catalog = [];
  let sections = [];
  let sectionObserver = null;
  let currentLocale = resolveLocale(readStoredLanguage() || 'ja');
  let activeCategory = 'all';
  let activeSort = 'date';
  let dataLoaded = false;
  let activeSectionTarget = searchSection ? searchSection.id : '';
  let activeNavTarget = activeSectionTarget;
  let sectionNavLockUntil = 0;
  let pendingCatalogSection = null;
  let pendingPaginationScroll = false;
  let pendingFooterScroll = false;
  let sectionSettleTimer = null;
  let sectionAlignFrame = null;
  let restAlignTimer = null;
  let restSampleScrollY = null;
  let touchPointsActive = 0;
  let lastTouchEventAt = 0;
  let wheelDeltaY = 0;
  let wheelResetTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchSectionHandled = false;
  let touchStartSegmentKind = '';

  function syncSectionViewportSize() {
    const viewport = window.visualViewport;
    const width = Math.round(viewport && viewport.width ? viewport.width : window.innerWidth);
    const height = Math.round(viewport && viewport.height ? viewport.height : window.innerHeight);
    if (width > 0) {
      document.documentElement.style.setProperty('--catalog-section-width', `${width}px`);
    }
    if (height > 0) {
      document.documentElement.style.setProperty('--catalog-section-height', `${height}px`);
    }
  }

  function setupSectionViewportSizing() {
    syncSectionViewportSize();
    window.addEventListener('resize', syncSectionViewportSize);
    window.addEventListener('orientationchange', syncSectionViewportSize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncSectionViewportSize);
    }
  }

  function readStoredLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function resolveLocale(locale) {
    return localeConfig[locale] ? locale : 'ja';
  }

  function recordFallbacks() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key || Object.prototype.hasOwnProperty.call(fallbackCopy, key)) {
        return;
      }
      fallbackCopy[key] = el.textContent.replace(/\s+$/u, '');
    });
  }

  function updateNavLabels(lang) {
    const config = localeConfig[lang];
    if (searchNavButton) {
      searchNavButton.setAttribute('aria-label', config.navSearchLabel);
      searchNavButton.title = config.navSearchLabel;
    }
    if (paginationButton) {
      paginationButton.setAttribute('aria-label', config.navPaginationLabel);
      paginationButton.title = config.navPaginationLabel;
    }
    if (footerNavLink) {
      footerNavLink.setAttribute('aria-label', config.navSettingsLabel);
      footerNavLink.title = config.navSettingsLabel;
    }
    if (paginationPrev) {
      paginationPrev.setAttribute('aria-label', config.paginationPrevLabel);
    }
    if (paginationNext) {
      paginationNext.setAttribute('aria-label', config.paginationNextLabel);
    }
  }

  function syncLanguageSelects(lang) {
    document.querySelectorAll('.lang-select').forEach((select) => {
      if (select.value !== lang) {
        select.value = lang;
      }
    });
  }

  function updateControlsLocale(lang) {
    const config = localeConfig[lang];
    if (controls.categoryLabel && config.categoryFilterLabel) {
      controls.categoryLabel.textContent = config.categoryFilterLabel;
    }
    if (controls.sortLabel && config.sortOrderLabel) {
      controls.sortLabel.textContent = config.sortOrderLabel;
    }
  }

  function refreshSortOptions(lang) {
    if (!controls.sort) {
      return;
    }
    const config = localeConfig[lang];
    const previous = controls.sort.value || activeSort || 'date';
    const optionDescriptors = [
      { value: 'date', label: config.sortOptionDate },
      { value: 'category', label: config.sortOptionCategory }
    ];
    controls.sort.innerHTML = '';
    optionDescriptors.forEach((descriptor) => {
      const option = document.createElement('option');
      option.value = descriptor.value;
      option.textContent = descriptor.label;
      controls.sort.appendChild(option);
    });
    const nextValue = optionDescriptors.some((descriptor) => descriptor.value === previous)
      ? previous
      : 'date';
    controls.sort.value = nextValue;
    activeSort = nextValue;
  }

  function refreshCategoryOptions(lang) {
    if (!controls.category) {
      return;
    }
    const config = localeConfig[lang];
    const discovered = new Set();
    catalog.forEach((item) => {
      if (!item || !Array.isArray(item.categories)) {
        return;
      }
      item.categories.forEach((category) => {
        if (category) {
          discovered.add(category);
        }
      });
    });
    const sortedCategories = Array.from(discovered).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    const previous = controls.category.value || activeCategory || 'all';
    controls.category.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = config.allCategoriesOption;
    controls.category.appendChild(allOption);
    sortedCategories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      controls.category.appendChild(option);
    });
    const nextValue = previous === 'all' || sortedCategories.includes(previous)
      ? previous
      : 'all';
    controls.category.value = nextValue;
    activeCategory = nextValue;
  }

  function buildProductHref(item) {
    const externalUrl = typeof item.url === 'string' ? item.url.trim() : '';
    if (externalUrl) {
      return { href: externalUrl, external: true };
    }
    let internalHref = `${item.dir || ''}`;
    if (!/\.html?$/u.test(internalHref)) {
      if (!internalHref.endsWith('/')) {
        internalHref = `${internalHref}/`;
      }
      internalHref = `${internalHref}index.html`;
    }
    return { href: appendProductSource(internalHref, 'catalog'), external: false };
  }

  function appendProductSource(href, source) {
    const [baseWithSearch, hash = ''] = href.split('#');
    const separator = baseWithSearch.includes('?') ? '&' : '?';
    return `${baseWithSearch}${separator}from=${encodeURIComponent(source)}${hash ? `#${hash}` : ''}`;
  }

  function buildAssetPath(item, assetPath) {
    const value = typeof assetPath === 'string' ? assetPath.trim() : '';
    if (!value) {
      return '';
    }
    if (/^(?:https?:)?\/\//u.test(value) || value.startsWith('/')) {
      return value;
    }
    return `${item.dir || ''}${value}`;
  }

  function getProductTitle(item, lang) {
    return lang === 'en' ? (item.title_en || item.title) : (item.title_ja || item.title);
  }

  function getProductDescription(item, lang) {
    return lang === 'en' ? (item.desc_en || item.desc) : (item.desc_ja || item.desc);
  }

  function getProductDesignKey(item) {
    const dir = typeof item.dir === 'string' ? item.dir.replace(/\/+$/u, '') : '';
    if (dir) {
      const parts = dir.split('/');
      return parts[parts.length - 1];
    }
    return item.title || '';
  }

  function getProductSegmentDesign(item, index) {
    const key = getProductDesignKey(item);
    const configured = PRODUCT_SEGMENT_DESIGNS[key];
    if (configured) {
      return configured;
    }
    return { className: FALLBACK_SEGMENT_CLASSES[index % FALLBACK_SEGMENT_CLASSES.length] };
  }

  function slugifyProduct(item, index) {
    const key = getProductDesignKey(item) || item.title || `product-${index + 1}`;
    const slug = key
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '');
    return slug || `product-${index + 1}`;
  }

  function getFilteredCatalog() {
    const baseline = Array.isArray(catalog) ? catalog.slice() : [];
    const filtered = activeCategory === 'all'
      ? baseline
      : baseline.filter((item) => Array.isArray(item.categories) && item.categories.includes(activeCategory));
    const working = filtered.slice();
    if (activeSort === 'category') {
      working.sort((a, b) => {
        const categoryA = Array.isArray(a.categories) && a.categories.length > 0 ? a.categories[0] : '';
        const categoryB = Array.isArray(b.categories) && b.categories.length > 0 ? b.categories[0] : '';
        const primary = categoryA.localeCompare(categoryB, 'en', { sensitivity: 'base' });
        if (primary !== 0) {
          return primary;
        }
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return (a.title_en || a.title || '').localeCompare(b.title_en || b.title || '', 'en', { sensitivity: 'base' });
      });
    } else {
      working.sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return (a.title_en || a.title || '').localeCompare(b.title_en || b.title || '', 'en', { sensitivity: 'base' });
      });
    }
    return working;
  }

  function updateResultCount(lang, shown) {
    if (!controls.count) {
      return;
    }
    const total = catalog.length;
    const config = localeConfig[lang];
    if (typeof config.formatResultCount === 'function') {
      controls.count.textContent = config.formatResultCount(shown, total);
    } else {
      controls.count.textContent = `${shown}/${total}`;
    }
  }

  function collectSections() {
    sections = Array.from(document.querySelectorAll('[data-catalog-section]'));
    return sections;
  }

  function getNumberButtons() {
    return numberNav ? Array.from(numberNav.querySelectorAll('.catalog-section-nav__number')) : [];
  }

  function getAllNavControls() {
    return [searchNavButton, ...getNumberButtons(), paginationButton, footerNavLink].filter(Boolean);
  }

  function updateSectionNavIndicator(activeControl) {
    if (!sectionNav || !activeControl) {
      return;
    }
    const navRect = sectionNav.getBoundingClientRect();
    const controlRect = activeControl.getBoundingClientRect();
    sectionNav.style.setProperty('--segment-x', `${controlRect.left - navRect.left}px`);
    sectionNav.style.setProperty('--segment-width', `${controlRect.width}px`);
  }

  function updateSectionNav(targetId) {
    const isFooterTarget = Boolean(footerTarget && targetId === footerTarget.id);
    const isPaginationTarget = Boolean(paginationTarget && targetId === paginationTarget.id);
    if (targetId && !isFooterTarget && !isPaginationTarget) {
      activeSectionTarget = targetId;
    }
    if (targetId) {
      activeNavTarget = targetId;
    }
    const visibleTarget = activeNavTarget || activeSectionTarget;
    let activeControl = null;
    getAllNavControls().forEach((control) => {
      const controlTarget = control.dataset.sectionTarget || control.dataset.paginationTarget || control.dataset.footerTarget || '';
      const active = controlTarget === visibleTarget;
      control.classList.toggle('is-active', active);
      control.setAttribute('aria-current', active ? 'true' : 'false');
      if (active) {
        activeControl = control;
      }
    });
    const activeNumber = numberNav ? numberNav.querySelector(`[data-section-target="${visibleTarget}"]`) : null;
    if (activeNumber) {
      activeNumber.scrollIntoView({
        behavior: reduceMotion.matches ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
    updateSectionNavIndicator(activeControl);
    updatePaginationStatus(currentLocale);
  }

  function getFooterAdjacentSection() {
    return sections.length > 0 ? sections[sections.length - 1] : null;
  }

  function updateFooterNav() {
    if (!footerTarget) {
      return;
    }
    const adjacentSection = getFooterAdjacentSection();
    if (adjacentSection) {
      activeSectionTarget = adjacentSection.id;
    }
    updateSectionNav(footerTarget.id);
  }

  function updatePaginationNav() {
    if (!paginationTarget) {
      return;
    }
    const adjacentSection = getFooterAdjacentSection();
    if (adjacentSection) {
      activeSectionTarget = adjacentSection.id;
    }
    updateSectionNav(paginationTarget.id);
  }

  function getDocumentBottomScrollTop() {
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const documentHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    return Math.max(0, Math.round(documentHeight - viewportHeight));
  }

  function getPaginationScrollTop() {
    if (!paginationTarget) {
      return null;
    }
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const rect = paginationTarget.getBoundingClientRect();
    return Math.max(0, Math.round(rect.bottom + window.scrollY - viewportHeight));
  }

  function getSectionScrollTop(section) {
    return Math.round(section.getBoundingClientRect().top + window.scrollY);
  }

  function readManagedStopTop(stop) {
    if (!stop) {
      return null;
    }
    if (stop.kind === 'pagination') {
      return getPaginationScrollTop();
    }
    if (stop.kind === 'footer') {
      return getDocumentBottomScrollTop();
    }
    return stop.element ? getSectionScrollTop(stop.element) : null;
  }

  function getManagedScrollStops() {
    const stops = sections
      .filter((section) => section && section.id)
      .map((section) => ({
        kind: 'section',
        id: section.id,
        element: section,
        top: getSectionScrollTop(section)
      }));
    const paginationTop = getPaginationScrollTop();
    if (paginationTarget && paginationTop !== null) {
      stops.push({
        kind: 'pagination',
        id: paginationTarget.id,
        element: paginationTarget,
        top: paginationTop
      });
    }
    if (footerTarget) {
      stops.push({
        kind: 'footer',
        id: footerTarget.id,
        element: footerTarget,
        top: getDocumentBottomScrollTop()
      });
    }
    return stops
      .filter((stop) => Number.isFinite(stop.top))
      .sort((a, b) => a.top - b.top);
  }

  function eventIncludesElement(event, element) {
    if (!event || !element) {
      return false;
    }
    if (typeof event.composedPath === 'function') {
      return event.composedPath().includes(element);
    }
    return event.target instanceof Node && element.contains(event.target);
  }

  function getEventSegmentKind(event) {
    if (eventIncludesElement(event, footerTarget)) {
      return 'footer';
    }
    if (eventIncludesElement(event, paginationTarget)) {
      return 'pagination';
    }
    return '';
  }

  function updateManagedStopNav(stop) {
    if (!stop) {
      return;
    }
    if (stop.kind === 'footer') {
      updateFooterNav();
      return;
    }
    if (stop.kind === 'pagination') {
      updatePaginationNav();
      return;
    }
    updateSectionNav(stop.id);
  }

  function enforceManagedStopAlignment(stop) {
    enforceScrollAlignment(() => readManagedStopTop(stop));
  }

  function isSectionNavigationLocked() {
    return Date.now() < sectionNavLockUntil;
  }

  function clearWheelAccumulation() {
    wheelDeltaY = 0;
    if (wheelResetTimer !== null) {
      window.clearTimeout(wheelResetTimer);
      wheelResetTimer = null;
    }
  }

  function clearSectionSettleTimer() {
    if (sectionSettleTimer !== null) {
      window.clearTimeout(sectionSettleTimer);
      sectionSettleTimer = null;
    }
  }

  function cancelScrollAlignment() {
    if (sectionAlignFrame !== null) {
      window.cancelAnimationFrame(sectionAlignFrame);
      sectionAlignFrame = null;
    }
  }

  function enforceScrollAlignment(readTargetTop) {
    cancelScrollAlignment();
    let framesLeft = SECTION_ALIGN_ENFORCE_FRAMES;
    const step = () => {
      sectionAlignFrame = null;
      const targetTop = readTargetTop();
      if (targetTop === null) {
        return;
      }
      if (Math.abs(window.scrollY - targetTop) > 1) {
        window.scrollTo({
          top: targetTop,
          behavior: 'auto'
        });
      }
      framesLeft -= 1;
      if (framesLeft > 0) {
        sectionAlignFrame = window.requestAnimationFrame(step);
      }
    };
    step();
  }

  function isViewportZoomed() {
    return Boolean(window.visualViewport && window.visualViewport.scale > 1.02);
  }

  function scheduleRestAlignmentCheck(delay) {
    if (restAlignTimer !== null) {
      window.clearTimeout(restAlignTimer);
    }
    restAlignTimer = window.setTimeout(runRestAlignmentCheck, delay);
  }

  function runRestAlignmentCheck() {
    restAlignTimer = null;
    const touchRecentlyActive = touchPointsActive > 0 && (Date.now() - lastTouchEventAt) < TOUCH_ACTIVITY_STALE_MS;
    if (touchRecentlyActive || isSectionNavigationLocked() || pendingCatalogSection || pendingPaginationScroll || pendingFooterScroll || sectionAlignFrame !== null) {
      restSampleScrollY = null;
      scheduleRestAlignmentCheck(320);
      return;
    }
    touchPointsActive = 0;
    if (isViewportZoomed() || sections.length === 0) {
      return;
    }
    const current = window.scrollY;
    if (restSampleScrollY === null || Math.abs(restSampleScrollY - current) > 2) {
      restSampleScrollY = current;
      scheduleRestAlignmentCheck(220);
      return;
    }
    restSampleScrollY = null;
    const stops = getManagedScrollStops();
    if (stops.length === 0) {
      return;
    }
    let nearestStop = null;
    let nearestDistance = Infinity;
    stops.forEach((stop) => {
      const distance = Math.abs(stop.top - current);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestStop = stop;
      }
    });
    if (!nearestStop) {
      return;
    }
    const tolerance = Math.max(4, Math.round(window.innerHeight * 0.02));
    if (nearestDistance > tolerance) {
      sectionNavLockUntil = Date.now() + (reduceMotion.matches ? 160 : 480);
      enforceManagedStopAlignment(nearestStop);
    }
    updateManagedStopNav(nearestStop);
  }

  function settleCatalogSection(section, delay = SECTION_SCROLL_SETTLE_MS) {
    clearSectionSettleTimer();
    sectionSettleTimer = window.setTimeout(() => {
      sectionSettleTimer = null;
      if (!section || pendingCatalogSection !== section) {
        return;
      }
      enforceScrollAlignment(() => getSectionScrollTop(section));
      updateSectionNav(section.id);
      pendingCatalogSection = null;
    }, reduceMotion.matches ? 80 : delay);
  }

  function settleFooterScroll(delay = SECTION_SCROLL_SETTLE_MS) {
    clearSectionSettleTimer();
    sectionSettleTimer = window.setTimeout(() => {
      sectionSettleTimer = null;
      if (!pendingFooterScroll) {
        return;
      }
      pendingFooterScroll = false;
      enforceScrollAlignment(() => getDocumentBottomScrollTop());
      updateFooterNav();
    }, reduceMotion.matches ? 80 : delay);
  }

  function settlePaginationScroll(delay = SECTION_SCROLL_SETTLE_MS) {
    clearSectionSettleTimer();
    sectionSettleTimer = window.setTimeout(() => {
      sectionSettleTimer = null;
      if (!pendingPaginationScroll) {
        return;
      }
      pendingPaginationScroll = false;
      enforceScrollAlignment(() => getPaginationScrollTop());
      updatePaginationNav();
    }, reduceMotion.matches ? 80 : delay);
  }

  function scrollToCatalogSection(section) {
    if (!section) {
      return;
    }
    cancelScrollAlignment();
    sectionNavLockUntil = Date.now() + (reduceMotion.matches ? 160 : Math.max(SECTION_NAV_LOCK_MS, SECTION_SCROLL_SETTLE_MS + 140));
    pendingCatalogSection = section;
    pendingPaginationScroll = false;
    pendingFooterScroll = false;
    updateSectionNav(section.id);
    if (window.history && window.history.replaceState && (window.location.hash === '#catalog-footer' || window.location.hash === '#catalog-pagination-section')) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    window.scrollTo({
      top: getSectionScrollTop(section),
      behavior: reduceMotion.matches ? 'auto' : 'smooth'
    });
    settleCatalogSection(section);
  }

  function scrollToPagination(options = {}) {
    if (!paginationTarget) {
      return;
    }
    pendingCatalogSection = null;
    pendingPaginationScroll = true;
    pendingFooterScroll = false;
    cancelScrollAlignment();
    clearSectionSettleTimer();
    sectionNavLockUntil = Date.now() + (reduceMotion.matches ? 160 : Math.max(SECTION_NAV_LOCK_MS, SECTION_SCROLL_SETTLE_MS + 140));
    updatePaginationNav();
    paginationTarget.scrollIntoView({
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
      block: 'end'
    });
    if (options.updateHistory !== false && window.history && window.history.pushState) {
      window.history.pushState(null, '', `#${paginationTarget.id}`);
    }
    settlePaginationScroll();
  }

  function scrollToFooter(options = {}) {
    if (!footerTarget) {
      return;
    }
    pendingCatalogSection = null;
    pendingPaginationScroll = false;
    pendingFooterScroll = true;
    cancelScrollAlignment();
    clearSectionSettleTimer();
    sectionNavLockUntil = Date.now() + (reduceMotion.matches ? 160 : Math.max(SECTION_NAV_LOCK_MS, SECTION_SCROLL_SETTLE_MS + 140));
    updateFooterNav();
    footerTarget.scrollIntoView({
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
      block: 'end'
    });
    if (options.updateHistory !== false && window.history && window.history.pushState) {
      window.history.pushState(null, '', `#${footerTarget.id}`);
    }
    settleFooterScroll();
  }

  function isFooterNavPosition() {
    if (!footerTarget) {
      return false;
    }
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const documentHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const distanceFromBottom = documentHeight - (window.scrollY + viewportHeight);
    return distanceFromBottom <= Math.max(12, footerTarget.offsetHeight * 0.4);
  }

  function isPaginationNavPosition() {
    if (!paginationTarget) {
      return false;
    }
    const targetTop = getPaginationScrollTop();
    if (targetTop === null) {
      return false;
    }
    return Math.abs(window.scrollY - targetTop) <= Math.max(12, paginationTarget.offsetHeight * 0.4);
  }

  function syncFooterNavState() {
    if (isSectionNavigationLocked()) {
      return;
    }
    if (isFooterNavPosition()) {
      updateFooterNav();
      return;
    }
    if (isPaginationNavPosition()) {
      updatePaginationNav();
    }
  }

  function getDirectionalStop(direction, event, preferredSegmentKind = '') {
    if (direction === 0) {
      return null;
    }
    const stops = getManagedScrollStops();
    if (stops.length === 0) {
      return null;
    }
    const segmentKind = preferredSegmentKind || getEventSegmentKind(event);
    if (segmentKind) {
      const currentIndex = stops.findIndex((stop) => stop.kind === segmentKind);
      if (currentIndex >= 0) {
        return stops[currentIndex + direction] || null;
      }
    }
    const current = window.scrollY;
    const tolerance = 1;
    if (direction > 0) {
      return stops.find((stop) => stop.top > current + tolerance) || null;
    }
    for (let index = stops.length - 1; index >= 0; index -= 1) {
      if (stops[index].top < current - tolerance) {
        return stops[index];
      }
    }
    return null;
  }

  function canNavigateInDirection(direction, event, preferredSegmentKind = '') {
    return Boolean(getDirectionalStop(direction, event, preferredSegmentKind));
  }

  function scrollToManagedStop(stop) {
    if (!stop) {
      return;
    }
    if (stop.kind === 'footer') {
      scrollToFooter({ updateHistory: false });
      return;
    }
    if (stop.kind === 'pagination') {
      scrollToPagination({ updateHistory: false });
      return;
    }
    scrollToCatalogSection(stop.element);
  }

  function navigateSectionByDirection(direction, event, preferredSegmentKind = '') {
    const target = getDirectionalStop(direction, event, preferredSegmentKind);
    if (!target) {
      clearWheelAccumulation();
      return false;
    }
    if (event && event.cancelable) {
      event.preventDefault();
    }
    if (isSectionNavigationLocked()) {
      return true;
    }
    clearWheelAccumulation();
    scrollToManagedStop(target);
    return true;
  }

  function normalizeWheelDelta(event) {
    if (event.deltaMode === 1) {
      return event.deltaY * 16;
    }
    if (event.deltaMode === 2) {
      return event.deltaY * window.innerHeight;
    }
    return event.deltaY;
  }

  function isNumberNavTarget(target) {
    return Boolean(numberNav && target instanceof Node && numberNav.contains(target));
  }

  function handleSectionWheel(event) {
    if (isNumberNavTarget(event.target) && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
      return;
    }
    const deltaY = normalizeWheelDelta(event);
    if (Math.abs(deltaY) < 1) {
      return;
    }
    const direction = deltaY > 0 ? 1 : -1;
    if (!canNavigateInDirection(direction, event)) {
      clearWheelAccumulation();
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    if (isSectionNavigationLocked()) {
      return;
    }
    if (wheelDeltaY !== 0 && Math.sign(wheelDeltaY) !== direction) {
      wheelDeltaY = 0;
    }
    wheelDeltaY += deltaY;
    if (wheelResetTimer !== null) {
      window.clearTimeout(wheelResetTimer);
    }
    wheelResetTimer = window.setTimeout(clearWheelAccumulation, WHEEL_RESET_MS);
    if (Math.abs(wheelDeltaY) >= WHEEL_SECTION_THRESHOLD) {
      navigateSectionByDirection(direction, event);
    }
  }

  function markTouchActivity(event) {
    lastTouchEventAt = Date.now();
    touchPointsActive = event.touches ? event.touches.length : 0;
  }

  function handleSectionTouchStart(event) {
    markTouchActivity(event);
    scheduleRestAlignmentCheck(TOUCH_ACTIVITY_STALE_MS + 320);
    if (event.touches.length !== 1) {
      touchStartSegmentKind = '';
      return;
    }
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchSectionHandled = false;
    touchStartSegmentKind = getEventSegmentKind(event);
  }

  function handleSectionTouchMove(event) {
    markTouchActivity(event);
    if (event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const deltaX = touchStartX - touch.clientX;
    const deltaY = touchStartY - touch.clientY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    if (isNumberNavTarget(event.target) && absDeltaX >= TOUCH_INTENT_THRESHOLD && absDeltaX > absDeltaY) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    if (absDeltaY < TOUCH_INTENT_THRESHOLD || absDeltaY < absDeltaX * 1.25) {
      return;
    }
    const direction = deltaY > 0 ? 1 : -1;
    const preferredSegmentKind = touchStartSegmentKind || getEventSegmentKind(event);
    if (!canNavigateInDirection(direction, event, preferredSegmentKind)) {
      return;
    }
    if (touchSectionHandled || absDeltaY < TOUCH_SECTION_THRESHOLD) {
      return;
    }
    touchSectionHandled = navigateSectionByDirection(direction, event, preferredSegmentKind);
  }

  function handleSectionTouchEnd(event) {
    if (event) {
      markTouchActivity(event);
    } else {
      touchPointsActive = 0;
    }
    if (touchSectionHandled) {
      if (pendingCatalogSection) {
        sectionNavLockUntil = Date.now() + (reduceMotion.matches ? 160 : TOUCH_MOMENTUM_SETTLE_MS + 140);
        settleCatalogSection(pendingCatalogSection, TOUCH_MOMENTUM_SETTLE_MS);
      } else if (pendingPaginationScroll) {
        sectionNavLockUntil = Date.now() + (reduceMotion.matches ? 160 : TOUCH_MOMENTUM_SETTLE_MS + 140);
        settlePaginationScroll(TOUCH_MOMENTUM_SETTLE_MS);
      } else if (pendingFooterScroll) {
        sectionNavLockUntil = Date.now() + (reduceMotion.matches ? 160 : TOUCH_MOMENTUM_SETTLE_MS + 140);
        settleFooterScroll(TOUCH_MOMENTUM_SETTLE_MS);
      }
    }
    touchSectionHandled = false;
    touchStartSegmentKind = '';
    if (touchPointsActive === 0) {
      scheduleRestAlignmentCheck(TOUCH_MOMENTUM_SETTLE_MS + 200);
    }
  }

  function handlePaginationClick() {
    scrollToPagination();
  }

  function refreshSectionObserver() {
    collectSections();
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    if (!('IntersectionObserver' in window)) {
      updateSectionNav(activeNavTarget || activeSectionTarget);
      return;
    }
    sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      entries.forEach((entry) => {
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
      if (isSectionNavigationLocked() && activeNavTarget) {
        updateSectionNav(activeNavTarget);
        return;
      }
      if (isFooterNavPosition()) {
        updateFooterNav();
        return;
      }
      if (isPaginationNavPosition()) {
        updatePaginationNav();
        return;
      }
      if (visible && visible.target.id) {
        updateSectionNav(visible.target.id);
      }
    }, { threshold: [0.42, 0.58, 0.72] });
    sections.forEach((section) => sectionObserver.observe(section));
    updateSectionNav(activeNavTarget || activeSectionTarget);
  }

  function setupSectionNavigation() {
    collectSections();
    if (sections.length > 0) {
      document.documentElement.classList.add('catalog-scroll-managed');
    }
    if (searchNavButton) {
      searchNavButton.addEventListener('click', () => {
        scrollToCatalogSection(searchSection);
      });
    }
    if (paginationButton) {
      paginationButton.addEventListener('click', handlePaginationClick);
    }
    if (paginationPrev) {
      paginationPrev.addEventListener('click', () => {
        const currentPage = Number.parseInt(paginationStatus ? paginationStatus.textContent : '1', 10) || 1;
        scrollToProductPage(currentPage - 1);
      });
    }
    if (paginationNext) {
      paginationNext.addEventListener('click', () => {
        const currentPage = Number.parseInt(paginationStatus ? paginationStatus.textContent : '1', 10) || 1;
        scrollToProductPage(currentPage + 1);
      });
    }
    if (footerNavLink) {
      footerNavLink.addEventListener('click', (event) => {
        event.preventDefault();
        scrollToFooter();
      });
    }
    if (numberNav) {
      numberNav.addEventListener('scroll', () => {
        const activeControl = numberNav.querySelector('.catalog-section-nav__number.is-active');
        if (activeControl) {
          updateSectionNavIndicator(activeControl);
        }
      }, { passive: true });
    }
    window.addEventListener('wheel', handleSectionWheel, { passive: false });
    window.addEventListener('scroll', syncFooterNavState, { passive: true });
    if ('ontouchstart' in window || window.matchMedia('(any-pointer: coarse)').matches) {
      window.addEventListener('scroll', () => scheduleRestAlignmentCheck(260), { passive: true });
    }
    window.addEventListener('touchstart', handleSectionTouchStart, { passive: true });
    window.addEventListener('touchmove', handleSectionTouchMove, { passive: false });
    window.addEventListener('touchend', handleSectionTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleSectionTouchEnd, { passive: true });
    window.addEventListener('resize', () => {
      updateSectionNav(activeNavTarget || activeSectionTarget);
    });
    refreshSectionObserver();
  }

  function renderNumberNav(entries, lang) {
    if (!numberNav) {
      return;
    }
    numberNav.innerHTML = '';
    numberNav.style.setProperty('--catalog-product-page-count', String(Math.min(Math.max(entries.length, 1), 5)));
    entries.forEach((item, index) => {
      const title = getProductTitle(item, lang);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalog-section-nav__number';
      button.dataset.sectionTarget = `catalog-product-${slugifyProduct(item, index)}-${index + 1}`;
      button.setAttribute('aria-label', localeConfig[lang].productNavLabel(index + 1, title));
      button.textContent = String(index + 1);
      button.addEventListener('click', () => {
        const section = document.getElementById(button.dataset.sectionTarget);
        scrollToCatalogSection(section);
      });
      numberNav.appendChild(button);
    });
  }

  function updatePaginationStatus(lang = currentLocale) {
    if (!paginationStatus) {
      return;
    }
    const config = localeConfig[resolveLocale(lang)];
    const total = getFilteredCatalog().length;
    const pageCount = Math.max(1, Math.ceil(total / PRODUCT_NAV_PAGE_SIZE));
    if (total <= 0) {
      paginationStatus.textContent = '1';
      paginationStatus.setAttribute('aria-label', config.paginationCurrentLabel(1, 1));
      if (paginationPrev) {
        paginationPrev.disabled = true;
      }
      if (paginationNext) {
        paginationNext.disabled = true;
      }
      return;
    }
    const activeSection = document.getElementById(activeSectionTarget);
    const activeProductIndex = activeSection && activeSection.dataset.productIndex
      ? Number.parseInt(activeSection.dataset.productIndex, 10)
      : 0;
    const current = Number.isFinite(activeProductIndex) && activeProductIndex >= 0
      ? Math.min(activeProductIndex + 1, total)
      : 1;
    const currentPage = Math.max(1, Math.ceil(current / PRODUCT_NAV_PAGE_SIZE));
    paginationStatus.textContent = String(currentPage);
    paginationStatus.setAttribute('aria-label', config.paginationCurrentLabel(currentPage, pageCount));
    if (paginationPrev) {
      paginationPrev.disabled = currentPage <= 1;
    }
    if (paginationNext) {
      paginationNext.disabled = currentPage >= pageCount;
    }
  }

  function scrollToProductPage(pageNumber) {
    const entries = getFilteredCatalog();
    if (entries.length === 0) {
      return;
    }
    const pageCount = Math.max(1, Math.ceil(entries.length / PRODUCT_NAV_PAGE_SIZE));
    const targetPage = Math.min(Math.max(pageNumber, 1), pageCount);
    const targetIndex = (targetPage - 1) * PRODUCT_NAV_PAGE_SIZE;
    const targetButton = getNumberButtons()[targetIndex];
    const targetId = targetButton ? targetButton.dataset.sectionTarget : '';
    const targetSection = targetId ? document.getElementById(targetId) : null;
    if (targetSection) {
      scrollToCatalogSection(targetSection);
    }
  }

  function appendNoticeSection(message, kind) {
    if (!grid) {
      return;
    }
    const section = document.createElement('section');
    section.id = `catalog-${kind}-section`;
    section.className = `catalog-section catalog-notice-section catalog-notice-section--${kind}`;
    section.dataset.catalogSection = kind;
    section.setAttribute('aria-live', 'polite');

    const inner = document.createElement('div');
    inner.className = 'catalog-section__inner catalog-notice-section__inner';

    const notice = document.createElement('div');
    notice.className = kind === 'error' ? 'catalog-error-notice' : 'catalog-empty-state';
    notice.textContent = message;

    inner.appendChild(notice);
    section.appendChild(inner);
    grid.appendChild(section);
  }

  function setupControls() {
    if (controls.category && controls.category.dataset.bound !== 'true') {
      controls.category.dataset.bound = 'true';
      controls.category.addEventListener('change', (event) => {
        activeCategory = event.target.value || 'all';
        renderCards(currentLocale);
        scrollToCatalogSection(searchSection);
      });
    }
    if (controls.sort && controls.sort.dataset.bound !== 'true') {
      controls.sort.dataset.bound = 'true';
      controls.sort.addEventListener('change', (event) => {
        activeSort = event.target.value || 'date';
        renderCards(currentLocale);
        scrollToCatalogSection(searchSection);
      });
    }
  }

  function renderCards(locale) {
    if (!grid) {
      return;
    }
    const lang = resolveLocale(locale);
    grid.innerHTML = '';
    const entries = getFilteredCatalog();

    if (entries.length === 0) {
      if (dataLoaded) {
        appendNoticeSection(localeConfig[lang].emptyState, 'empty');
        updateResultCount(lang, 0);
        renderNumberNav([], lang);
        updatePaginationStatus(lang);
        refreshSectionObserver();
      }
      return;
    }

    renderNumberNav(entries, lang);
    entries.forEach((item, index) => {
      const design = getProductSegmentDesign(item, index);
      const linkInfo = buildProductHref(item);
      const titleText = getProductTitle(item, lang);
      const descText = getProductDescription(item, lang);
      const headerPath = buildAssetPath(item, item.header);
      const iconPath = buildAssetPath(item, item.image);
      const section = document.createElement('section');
      section.id = `catalog-product-${slugifyProduct(item, index)}-${index + 1}`;
      section.className = `catalog-section catalog-product-section ${design.className || ''}`.trim();
      section.dataset.catalogSection = 'product';
      section.dataset.productIndex = String(index);
      section.dataset.segmentVariant = design.className || 'default';
      section.setAttribute('aria-labelledby', `${section.id}-title`);
      section.setAttribute('data-transition-fade', 'true');

      const media = document.createElement('div');
      media.className = 'catalog-product-section__media';
      media.setAttribute('aria-hidden', 'true');
      if (headerPath || iconPath) {
        const image = document.createElement('img');
        image.src = headerPath || iconPath;
        image.alt = '';
        image.className = 'catalog-product-section__image';
        image.loading = index === 0 ? 'eager' : 'lazy';
        image.decoding = 'async';
        media.appendChild(image);
      }

      const scrim = document.createElement('div');
      scrim.className = 'catalog-product-section__scrim';
      scrim.setAttribute('aria-hidden', 'true');

      const inner = document.createElement('div');
      inner.className = 'catalog-section__inner catalog-product-section__inner';

      const indexLabel = document.createElement('p');
      indexLabel.className = 'catalog-product-section__index';
      indexLabel.textContent = `${String(index + 1).padStart(2, '0')} / ${String(entries.length).padStart(2, '0')}`;
      indexLabel.dataset.catalogAnimate = 'true';

      const title = document.createElement('h2');
      title.id = `${section.id}-title`;
      title.className = 'catalog-product-section__title';
      title.textContent = titleText;
      title.dataset.catalogAnimate = 'true';

      const desc = document.createElement('p');
      desc.className = 'catalog-product-section__caption';
      desc.textContent = descText;
      desc.dataset.catalogAnimate = 'true';

      const link = document.createElement('a');
      link.href = linkInfo.href;
      link.className = 'catalog-product-section__button';
      link.dataset.catalogAnimate = 'true';
      link.dataset.pressable = 'true';
      if (linkInfo.external) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      } else {
        link.dataset.transitionDirection = 'right';
      }
      const ctaText = document.createElement('span');
      ctaText.textContent = linkInfo.external ? localeConfig[lang].ctaExternal : localeConfig[lang].ctaInternal;
      const ctaArrow = document.createElement('span');
      ctaArrow.setAttribute('aria-hidden', 'true');
      ctaArrow.textContent = linkInfo.external ? '↗' : '→';
      link.appendChild(ctaText);
      link.appendChild(ctaArrow);

      if (iconPath) {
        const icon = document.createElement('img');
        icon.src = iconPath;
        icon.alt = `${titleText} icon`;
        icon.className = 'catalog-product-section__icon';
        icon.loading = 'lazy';
        icon.decoding = 'async';
        icon.dataset.catalogAnimate = 'true';
        inner.appendChild(icon);
      }

      inner.appendChild(indexLabel);
      inner.appendChild(title);
      inner.appendChild(desc);
      inner.appendChild(link);
      section.appendChild(media);
      section.appendChild(scrim);
      section.appendChild(inner);
      grid.appendChild(section);
    });

    updateResultCount(lang, entries.length);
    updatePaginationStatus(lang);

    if (window.mdwTheme && typeof window.mdwTheme.focusPressables === 'function') {
      window.mdwTheme.focusPressables(grid);
    }

    if (updated && updatedScope) {
      updated.textContent = localeConfig[lang].updatedFormat.format(new Date());
      updatedScope.textContent = `${localeConfig[lang].updatedLabel}`;
      updatedScope.appendChild(updated);
    }
    refreshSectionObserver();
  }

  function updateLanguage(locale) {
    recordFallbacks();
    const lang = resolveLocale(locale);
    currentLocale = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) {
        return;
      }
      if (lang === 'ja') {
        const fallback = fallbackCopy[key];
        if (typeof fallback === 'string') {
          el.textContent = fallback;
        }
      } else {
        const copy = localeConfig[lang][key];
        if (typeof copy === 'string') {
          el.textContent = copy;
        } else {
          const fallback = fallbackCopy[key];
          if (typeof fallback === 'string') {
            el.textContent = fallback;
          }
        }
      }
    });
    updateNavLabels(lang);
    updateControlsLocale(lang);
    refreshSortOptions(lang);
    refreshCategoryOptions(lang);
    syncLanguageSelects(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      /* ignore */
    }
    renderCards(lang);
    return lang;
  }

  const controller = window.MDWLanguageTransition
    ? window.MDWLanguageTransition.create((lang) => updateLanguage(lang), { duration: 320 })
    : null;

  function applyLanguage(locale, options = {}) {
    const target = resolveLocale(locale);
    if (controller) {
      controller.apply(target, options);
    } else {
      updateLanguage(target);
    }
  }

  function setupLanguageSelector() {
    document.querySelectorAll('.lang-select').forEach((select) => {
      if (select.dataset.bound === 'true') {
        select.value = currentLocale;
        return;
      }
      select.dataset.bound = 'true';
      select.addEventListener('change', (event) => {
        applyLanguage(event.target.value, { animate: true });
      });
      select.value = currentLocale;
    });
  }

  window.addEventListener('mdw:footer-loaded', () => {
    setupControls();
    setupLanguageSelector();
    applyLanguage(currentLocale);
  });

  setupSectionViewportSizing();
  setupSectionNavigation();
  setupControls();
  applyLanguage(currentLocale);
  setupLanguageSelector();

  fetch('index.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error('index.json の読み込みに失敗しました');
      }
      return response.json();
    })
    .then((items) => {
      catalog = Array.isArray(items) ? items : [];
      dataLoaded = true;
      applyLanguage(currentLocale);
    })
    .catch((error) => {
      dataLoaded = true;
      if (grid) {
        grid.innerHTML = '';
        appendNoticeSection(error.message, 'error');
      }
      renderNumberNav([], currentLocale);
      updatePaginationStatus(currentLocale);
      refreshSectionObserver();
    });
})();
