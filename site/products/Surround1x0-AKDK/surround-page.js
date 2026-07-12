(function () {
  const STORAGE_KEY = 'mdw-lang';
  const root = document.documentElement;
  const nav = document.querySelector('.surround-section-nav');
  const controls = Array.from(document.querySelectorAll('[data-surround-target], [data-surround-footer-target]'));
  const sections = Array.from(document.querySelectorAll('[data-surround-segment]'));
  const footerControl = document.querySelector('[data-surround-footer-target]');
  const footerTarget = footerControl ? document.getElementById(footerControl.dataset.surroundFooterTarget) : null;
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
      settingsLabel: 'Footer settings',
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
    if (footerControl) {
      const settingsLabel = lang === 'ja' ? 'フッタ設定' : translations[lang].settingsLabel;
      footerControl.setAttribute('aria-label', settingsLabel);
      footerControl.title = settingsLabel;
    }
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
    const stops = sections.map((section) => ({
      id: section.id,
      element: section,
      align: 'start',
      role: 'content',
      observe: true
    }));
    if (footerTarget) {
      stops.push({
        id: footerTarget.id,
        element: footerTarget,
        align: 'document-end',
        role: 'auxiliary',
        contentAnchor: 'previous',
        observe: false
      });
    }
    return stops;
  }

  function getControlTarget(control) {
    return control.dataset.surroundTarget || control.dataset.surroundFooterTarget || '';
  }

  function resolveInitialId() {
    const hashId = window.location.hash.replace(/^#/u, '');
    return [...sections, footerTarget].filter(Boolean).some((element) => element.id === hashId)
      ? hashId
      : (sections[0] ? sections[0].id : '');
  }

  function getSegmentIndex(id) {
    return Math.max(0, sections.findIndex((section) => section.id === id));
  }

  function announceSegment(id, source, contentId = id) {
    const index = getSegmentIndex(contentId);
    document.body.dataset.surroundStop = id;
    document.body.dataset.surroundScene = String(index);
    window.dispatchEvent(new CustomEvent('surround:segment-change', {
      detail: { id, contentId, index, source }
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
      heightProperty: '--surround-section-height'
    });
    viewport.mount();

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
      onActiveChange({ stop, source, activeContentId }) {
        announceSegment(stop.id, source, activeContentId);
      }
    });

    controls.forEach((control) => {
      control.addEventListener('click', (event) => {
        event.preventDefault();
        goTo(getControlTarget(control), {
          source: control === footerControl ? 'footer-control' : 'section-control'
        });
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
    const state = index.getState();
    announceSegment(state.activeId || resolveInitialId(), 'initial', state.activeContentId);
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
