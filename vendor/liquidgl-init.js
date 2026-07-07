(function () {
  const TARGET_SELECTOR = '.liquidGL';
  const INIT_DELAY_MS = 0;
  const REFRESH_DELAY_MS = 320;
  let initialized = false;
  let refreshTimer = null;

  function getRenderer() {
    return window.__liquidGLRenderer__ || null;
  }

  function refresh(delay = REFRESH_DELAY_MS) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      const renderer = getRenderer();
      if (!renderer || typeof renderer.captureSnapshot !== 'function') {
        return;
      }
      if (Array.isArray(renderer.lenses)) {
        renderer.lenses.forEach((lens) => {
          if (lens && typeof lens.updateMetrics === 'function') {
            lens.updateMetrics();
          }
        });
      }
      renderer.captureSnapshot();
    }, delay);
  }

  function normalizeInstances(result) {
    if (!result) {
      return [];
    }
    return Array.isArray(result) ? result.filter(Boolean) : [result];
  }

  function init() {
    const targets = Array.from(document.querySelectorAll(TARGET_SELECTOR));
    if (initialized || targets.length === 0) {
      return;
    }
    if (typeof window.html2canvas !== 'function' || typeof window.liquidGL !== 'function') {
      targets.forEach((target) => target.classList.add('is-liquidgl-fallback'));
      return;
    }

    initialized = true;
    let result;
    try {
      result = window.liquidGL({
        target: TARGET_SELECTOR,
        snapshot: 'body',
        resolution: 1.25,
        refraction: 0,
        bevelDepth: 0.052,
        bevelWidth: 0.211,
        frost: 2,
        shadow: false,
        specular: true,
        reveal: 'fade',
        revealDuration: 420,
        tilt: false,
        magnify: 1
      });
    } catch (error) {
      console.error(error);
      targets.forEach((target) => target.classList.add('is-liquidgl-fallback'));
      return;
    }

    window.MDWLiquidGL.instances = normalizeInstances(result);
    if (!getRenderer()) {
      targets.forEach((target) => target.classList.add('is-liquidgl-fallback'));
    }
    refresh(700);
  }

  function scheduleInit() {
    window.setTimeout(init, INIT_DELAY_MS);
  }

  window.MDWLiquidGL = {
    refresh
  };

  if (document.readyState === 'complete') {
    scheduleInit();
  } else {
    window.addEventListener('load', scheduleInit, { once: true });
  }

  window.addEventListener('mdw:footer-loaded', () => refresh(REFRESH_DELAY_MS));
  window.addEventListener('mdw:transition-enter-complete', () => refresh(REFRESH_DELAY_MS));
  document.addEventListener('change', (event) => {
    if (event.target instanceof HTMLSelectElement && event.target.matches('.theme-select')) {
      refresh(1100);
    }
  });

  if ('MutationObserver' in window) {
    const observer = new MutationObserver(() => refresh(900));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }
})();
