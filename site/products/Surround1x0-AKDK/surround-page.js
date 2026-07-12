(function () {
  const STORAGE_KEY = 'mdw-lang';
  const root = document.documentElement;
  const nav = document.querySelector('.surround-section-nav');
  const controls = Array.from(document.querySelectorAll('[data-surround-target]'));
  const sections = Array.from(document.querySelectorAll('[data-surround-segment]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const translations = {
    en: {
      back: 'Back to Products',
      loading3d: 'Loading 3D model',
      heroEyebrow: 'Experimental input system',
      heroTitle: 'The endpoint of HID',
      heroBody: 'From the fingertips to the cursor.\nOne body for every input.',
      scrollCue: 'Scroll to see the concept',
      integratedTitle: 'Keyboard,\npointer, and\nnumpad. United.',
      integratedBody: 'Reach letters, the pointer, and numbers\nwithout leaving the home position.',
      layerTitle: 'Input at full speed.',
      layerBody: 'A brain for switching layers.',
      layerDetail: 'A small move changes the entire input surface.\nEvery operation layered into a 40% outline.',
      linksEyebrow: 'Open hardware prototype',
      linksBody: 'Explore the current design and its complete implementation.',
      repositoryLink: 'GitHub Repository',
      themeLabel: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark'
    }
  };
  const fallbackCopy = {};
  let sectionNavigation = null;
  let currentLocale = resolveLocale(readStoredLanguage() || 'ja');

  function resolveLocale(locale) {
    return Object.prototype.hasOwnProperty.call(translations, locale) ? locale : 'ja';
  }

  function readStoredLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function recordFallbacks() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      if (!key || Object.prototype.hasOwnProperty.call(fallbackCopy, key)) {
        return;
      }
      fallbackCopy[key] = element.textContent.replace(/\s+$/u, '');
    });
  }

  function syncLanguageSelects(locale) {
    document.querySelectorAll('.lang-select').forEach((select) => {
      if (select.value !== locale) {
        select.value = locale;
      }
    });
  }

  function updateLanguage(locale) {
    recordFallbacks();
    const lang = resolveLocale(locale);
    currentLocale = lang;
    root.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      if (!key) {
        return;
      }
      const translated = lang === 'ja' ? fallbackCopy[key] : translations[lang][key];
      if (typeof translated === 'string') {
        element.textContent = translated;
      }
    });
    syncLanguageSelects(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      // The selected language still applies for the current page.
    }
    if (window.MDWProductBacklink) {
      window.MDWProductBacklink.sync(lang);
    }
    return lang;
  }

  const languageController = window.MDWLanguageTransition
    ? window.MDWLanguageTransition.create((locale) => updateLanguage(locale), { duration: 320 })
    : null;

  function applyLanguage(locale, options = {}) {
    const target = resolveLocale(locale);
    if (languageController) {
      languageController.apply(target, options);
      return;
    }
    updateLanguage(target);
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

  function getScrollStops() {
    return sections.map((section) => ({
      id: section.id,
      element: section,
      role: 'content'
    }));
  }

  function getControlTarget(control) {
    return control.dataset.surroundTarget || '';
  }

  function resolveInitialId() {
    const hashId = window.location.hash.replace(/^#/u, '');
    return sections.some((section) => section.id === hashId)
      ? hashId
      : (sections[0] ? sections[0].id : '');
  }

  function getSegmentIndex(id) {
    return Math.max(0, sections.findIndex((section) => section.id === id));
  }

  function announceSegment(id, source) {
    const index = getSegmentIndex(id);
    document.body.dataset.surroundScene = String(index);
    window.dispatchEvent(new CustomEvent('surround:segment-change', {
      detail: { id, index, source }
    }));
  }

  function updateHistory(id, replace = false) {
    if (!window.history) {
      return;
    }
    const next = `${window.location.pathname}${window.location.search}#${id}`;
    const method = replace ? 'replaceState' : 'pushState';
    if (typeof window.history[method] === 'function') {
      window.history[method](null, '', next);
    }
  }

  function goTo(id, options = {}) {
    if (!sectionNavigation) {
      return false;
    }
    const moved = sectionNavigation.goTo(id, {
      source: options.source || 'section-control'
    });
    if (moved && options.updateHistory !== false) {
      updateHistory(id, options.replaceHistory === true);
    }
    return Boolean(moved);
  }

  function setupSectionNavigation() {
    if (!window.MDWSegmentedScroll || sections.length === 0) {
      announceSegment(resolveInitialId(), 'fallback');
      return;
    }

    const viewport = window.MDWSegmentedScroll.createViewportCssSync({
      rootElement: root,
      widthProperty: '--surround-section-width',
      heightProperty: '--surround-section-height',
      onChange: syncViewportOffset
    });
    viewport.mount();
    syncViewportOffset();

    const index = window.MDWSegmentedScroll.createStopIndex({
      initialId: resolveInitialId()
    });
    const segments = window.MDWSegmentedScroll.createSegmentController({
      index,
      track: nav,
      controls,
      getTargetId: getControlTarget
    });
    sectionNavigation = window.MDWSegmentedScroll.createScrollController({
      index,
      segments,
      getStops: getScrollStops,
      reduceMotion,
      managedClass: 'surround-scroll-managed',
      visibleClass: 'is-visible',
      onActiveChange({ stop, source }) {
        announceSegment(stop.id, source);
      }
    });

    controls.forEach((control) => {
      control.addEventListener('click', () => {
        goTo(control.dataset.surroundTarget, { source: 'section-control' });
      });
    });

    document.querySelectorAll('[data-surround-link]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const id = link.dataset.surroundLink;
        if (!document.getElementById(id)) {
          return;
        }
        event.preventDefault();
        goTo(id, { source: 'section-link' });
      });
    });

    sectionNavigation.mount();
    announceSegment(index.getState().activeId || resolveInitialId(), 'initial');
  }

  function syncViewportOffset() {
    const visualHeight = window.visualViewport?.height || window.innerHeight;
    const offset = Math.max(0, Math.round(visualHeight - window.innerHeight));
    root.style.setProperty('--surround-viewport-offset', `${offset}px`);
  }

  recordFallbacks();
  applyLanguage(currentLocale);
  setupLanguageSelector();
  setupSectionNavigation();

  window.addEventListener('mdw:footer-loaded', () => {
    recordFallbacks();
    setupLanguageSelector();
    applyLanguage(currentLocale);
  });

  window.addEventListener('popstate', () => {
    const id = resolveInitialId();
    goTo(id, { source: 'history', updateHistory: false });
  });
})();
