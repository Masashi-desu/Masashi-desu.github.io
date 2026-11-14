(function () {
  const root = document.documentElement;
  const page = document.scrollingElement;
  const edge = 4;
  const corner = 11;
  const minimumThumb = 28;
  let frame = 0;

  function mount(target, isPage) {
    const layer = document.createElement('div');
    layer.className = isPage ? 'overlay-scrollbars overlay-scrollbars--page' : 'overlay-scrollbars';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-transition-ignore', '');
    layer.setAttribute('data-liquid-ignore', '');
    if (isPage) document.body.append(layer);
    else target.after(layer);

    function makeAxis(horizontal) {
      const thumb = document.createElement('div');
      thumb.className = horizontal ? 'overlay-scrollbar overlay-scrollbar--x' : 'overlay-scrollbar overlay-scrollbar--y';
      thumb.hidden = true;
      layer.append(thumb);

      let drag = null;
      let travel = 0;
      let range = 0;
      const readPointer = (event) => horizontal ? event.clientX : event.clientY;
      const readOffset = () => horizontal ? target.scrollLeft : target.scrollTop;

      thumb.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0 || travel <= 0 || target.hasAttribute('data-overlay-scroll-dragging')) return;
        const rect = layer.getBoundingClientRect();
        const extent = horizontal ? layer.clientWidth : layer.clientHeight;
        const scale = (horizontal ? rect.width : rect.height) / extent;
        if (scale <= 0) return;

        event.preventDefault();
        thumb.setPointerCapture(event.pointerId);
        drag = { id: event.pointerId, start: readPointer(event), offset: readOffset(), scale };
        target.setAttribute('data-overlay-scroll-dragging', '');
        thumb.classList.add('is-dragging');
      });

      thumb.addEventListener('pointermove', (event) => {
        if (drag?.id !== event.pointerId || travel <= 0) return;
        const delta = (readPointer(event) - drag.start) / drag.scale;
        const offset = drag.offset + delta * range / travel;
        target.scrollTo(horizontal
          ? { left: offset, behavior: 'instant' }
          : { top: offset, behavior: 'instant' });
      });

      thumb.addEventListener('lostpointercapture', () => {
        drag = null;
        target.removeAttribute('data-overlay-scroll-dragging');
        thumb.classList.remove('is-dragging');
      });

      // The site's section controller listens for touch gestures on window.
      for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
        thumb.addEventListener(type, (event) => event.stopPropagation(), { passive: true });
      }

      return function renderAxis(nextRange, viewportSize, layerSize, otherAxis, positionOffset) {
        range = nextRange;
        if (range <= 0) {
          thumb.hidden = true;
          travel = 0;
          return;
        }
        const track = Math.max(0, layerSize - edge * 2 - (otherAxis ? corner : 0));
        const size = Math.min(track, Math.max(minimumThumb, track * viewportSize / (viewportSize + range)));
        travel = track - size;
        thumb.hidden = travel <= 0;
        if (thumb.hidden) return;

        const position = edge + Math.min(1, Math.max(0, positionOffset / range)) * travel;
        if (horizontal) {
          thumb.style.width = `${size}px`;
          thumb.style.transform = `translateX(${position}px)`;
        } else {
          thumb.style.height = `${size}px`;
          thumb.style.transform = `translateY(${position}px)`;
        }
      };
    }

    const renderX = makeAxis(true);
    const renderY = makeAxis(false);
    return function measure() {
      const style = getComputedStyle(target);
      // When html leaves overflow visible, the body's overflow governs the viewport.
      const overflow = isPage && style.overflowX === 'visible' && style.overflowY === 'visible'
        ? getComputedStyle(document.body)
        : style;
      const width = target.clientWidth;
      const height = target.clientHeight;
      const visible = width > 0 && height > 0 && style.visibility === 'visible' && !target.closest('[inert]');
      if (!isPage && !visible) {
        return () => { layer.hidden = true; };
      }
      const maxX = visible && !['hidden', 'clip'].includes(overflow.overflowX) ? target.scrollWidth - width : 0;
      const maxY = visible && !['hidden', 'clip'].includes(overflow.overflowY) ? target.scrollHeight - height : 0;
      const layerWidth = isPage ? layer.clientWidth : width;
      const layerHeight = isPage ? layer.clientHeight : height;
      const left = isPage ? 0 : target.offsetLeft + target.clientLeft;
      const top = isPage ? 0 : target.offsetTop + target.clientTop;
      const x = target.scrollLeft + (style.direction === 'rtl' ? maxX : 0);
      const y = target.scrollTop;

      return () => {
        if (!isPage) {
          layer.hidden = false;
          layer.style.left = `${left}px`;
          layer.style.top = `${top}px`;
          layer.style.width = `${width}px`;
          layer.style.height = `${height}px`;
        }
        renderX(maxX, width, layerWidth, maxY > 0, x);
        renderY(maxY, height, layerHeight, maxX > 0, y);
      };
    };
  }

  function start() {
    // Each nested target and its overlay share a positioned parent.
    const elements = [...document.querySelectorAll('[data-overlay-scroll]')];
    const measurements = [mount(page, true), ...elements.map((element) => mount(element, false))];
    root.classList.add('has-overlay-scrollbars');
    function update() {
      frame = 0;
      // Read all scroll geometry before moving any of the overlays.
      measurements.map((measure) => measure()).forEach((render) => render());
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(root);
    resizeObserver.observe(document.body);
    const mutations = new MutationObserver(schedule);
    const layoutAttributes = { attributes: true, attributeFilter: ['class', 'hidden', 'inert', 'style'] };
    mutations.observe(root, layoutAttributes);
    mutations.observe(document.body, layoutAttributes);
    for (const element of elements) {
      resizeObserver.observe(element);
      resizeObserver.observe(element.parentElement);
      mutations.observe(element, { ...layoutAttributes, childList: true });
      mutations.observe(element.parentElement, layoutAttributes);
    }

    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    document.addEventListener('input', schedule);
    window.addEventListener('load', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    document.fonts?.ready.then(schedule);
    update();
  }

  if (page && 'ResizeObserver' in window && 'PointerEvent' in window) start();
})();
