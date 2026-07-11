(function () {
  const STORAGE_KEY = 'mdw-lang';
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
  let currentLocale = resolveLocale(readStoredLanguage() || 'ja');
  let activeCategory = 'all';
  let activeSort = 'date';
  let dataLoaded = false;
  let sectionNavigation = null;

  const sectionViewport = window.MDWSegmentedScroll.createViewportCssSync({
    rootElement: document.documentElement,
    widthProperty: '--catalog-section-width',
    heightProperty: '--catalog-section-height'
  });

  function setupSectionViewportSizing() {
    sectionViewport.mount();
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

  function getProductSectionId(item, index) {
    return `catalog-product-${slugifyProduct(item, index)}`;
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

  function getCatalogSections() {
    return Array.from(document.querySelectorAll('[data-catalog-section]'));
  }

  function getNumberButtons() {
    return numberNav ? Array.from(numberNav.querySelectorAll('.catalog-section-nav__number')) : [];
  }

  function getCatalogNavControls() {
    return [searchNavButton, ...getNumberButtons(), paginationButton, footerNavLink].filter(Boolean);
  }

  function getCatalogNavControlTarget(control) {
    return control.dataset.sectionTarget || control.dataset.paginationTarget || control.dataset.footerTarget || '';
  }

  function getCatalogScrollStops() {
    const stops = getCatalogSections().map((section) => ({
      id: section.id,
      element: section,
      align: 'start',
      role: 'content',
      observe: true,
      meta: {
        type: section.dataset.catalogSection || 'section',
        productIndex: Number.parseInt(section.dataset.productIndex || '', 10)
      }
    }));
    if (paginationTarget) {
      stops.push({
        id: paginationTarget.id,
        element: paginationTarget,
        eventRegion: paginationTarget,
        align: 'end',
        role: 'auxiliary',
        contentAnchor: 'previous',
        observe: false,
        meta: { type: 'pagination' }
      });
    }
    if (footerTarget) {
      stops.push({
        id: footerTarget.id,
        element: footerTarget,
        eventRegion: footerTarget,
        align: 'document-end',
        role: 'auxiliary',
        contentAnchor: 'previous',
        observe: false,
        meta: { type: 'footer' }
      });
    }
    return stops;
  }

  function updateCatalogNavigationHistory({ stop, options }) {
    if (!window.history) {
      return;
    }
    if (stop.role === 'auxiliary') {
      if (options.updateHistory !== false && window.history.pushState) {
        window.history.pushState(null, '', '#' + stop.id);
      }
      return;
    }
    const auxiliaryHashes = ['#catalog-footer', '#catalog-pagination-section'];
    if (auxiliaryHashes.includes(window.location.hash) && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function isNumberNavTarget(target) {
    return Boolean(numberNav && target instanceof Node && numberNav.contains(target));
  }

  function shouldYieldCatalogWheel(event, gesture) {
    return isNumberNavTarget(event.target) && (gesture.shiftKey || gesture.horizontalDominant);
  }

  function shouldYieldCatalogTouch(event, gesture) {
    const intentThreshold = window.MDWSegmentedScroll.DEFAULT_TIMINGS.touchIntentThreshold;
    return isNumberNavTarget(event.target)
      && gesture.absDeltaX >= intentThreshold
      && gesture.horizontalDominant;
  }

  function revealCatalogControl(control) {
    if (!numberNav || !numberNav.contains(control)) {
      return;
    }
    control.scrollIntoView({
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }

  function handleCatalogActiveChange() {
    updatePaginationStatus(currentLocale);
  }

  function scrollToCatalogSection(section) {
    return Boolean(sectionNavigation && section && sectionNavigation.goTo(section.id, {
      source: 'section-control'
    }));
  }

  function scrollToPagination(options = {}) {
    return Boolean(sectionNavigation && paginationTarget && sectionNavigation.goTo(paginationTarget.id, {
      ...options,
      source: 'pagination-control'
    }));
  }

  function scrollToFooter(options = {}) {
    return Boolean(sectionNavigation && footerTarget && sectionNavigation.goTo(footerTarget.id, {
      ...options,
      source: 'footer-control'
    }));
  }

  function refreshSectionObserver() {
    if (sectionNavigation) {
      sectionNavigation.refresh();
    }
  }

  function setupSectionNavigation() {
    const index = window.MDWSegmentedScroll.createStopIndex({
      initialId: searchSection ? searchSection.id : ''
    });
    const segments = window.MDWSegmentedScroll.createSegmentController({
      index,
      track: sectionNav,
      getControls: getCatalogNavControls,
      getTargetId: getCatalogNavControlTarget,
      revealControl: revealCatalogControl
    });
    sectionNavigation = window.MDWSegmentedScroll.createScrollController({
      index,
      segments,
      getStops: getCatalogScrollStops,
      reduceMotion,
      managedClass: 'catalog-scroll-managed',
      visibleClass: 'is-visible',
      shouldYieldWheel: shouldYieldCatalogWheel,
      shouldYieldTouch: shouldYieldCatalogTouch,
      onActiveChange: handleCatalogActiveChange,
      onNavigate: updateCatalogNavigationHistory
    });

    if (searchNavButton) {
      searchNavButton.addEventListener('click', () => {
        scrollToCatalogSection(searchSection);
      });
    }
    if (paginationButton) {
      paginationButton.addEventListener('click', () => {
        scrollToPagination();
      });
    }
    if (paginationPrev) {
      paginationPrev.addEventListener('click', () => {
        const currentPage = getCurrentProductPage();
        scrollToProductPage(currentPage - 1);
      });
    }
    if (paginationNext) {
      paginationNext.addEventListener('click', () => {
        const currentPage = getCurrentProductPage();
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
          segments.updateIndicator(activeControl);
        }
      }, { passive: true });
    }

    sectionNavigation.mount();
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
      button.dataset.sectionTarget = getProductSectionId(item, index);
      button.setAttribute('aria-label', localeConfig[lang].productNavLabel(index + 1, title));
      button.textContent = String(index + 1);
      button.addEventListener('click', () => {
        const section = document.getElementById(button.dataset.sectionTarget);
        scrollToCatalogSection(section);
      });
      numberNav.appendChild(button);
    });
  }

  function getCurrentProductPage(total = getFilteredCatalog().length) {
    if (total <= 0 || !sectionNavigation) {
      return 1;
    }
    const state = sectionNavigation.getState();
    const activeContent = sectionNavigation.index.getById(state.activeContentId);
    const productIndex = activeContent && activeContent.meta
      ? activeContent.meta.productIndex
      : Number.NaN;
    const current = Number.isFinite(productIndex) && productIndex >= 0
      ? Math.min(productIndex + 1, total)
      : 1;
    return Math.max(1, Math.ceil(current / PRODUCT_NAV_PAGE_SIZE));
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
    const currentPage = getCurrentProductPage(total);
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
      section.id = getProductSectionId(item, index);
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
