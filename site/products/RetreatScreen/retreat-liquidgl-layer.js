(function () {
  const TARGET_ID = 'retreat-screen-glass';
  const MAX_ATTEMPTS = 120;
  let attempts = 0;

  function placeRendererCanvas() {
    const target = document.getElementById(TARGET_ID);
    const renderer = window.__liquidGLRenderer__;
    if (!target || !renderer || !renderer.canvas) {
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        window.requestAnimationFrame(placeRendererCanvas);
      }
      return;
    }

    const canvas = renderer.canvas;
    if (canvas.parentElement !== target) {
      target.appendChild(canvas);
    }
    canvas.style.zIndex = '0';
    canvas.style.pointerEvents = 'none';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', placeRendererCanvas, { once: true });
  } else {
    placeRendererCanvas();
  }
  window.addEventListener('liquidgl:snapshot-ready', placeRendererCanvas);
})();
