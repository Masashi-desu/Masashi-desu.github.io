export function createSegmentView(options = {}) {
  let activeId = '';
  let disconnect = () => {};
  const track = options.track || null;
  const activeClass = options.activeClass || 'is-active';
  const ariaAttribute = options.ariaAttribute || 'aria-current';
  const xProperty = options.xProperty || '--segment-x';
  const widthProperty = options.widthProperty || '--segment-width';

  function getControls() {
    const controls = typeof options.getControls === 'function'
      ? options.getControls()
      : options.controls;
    return Array.isArray(controls) ? controls.filter(Boolean) : Array.from(controls || []).filter(Boolean);
  }

  function getTargetId(control) {
    return typeof options.getTargetId === 'function' ? options.getTargetId(control) : control.id;
  }

  function render(targetId = activeId) {
    activeId = targetId;
    let activeControl = null;
    getControls().forEach((control) => {
      const active = getTargetId(control) === targetId;
      if (control.classList) {
        control.classList.toggle(activeClass, active);
      }
      if (typeof control.setAttribute === 'function') {
        control.setAttribute(ariaAttribute, active ? 'true' : 'false');
      }
      if (active) {
        activeControl = control;
      }
    });
    if (activeControl && typeof options.revealControl === 'function') {
      options.revealControl(activeControl, { targetId });
    }
    updateIndicator(activeControl);
    return activeControl;
  }

  function connect(controller) {
    disconnect();
    render(controller.getState().activeId);
    const unsubscribe = controller.subscribe((event) => {
      if (event.type === 'activechange') render(event.state.activeId);
      if (event.type === 'destroy') disconnect();
    });
    const win = options.window || track?.ownerDocument?.defaultView;
    const update = () => updateIndicator();
    win?.addEventListener?.('resize', update);
    track?.addEventListener?.('scroll', update, { capture: true, passive: true });
    const release = () => {
      unsubscribe();
      win?.removeEventListener?.('resize', update);
      track?.removeEventListener?.('scroll', update, true);
    };
    disconnect = release;
    return release;
  }

  function updateIndicator(control) {
    const activeControl = control || getControls().find((candidate) => getTargetId(candidate) === activeId);
    if (!track || !activeControl || !track.style) {
      return;
    }
    const measurement = typeof options.measureIndicator === 'function'
      ? options.measureIndicator(activeControl, track)
      : measureRelativeRect(activeControl, track);
    if (!measurement || !Number.isFinite(measurement.x) || !Number.isFinite(measurement.width)) {
      return;
    }
    track.style.setProperty(xProperty, `${measurement.x}px`);
    track.style.setProperty(widthProperty, `${measurement.width}px`);
  }

  return Object.freeze({
    connect,
    destroy: () => disconnect(),
    render,
    updateIndicator
  });
}

function measureRelativeRect(control, track) {
  if (typeof control.getBoundingClientRect !== 'function' || typeof track.getBoundingClientRect !== 'function') {
    return null;
  }
  const controlRect = control.getBoundingClientRect();
  const trackRect = track.getBoundingClientRect();
  // Absolute-positioned indicators are positioned from the track's padding
  // box, while the measured control offset is relative to its border box.
  // Remove the inline border so the indicator shares the control's edges.
  const trackBorderLeft = Number.isFinite(track.clientLeft) ? track.clientLeft : 0;
  return {
    x: controlRect.left - trackRect.left - trackBorderLeft,
    width: controlRect.width
  };
}
