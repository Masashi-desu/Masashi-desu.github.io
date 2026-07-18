(function () {
  const CANVAS_HOST_SELECTOR = '.retreat-home';
  const CARD_SELECTOR = [
    '.retreat-section-window',
    '.retreat-info-card',
    '.retreat-flow-list > li',
    '.retreat-spec-list',
    '.retreat-care-card'
  ].join(', ');
  const VIDEO_ID = 'retreat-background-video';
  const MAX_ATTEMPTS = 120;
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let attempts = 0;
  let activeTheme = '';
  let resumeTime = 0;

  function decorateLiquidCards() {
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      if (card.classList.contains('retreat-liquid-card')) {
        return;
      }

      const layer = document.createElement('div');
      layer.className = 'retreat-card-liquid liquidGL';
      layer.dataset.liquidRefraction = '0.012';
      layer.dataset.liquidBevelDepth = '0.048';
      layer.dataset.liquidBevelWidth = '0.18';
      layer.dataset.liquidFrost = '0';
      layer.dataset.liquidSpecular = 'false';
      layer.setAttribute('aria-hidden', 'true');

      card.classList.add('retreat-liquid-card');
      card.setAttribute('data-liquid-ignore', '');
      card.prepend(layer);
    });
  }

  function requestLiquidRefresh(delay = 0) {
    if (!window.MDWLiquidGL || typeof window.MDWLiquidGL.refresh !== 'function') {
      return;
    }
    window.MDWLiquidGL.refresh(delay);
  }

  function resolveTheme() {
    return root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function syncPlayback(video) {
    if (reducedMotion.matches || document.hidden) {
      video.pause();
      return;
    }
    const playback = video.play();
    if (playback && typeof playback.catch === 'function') {
      playback.catch(() => {});
    }
  }

  function syncVideoTheme() {
    const video = document.getElementById(VIDEO_ID);
    if (!video) {
      return;
    }

    const nextTheme = resolveTheme();
    if (nextTheme === activeTheme) {
      syncPlayback(video);
      return;
    }

    if (Number.isFinite(video.currentTime) && video.currentTime > 0) {
      resumeTime = video.currentTime;
    }

    activeTheme = nextTheme;
    video.dataset.backgroundTheme = nextTheme;
    video.classList.remove('is-ready');
    video.pause();
    video.poster = video.dataset[`${nextTheme}Poster`] || '';
    video.src = video.dataset[`${nextTheme}Src`] || '';
    video.load();
  }

  function handleVideoMetadata(event) {
    const video = event.currentTarget;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || resumeTime <= 0) {
      return;
    }
    video.currentTime = resumeTime % video.duration;
  }

  function handleVideoReady(event) {
    const video = event.currentTarget;
    video.classList.add('is-ready');
    syncPlayback(video);
    requestLiquidRefresh(0);
  }

  function bindBackgroundVideo() {
    const video = document.getElementById(VIDEO_ID);
    if (!video) {
      return;
    }
    video.addEventListener('loadedmetadata', handleVideoMetadata);
    video.addEventListener('loadeddata', handleVideoReady);
    video.addEventListener('error', () => video.classList.remove('is-ready'));
    syncVideoTheme();
  }

  function placeRendererCanvas() {
    const host = document.querySelector(CANVAS_HOST_SELECTOR);
    const renderer = window.__liquidGLRenderer__;
    if (!host || !renderer || !renderer.canvas) {
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        window.requestAnimationFrame(placeRendererCanvas);
      }
      return;
    }

    const canvas = renderer.canvas;
    if (canvas.parentElement !== host) {
      host.prepend(canvas);
    }
    canvas.style.zIndex = '1';
    canvas.style.pointerEvents = 'none';
  }

  decorateLiquidCards();

  if (document.readyState === 'loading') {
    bindBackgroundVideo();
    document.addEventListener('DOMContentLoaded', placeRendererCanvas, { once: true });
  } else {
    bindBackgroundVideo();
    placeRendererCanvas();
  }
  window.addEventListener('liquidgl:snapshot-ready', placeRendererCanvas);

  const themeObserver = new MutationObserver(syncVideoTheme);
  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  const handleMotionPreference = () => {
    const video = document.getElementById(VIDEO_ID);
    if (video) {
      syncPlayback(video);
    }
  };
  if (typeof reducedMotion.addEventListener === 'function') {
    reducedMotion.addEventListener('change', handleMotionPreference);
  } else if (typeof reducedMotion.addListener === 'function') {
    reducedMotion.addListener(handleMotionPreference);
  }
  document.addEventListener('visibilitychange', handleMotionPreference);
})();
