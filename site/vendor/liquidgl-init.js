(function () {
  const TARGET_SELECTOR = '.liquidGL';
  const INIT_DELAY_MS = 0;
  const REFRESH_DELAY_MS = 320;
  const PENDING_REVEAL_DELAY_MS = 900;
  const FALLBACK_RESTORE_MAX_ATTEMPTS = 40;
  const DEFAULT_SNAPSHOT_CAPTURE_TIMEOUT_MS = 8000;
  let initialized = false;
  let refreshTimer = null;

  function getRenderer() {
    return window.__liquidGLRenderer__ || null;
  }

  function getSnapshotCaptureTimeout() {
    const configured = Number(window.__MDWLiquidGLSnapshotCaptureTimeout);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_SNAPSHOT_CAPTURE_TIMEOUT_MS;
  }

  function trackSnapshot(snapshot) {
    if (snapshot && typeof snapshot.then === 'function') {
      snapshot
        .then((captured) => {
          if (captured || (getRenderer() && getRenderer().texture)) {
            restorePendingFallback();
          }
        })
        .catch(() => {});
    } else if (getRenderer() && getRenderer().texture) {
      restorePendingFallback();
    }
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
      const snapshot = renderer.captureSnapshot();
      trackSnapshot(snapshot);
    }, delay);
  }

  function normalizeInstances(result) {
    if (!result) {
      return [];
    }
    return Array.isArray(result) ? result.filter(Boolean) : [result];
  }

  function revealPendingLenses() {
    const renderer = getRenderer();
    if (!renderer || renderer.texture || !Array.isArray(renderer.lenses)) {
      return;
    }

    renderer.lenses.forEach((lens) => {
      if (!lens || !lens.el) {
        return;
      }
      if (!lens._mdwPendingFallback) {
        lens._mdwPendingFallbackStyles = {
          background: lens.el.style.background,
          backdropFilter: lens.el.style.backdropFilter,
          webkitBackdropFilter: lens.el.style.webkitBackdropFilter
        };
        lens._mdwPendingRevealTypeIndex = lens.revealTypeIndex;
      }
      lens.revealTypeIndex = 0;
      lens._revealProgress = 1;
      lens._mdwPendingFallback = true;
      lens.el.classList.add('is-liquidgl-fallback');
      lens.el.style.opacity = lens.originalOpacity || '1';
      lens.el.style.transition = lens.originalTransition || '';
      lens.el.style.background = 'var(--home-nav-bg)';
      lens.el.style.backdropFilter = 'blur(18px)';
      lens.el.style.webkitBackdropFilter = 'blur(18px)';
    });
  }

  function restorePendingFallback(attempt = 0) {
    const renderer = getRenderer();
    if (!renderer || !Array.isArray(renderer.lenses)) {
      return;
    }
    if (!renderer.texture) {
      if (!renderer._capturing && typeof renderer.captureSnapshot === 'function') {
        trackSnapshot(renderer.captureSnapshot());
      }
      if (attempt < FALLBACK_RESTORE_MAX_ATTEMPTS) {
        window.setTimeout(() => restorePendingFallback(attempt + 1), REFRESH_DELAY_MS);
      }
      return;
    }

    renderer.lenses.forEach((lens) => {
      if (!lens || !lens.el || !lens._mdwPendingFallback) {
        return;
      }
      const fallbackStyles = lens._mdwPendingFallbackStyles || {};
      lens._mdwPendingFallback = false;
      lens._mdwPendingFallbackStyles = null;
      if (lens._mdwPendingRevealTypeIndex !== undefined) {
        lens.revealTypeIndex = lens._mdwPendingRevealTypeIndex;
        lens._mdwPendingRevealTypeIndex = undefined;
      }
      lens._revealProgress = 1;
      lens.el.classList.remove('is-liquidgl-fallback');
      lens.el.style.background = fallbackStyles.background || 'transparent';
      lens.el.style.backdropFilter = fallbackStyles.backdropFilter || 'none';
      lens.el.style.webkitBackdropFilter = fallbackStyles.webkitBackdropFilter || 'none';
      lens.el.style.opacity = lens.originalOpacity || '1';
      lens.el.style.transition = lens.originalTransition || '';
    });

    renderer.canvas.style.opacity = '1';
    if (typeof renderer.render === 'function') {
      renderer.render();
    }
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
        snapshotImageTimeout: 600,
        snapshotCaptureTimeout: getSnapshotCaptureTimeout(),
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
    window.setTimeout(revealPendingLenses, PENDING_REVEAL_DELAY_MS);
    window.setTimeout(restorePendingFallback, PENDING_REVEAL_DELAY_MS + REFRESH_DELAY_MS);
    refresh(700);
  }

  function scheduleInit() {
    window.setTimeout(init, INIT_DELAY_MS);
  }

  window.MDWLiquidGL = {
    refresh
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInit, { once: true });
  } else {
    scheduleInit();
  }

  window.addEventListener('load', () => refresh(REFRESH_DELAY_MS), { once: true });
  window.addEventListener('liquidgl:snapshot-ready', () => restorePendingFallback());
  window.addEventListener('liquidgl:snapshot-failed', () => {
    const renderer = getRenderer();
    if (renderer && Array.isArray(renderer.lenses) && renderer.lenses.some((lens) => lens && lens._mdwPendingFallback)) {
      refresh(REFRESH_DELAY_MS);
    }
  });
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
