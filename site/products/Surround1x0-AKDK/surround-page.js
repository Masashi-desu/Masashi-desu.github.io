(function () {
  const STORAGE_KEY = 'mdw-lang';
  const root = document.documentElement;
  const nav = document.querySelector('.surround-section-nav');
  const controls = Array.from(document.querySelectorAll('[data-surround-target], [data-surround-footer-target]'));
  const sections = Array.from(document.querySelectorAll('[data-surround-segment]'));
  const features = document.getElementById('surround-02');
  const leftHandAnchor = document.getElementById('surround-03');
  const leftHandFrame = features.querySelector('[data-surround-hand="left"]');
  const leftHandCopy = leftHandFrame.querySelector('.surround-copy');
  const technology = document.getElementById('surround-technology');
  const technologyScroll = technology.querySelector('.surround-technology-scroll');
  const technologyItems = [...technologyScroll.querySelectorAll('li')];
  const footerControl = document.querySelector('[data-surround-footer-target]');
  const footerTarget = footerControl ? document.getElementById(footerControl.dataset.surroundFooterTarget) : null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const translations = {
    en: {
      back: 'Back to Products',
      loading3d: 'Loading 3D model',
      modelLeft: 'Left keyboard',
      modelRight: 'Right keyboard',
      modelKeyboardHint: 'Left drag to rotate, middle drag to move. Use one finger to rotate or two to move. Arrow keys rotate, Shift + arrow keys move. Escape resets the layout.',
      heroEyebrow: 'Experimental input system',
      heroTitle: 'The endpoint of HID',
      heroBody: 'From the fingertips to the cursor.\nOne body for every input.',
      scrollCue: 'Scroll to see the concept',
      integratedTitle: 'Keyboard,\npointer, and\nnumpad. United.',
      integratedBody: 'Reach letters, the pointer, and numbers\nwithout leaving the home position.',
      layerTitle: 'Input at full speed.',
      layerBody: 'A brain for switching layers.',
      layerDetail: 'A small move changes the entire input surface.\nEvery operation layered into a 40% outline.',
      technologyTitle: 'Technical specifications',
      technologyZmk: 'Firmware running on the microcontroller handles key input, layer switching, and pointer control.',
      technologyAutoKdk: 'A toolkit for designing the keyboard PCB, including the key layout and microcontroller connections.',
      technologyChoc: 'Low-profile mechanical switches register each keypress. They sit between the keycaps and the PCB.',
      technologyKeycaps: 'A tool for designing the shape of the keycaps your fingers touch.',
      technologyOfficial: 'Official website',
      technologyNewTab: '(opens in a new tab)',
      technologyPrevious: 'Previous specification',
      technologyNext: 'Next specification',
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
  let featureProgress = null;
  const atLeftHandHash = () => window.location.hash === `#${leftHandAnchor.id}`;
  let currentLocale = resolveLocale(readStoredLanguage() || 'ja');
  window.MDWSurroundNavigation = Object.freeze({
    isSettled() {
      if (!sectionNavigation) return false;
      const state = sectionNavigation.getState();
      const stop = sectionNavigation.getStop(state.activeId);
      const top = sectionNavigation.readStopTop(stop);
      const atStart = top !== null && Math.abs(window.scrollY - top) <= 1;
      const atLeftHand = stop?.id === features.id && Math.abs(leftHandAnchor.getBoundingClientRect().top) <= 1;
      return state.mounted && !state.moving && !state.locked && !state.aligning &&
        (atStart || atLeftHand);
    }
  });

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
    if (sectionNavigation) syncFeatureExit();
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

  function setupTechnologyScroll() {
    const items = technologyItems;
    const officialLinks = items.map((item) => item.querySelector('.surround-technology-link'));
    const controls = technology.querySelector('.surround-technology-controls');
    const previous = controls.querySelector('[data-surround-spec-step="-1"]');
    const next = controls.querySelector('[data-surround-spec-step="1"]');
    const position = controls.querySelector('.surround-technology-position');
    let active = 0;
    let requested = null;
    let previousWidth = technologyScroll.clientWidth;

    function syncPosition() {
      const width = technologyScroll.clientWidth;
      if (!width) return;
      if (width !== previousWidth) {
        // The old pixel offset may point to a different item after resizing.
        technologyScroll.scrollTo({ left: (requested ?? active) * width, behavior: 'instant' });
        previousWidth = width;
      }
      const raw = Math.min(items.length - 1, Math.max(0, technologyScroll.scrollLeft / width));
      const index = Math.round(raw);
      // A button's target can resolve to a fractional pixel on high-DPI displays.
      const progress = Math.abs(raw - index) * width <= 1 ? index : raw;
      technology.dataset.surroundSpecProgress = String(progress);
      if (index === active && items[index].hasAttribute('aria-current')) return;
      items[active].removeAttribute('aria-current');
      active = index;
      if (active === requested) requested = null;
      items[active].setAttribute('aria-current', 'true');
      officialLinks.forEach((link, linkIndex) => { link.tabIndex = linkIndex === active ? 0 : -1; });
      position.textContent = `${active + 1} / ${items.length}`;
      previous.setAttribute('aria-disabled', String(active === 0));
      next.setAttribute('aria-disabled', String(active === items.length - 1));
    }

    function show(index) {
      const target = Math.min(items.length - 1, Math.max(0, index));
      requested = target === active ? null : target;
      technologyScroll.scrollTo({
        left: target * technologyScroll.clientWidth,
        behavior: reduceMotion.matches ? 'instant' : 'smooth'
      });
    }

    controls.addEventListener('click', (event) => {
      const button = event.target.closest('[data-surround-spec-step]');
      if (button) show((requested ?? active) + Number(button.dataset.surroundSpecStep));
    });
    technologyScroll.addEventListener('keydown', (event) => {
      if (event.target !== technologyScroll) return;
      const index = requested ?? active;
      const targets = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: items.length - 1 };
      if (!Object.hasOwn(targets, event.key)) return;
      event.preventDefault();
      show(targets[event.key]);
    });
    technologyScroll.addEventListener('scroll', syncPosition, { passive: true });
    new ResizeObserver(syncPosition).observe(technologyScroll);
    for (const type of ['pointerdown', 'wheel', 'touchstart']) {
      technologyScroll.addEventListener(type, () => { requested = null; }, { passive: true });
    }
    controls.hidden = false;
    syncPosition();
  }

  function getScrollStops() {
    const stops = sections.map((section) => ({
      id: section.id,
      element: section,
      align: 'start',
      role: 'content',
      horizontalScroll: section === technology ? {
        element: technologyScroll,
        mode: 'threshold',
        getSnapPoints: () => technologyItems.map((_, index) => index * technologyScroll.clientWidth)
      } : undefined,
      scrollWithin: section === features,
      getForwardExitTop: section === features ? readFeatureExitTop : undefined,
      getReverseEntryTop: section === features ? readLeftHandTop : undefined,
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
    if (hashId === leftHandAnchor.id) return features.id;
    return [...sections, footerTarget].filter(Boolean).some((element) => element.id === hashId)
      ? hashId
      : (sections[0] ? sections[0].id : '');
  }

  function getSegmentIndex(id) {
    if (id === features.id) return featureProgress < 0.5 ? 1 : 2;
    return Number(document.getElementById(id)?.dataset.surroundSegment || 0);
  }

  function updateFeatureProgress() {
    const rect = features.getBoundingClientRect();
    const distance = Math.max(1, leftHandAnchor.getBoundingClientRect().top - rect.top);
    let progress = Math.min(1, Math.max(0, -rect.top / distance));
    if (rect.top >= -1) progress = 0;
    else if (rect.top <= 1 - distance) progress = 1;
    // Keep the text tied to document position even with reduced motion enabled.
    if (progress !== Number(features.style.getPropertyValue('--surround-feature-progress'))) {
      features.style.setProperty('--surround-feature-progress', String(progress));
    }
    if (reduceMotion.matches) progress = Number(progress >= 0.5);
    if (progress === featureProgress) return false;
    featureProgress = progress;
    document.body.dataset.surroundFeatureProgress = String(progress);
    return true;
  }

  function syncFeatureProgress() {
    if (document.body.dataset.surroundStop !== features.id || !updateFeatureProgress()) return;
    document.body.dataset.surroundScene = String(getSegmentIndex(features.id));
    window.dispatchEvent(new CustomEvent('surround:feature-scroll', { detail: { progress: featureProgress } }));
  }

  function syncFeatureExit() {
    const frameTop = leftHandFrame.getBoundingClientRect().top;
    const copyBottom = Math.max(...Array.from(leftHandCopy.children, (element) => {
      const text = document.createRange();
      text.selectNodeContents(element);
      return text.getBoundingClientRect().bottom - frameTop;
    }));
    const length = `${Math.max(1, Math.ceil(copyBottom))}px`;
    if (length !== features.style.getPropertyValue('--surround-feature-exit')) {
      features.style.setProperty('--surround-feature-exit', length);
    }
    syncFeatureProgress();
  }

  function readFeatureExitTop({ scrollY, viewportHeight }) {
    if (root.hasAttribute('data-overlay-scroll-dragging')) return null;
    // The section's trailing space is sized to the last visible line of copy.
    return Math.round(scrollY + features.getBoundingClientRect().bottom - viewportHeight);
  }

  function announceSegment(id, source, contentId = id) {
    if (contentId === features.id) updateFeatureProgress();
    const index = getSegmentIndex(contentId);
    document.body.dataset.surroundStop = id;
    document.body.dataset.surroundScene = String(index);
    const detail = { id, contentId, index, source, featureProgress: contentId === features.id ? featureProgress : null };
    window.dispatchEvent(new CustomEvent('surround:segment-change', { detail }));
  }

  function readLeftHandTop({ scrollY }) {
    return Math.round(scrollY + leftHandAnchor.getBoundingClientRect().top);
  }

  function restoreLeftHand() {
    sectionNavigation.goTo(features.id, { edge: 'reverse-entry', source: 'history', behavior: 'instant' });
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
      window.addEventListener('scroll', syncFeatureProgress, { passive: true });
      return;
    }

    const viewport = window.MDWSegmentedScroll.createViewportCssSync({
      rootElement: root,
      widthProperty: '--surround-section-width',
      heightProperty: '--surround-section-height',
      onChange: syncFeatureExit
    });
    viewport.mount();

    const segments = window.MDWSegmentedScroll.createSegmentView({
      track: nav,
      controls,
      getTargetId: getControlTarget
    });
    sectionNavigation = window.MDWSegmentedScroll.createScrollController({
      initialId: resolveInitialId(),
      getStops: getScrollStops,
      reduceMotion,
      managedClass: 'surround-scroll-managed',
      visibleClass: 'is-visible',
      shouldYieldTouch(event) {
        return Boolean(event.target.closest('[data-surround-model]'));
      },
      shouldYieldWheel(event) {
        if (!window.__SURROUND_3D__?.interaction?.dragging) return false;
        event.preventDefault();
        return true;
      },
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

    segments.connect(sectionNavigation);
    sectionNavigation.mount();
    syncFeatureExit();
    const hashId = window.location.hash.slice(1);
    if (atLeftHandHash()) restoreLeftHand();
    else if (hashId) sectionNavigation.goTo(resolveInitialId(), { behavior: 'auto', source: 'initial-hash' });
    const state = sectionNavigation.getState();
    announceSegment(state.activeId || resolveInitialId(), 'initial', state.activeContentId);
    window.addEventListener('scroll', syncFeatureProgress, { passive: true });
    reduceMotion.addEventListener('change', syncFeatureProgress);
    const resizeObserver = new ResizeObserver(syncFeatureExit);
    resizeObserver.observe(leftHandFrame);
    resizeObserver.observe(leftHandCopy);
    document.fonts.ready.then(syncFeatureExit);
  }

  recordFallbacks();
  applyLanguage(currentLocale);
  setupLanguageSelector();
  setupTechnologyScroll();
  setupSectionNavigation();

  window.addEventListener('mdw:footer-loaded', () => {
    recordFallbacks();
    setupLanguageSelector();
    applyLanguage(currentLocale);
  });

  window.addEventListener('popstate', () => {
    if (atLeftHandHash() && sectionNavigation) {
      restoreLeftHand();
      return;
    }
    const id = resolveInitialId();
    goTo(id, { source: 'history', updateHistory: false });
  });
})();
