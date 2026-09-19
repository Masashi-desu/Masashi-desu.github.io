import { DEFAULT_TIMINGS, DEFAULT_OBSERVER_THRESHOLDS } from './defaults.js';
import { createStopIndex, getRole } from './stop-index.js';
import { createWindowScrollAdapter } from './window-scroll-adapter.js';

const mountedWindows = new WeakMap();

export function createScrollController(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const doc = options.document || (win ? win.document : null);
  if (!win || !doc) {
    throw new TypeError('createScrollController requires a window and document.');
  }

  const timings = { ...DEFAULT_TIMINGS, ...(options.timings || {}) };
  const reduceMotion = options.reduceMotion || win.matchMedia('(prefers-reduced-motion: reduce)');
  const index = createStopIndex({ initialId: options.initialId });
  const adapter = createWindowScrollAdapter(win, doc);
  const { getViewportHeight, getScrollY, readStopTop } = adapter;
  const subscribers = new Set();
  const eventQueue = [];
  let emitting = false;
  const ownedClasses = new Set();
  const rootElement = options.rootElement || doc.documentElement;
  const eventTarget = options.eventTarget || win;
  const observerThresholds = options.observerThresholds || DEFAULT_OBSERVER_THRESHOLDS;
  const listenerDisposers = [];

  let mounted = false;
  let observer = null;
  let navigationLockUntil = 0;
  let pendingId = '';
  let settledId = '';
  let navigation = null;
  let navigationSequence = 0;
  let navigationLockTimer = null;
  let previousLocks = '';
  let settleTimer = null;
  let alignmentFrame = null;
  let restTimer = null;
  let restSampleScrollY = null;
  let touchPointsActive = 0;
  let lastTouchEventAt = 0;
  let wheelDeltaY = 0;
  let wheelResetTimer = null;
  let lastWheelEventAt = null;
  let wheelHandled = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchHandled = false;
  let touchStartStopId = '';

  function getStops() {
    return typeof options.getStops === 'function' ? options.getStops() : [];
  }

  function activateStop(stopOrId, source = 'programmatic', force = false) {
    const id = typeof stopOrId === 'string' ? stopOrId : (stopOrId && stopOrId.id);
    const previousId = index.getState().activeId;
    const stop = index.activate(id);
    if (!stop) {
      return null;
    }
    if (force || previousId !== stop.id) {
      emit('activechange', { source, stop });
    }
    if (index.getState().activeId === stop.id && (force || previousId !== stop.id) && typeof options.onActiveChange === 'function') {
      options.onActiveChange({
        source,
        stop,
        ...index.getState()
      });
    }
    return stop;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('A subscriber must be a function.');
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  function emit(type, detail = {}) {
    const event = Object.freeze({ ...detail, type, state: Object.freeze(getState()) });
    // Finish delivering the current snapshot before reentrant changes. Otherwise
    // a subscriber's goTo() can make later subscribers render an older state last.
    eventQueue.push({ event, listeners: [...subscribers] });
    if (emitting) return;
    emitting = true;
    try {
      while (eventQueue.length > 0) {
        const next = eventQueue.shift();
        for (const listener of next.listeners) listener(next.event);
      }
    } finally {
      eventQueue.length = 0;
      emitting = false;
    }
  }

  function notifyLocks() {
    const locks = `${isNavigationLocked()}:${wheelHandled}:${touchHandled}`;
    if (locks !== previousLocks) {
      previousLocks = locks;
      emit('lockchange');
    }
  }

  function syncManagedClasses() {
    for (const name of ['segmented-scroll-managed', options.managedClass].filter(Boolean)) {
      if (mounted && index.getStops().length > 0) {
        if (rootElement?.classList && !rootElement.classList.contains(name)) {
          rootElement.classList.add(name);
          ownedClasses.add(name);
        }
      } else if (ownedClasses.delete(name)) {
        rootElement.classList.remove(name);
      }
    }
  }

  function refresh() {
    index.setStops(getStops());
    if (navigation && !index.getById(navigation.id)) cancelNavigation('stop-removed');
    if (!index.getById(settledId)) settledId = '';
    const activeTop = readStopTop(index.getById(index.getState().activeId));
    if (!navigation && activeTop !== null && Math.abs(getScrollY() - activeTop) <= 1) {
      settledId = index.getState().activeId;
    }
    syncManagedClasses();
    setupObserver();
    if (index.getState().activeId) activateStop(index.getState().activeId, 'refresh', true);
    else emit('activechange', { source: 'refresh', stop: null });
    return getState();
  }

  function setupObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (!mounted || !('IntersectionObserver' in win)) {
      return;
    }
    const observedStops = index.getStops().filter((stop) => stop.element && stop.observe !== false && getRole(stop) === 'content');
    if (observedStops.length === 0) {
      return;
    }
    observer = new win.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (options.visibleClass && entry.target.classList) {
          entry.target.classList.toggle(options.visibleClass, entry.isIntersecting);
        }
        if (typeof options.onVisibilityChange === 'function') {
          const stop = index.getStops().find((candidate) => candidate.element === entry.target) || null;
          options.onVisibilityChange({ entry, stop, visible: entry.isIntersecting });
        }
      });
      if (navigation || isNavigationLocked()) {
        return;
      }
      const positionStop = findStopAtCurrentPosition(true);
      if (positionStop) {
        activateStop(positionStop, 'position');
        return;
      }
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) {
        return;
      }
      const stop = index.getStops().find((candidate) => candidate.element === visible.target);
      if (stop) {
        activateStop(stop, 'observer');
      }
    }, { threshold: observerThresholds });
    observedStops.forEach((stop) => observer.observe(stop.element));
  }

  function mount() {
    if (mounted) {
      return getState();
    }
    if (mountedWindows.has(win)) throw new Error('Only one scroll controller may be mounted per window.');
    mountedWindows.set(win, api);
    mounted = true;
    try {
      refresh();
    } catch (error) {
      destroy();
      throw error;
    }
    if (!mounted) return getState();
    listen(eventTarget, 'wheel', handleWheel, { passive: false });
    listen(eventTarget, 'scroll', handleScroll, { passive: true });
    listen(eventTarget, 'touchstart', handleTouchStart, { passive: true });
    listen(eventTarget, 'touchmove', handleTouchMove, { passive: false });
    listen(eventTarget, 'touchend', handleTouchEnd, { passive: true });
    listen(eventTarget, 'touchcancel', handleTouchEnd, { passive: true });
    return getState();
  }

  function destroy() {
    mounted = false;
    navigationSequence += 1;
    if (mountedWindows.get(win) === api) mountedWindows.delete(win);
    cancelNavigation('destroyed');
    listenerDisposers.splice(0).forEach((dispose) => dispose());
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearSettleTimer();
    resetWheelGesture();
    cancelScrollAlignment();
    if (restTimer !== null) {
      win.clearTimeout(restTimer);
      restTimer = null;
    }
    syncManagedClasses();
    if (navigationLockTimer !== null) win.clearTimeout(navigationLockTimer);
    navigationLockTimer = null;
    navigationLockUntil = 0;
    pendingId = '';
    restSampleScrollY = null;
    touchPointsActive = 0;
    lastTouchEventAt = 0;
    touchHandled = false;
    touchStartStopId = '';
    settledId = '';
    notifyLocks();
    emit('destroy');
    subscribers.clear();
  }

  function listen(target, type, handler, listenerOptions) {
    if (!target || typeof target.addEventListener !== 'function') {
      return;
    }
    target.addEventListener(type, handler, listenerOptions);
    listenerDisposers.push(() => target.removeEventListener(type, handler, listenerOptions));
  }

  function prefersReducedMotion() {
    return Boolean(reduceMotion && reduceMotion.matches);
  }

  function isNavigationLocked() {
    return Date.now() < navigationLockUntil;
  }

  function lockFor(duration) {
    navigationLockUntil = Date.now() + duration;
    if (navigationLockTimer !== null) win.clearTimeout(navigationLockTimer);
    navigationLockTimer = win.setTimeout(() => {
      navigationLockTimer = null;
      notifyLocks();
    }, duration);
    notifyLocks();
  }

  function clearWheelAccumulation() {
    wheelDeltaY = 0;
  }

  function resetWheelGesture() {
    clearWheelAccumulation();
    wheelHandled = false;
    lastWheelEventAt = null;
    notifyLocks();
    if (wheelResetTimer !== null) {
      win.clearTimeout(wheelResetTimer);
      wheelResetTimer = null;
    }
  }

  function clearSettleTimer() {
    if (settleTimer !== null) {
      win.clearTimeout(settleTimer);
      settleTimer = null;
    }
  }

  function cancelScrollAlignment() {
    if (alignmentFrame !== null) {
      win.cancelAnimationFrame(alignmentFrame);
      alignmentFrame = null;
    }
  }

  function cancelNavigation(reason) {
    clearSettleTimer();
    cancelScrollAlignment();
    const cancelled = navigation;
    navigation = null;
    pendingId = '';
    if (navigationLockTimer !== null) win.clearTimeout(navigationLockTimer);
    navigationLockTimer = null;
    navigationLockUntil = 0;
    if (cancelled) {
      emit('navigationcancel', { id: cancelled.id, source: cancelled.source, reason });
      notifyLocks();
    }
  }

  function finishNavigation(current) {
    if (navigation !== current) return;
    const stop = index.getById(current.id);
    settledId = current.id;
    navigation = null;
    pendingId = '';
    emit('navigationend', { id: current.id, source: current.source, stop });
  }

  function enforceScrollAlignment(current) {
    cancelScrollAlignment();
    let framesLeft = Math.max(1, timings.alignmentFrames);
    const step = () => {
      alignmentFrame = null;
      if (!mounted || navigation !== current) return;
      const targetTop = readStopTop(index.getById(current.id));
      if (targetTop === null) {
        cancelNavigation('stop-unavailable');
        return;
      }
      if (Math.abs(getScrollY() - targetTop) > 1) adapter.scrollTo(targetTop);
      framesLeft -= 1;
      if (framesLeft > 0) {
        alignmentFrame = win.requestAnimationFrame(step);
      } else if (Math.abs(getScrollY() - targetTop) <= 1) {
        finishNavigation(current);
      } else {
        cancelNavigation('alignment-failed');
      }
    };
    step();
  }

  function settle(current, delay = timings.settleMs) {
    clearSettleTimer();
    settleTimer = win.setTimeout(() => {
      settleTimer = null;
      if (navigation === current) enforceScrollAlignment(current);
    }, prefersReducedMotion() ? 80 : delay);
  }

  function goTo(stopOrId, navigationOptions = {}) {
    const stop = index.getById(typeof stopOrId === 'string' ? stopOrId : stopOrId?.id);
    const top = readStopTop(stop);
    if (!mounted || !stop || top === null) return false;
    const sequence = ++navigationSequence;
    cancelNavigation('superseded');
    // A subscriber may synchronously start another navigation or destroy us.
    if (!mounted || sequence !== navigationSequence) return false;
    const current = { id: stop.id, source: navigationOptions.source || 'programmatic', sequence };
    navigation = current;
    pendingId = stop.id;
    lockFor(prefersReducedMotion() ? 160 : Math.max(timings.navigationLockMs, timings.settleMs + 140));
    if (navigation !== current) return false;
    activateStop(stop, current.source);
    if (navigation !== current) return false;
    emit('navigationstart', { id: stop.id, source: current.source, stop });
    if (navigation !== current) return false;
    if (typeof options.onNavigate === 'function') {
      options.onNavigate({ stop, options: navigationOptions, state: getState() });
    }
    if (navigation !== current) return false;
    const behavior = navigationOptions.behavior || (prefersReducedMotion() ? 'auto' : 'smooth');
    if (typeof stop.scroll === 'function') {
      stop.scroll({ behavior, top, window: win, document: doc, stop });
    } else {
      adapter.scrollTo(top, behavior);
    }
    if (navigation === current) settle(current, navigationOptions.settleMs ?? timings.settleMs);
    return true;
  }

  function move(direction, navigationOptions = {}) {
    const preferredId = navigationOptions.fromId || index.getState().activeId;
    const target = index.findDirectional(direction, getScrollY(), preferredId, readStopTop);
    return target ? goTo(target.id, navigationOptions) : false;
  }

  function getDirectionalStop(direction, event, preferredId = '') {
    // Treat small position errors as being at a stop, so input does not select
    // the current section again. Cap the distance: auxiliary/custom visibility
    // tolerances can span hundreds of pixels and must not skip unvisited stops.
    const anchorId = preferredId || getEventStopId(event)
      || findStopAtCurrentPosition(false, getPositionTolerance())?.id || '';
    return index.findDirectional(direction, getScrollY(), anchorId, readStopTop);
  }

  function navigateDirection(direction, event, preferredId = '') {
    const target = getDirectionalStop(direction, event, preferredId);
    if (!target) {
      clearWheelAccumulation();
      return false;
    }
    if (event && event.cancelable) {
      event.preventDefault();
    }
    if (isNavigationLocked()) {
      return true;
    }
    clearWheelAccumulation();
    return goTo(target.id, { source: event ? event.type : 'direction', updateHistory: false });
  }

  function normalizeWheelDelta(event) {
    if (event.deltaMode === 1) {
      return event.deltaY * 16;
    }
    if (event.deltaMode === 2) {
      return event.deltaY * getViewportHeight();
    }
    return event.deltaY;
  }

  function handleWheel(event) {
    if (event.ctrlKey || (win.visualViewport && win.visualViewport.scale > timings.zoomThreshold)) {
      return;
    }
    const gesture = {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      horizontalDominant: Math.abs(event.deltaX) > Math.abs(event.deltaY),
      shiftKey: event.shiftKey
    };
    if (typeof options.shouldYieldWheel === 'function' && options.shouldYieldWheel(event, gesture)) {
      return;
    }
    const deltaY = normalizeWheelDelta(event);
    if (!Number.isFinite(deltaY) || index.getStops().length === 0) {
      return;
    }
    if (deltaY === 0 && event.deltaX !== 0) {
      return;
    }

    // iPad WebKit decides cancelability from the first non-zero wheel event.
    // Cancel even subpixel input and outward input at the first/last stop;
    // returning before this lets native scrolling own the entire gesture.
    const now = Date.now();
    // A busy renderer can deliver this input before an overdue reset timer.
    // The quiet interval, not timer task ordering, defines a new gesture.
    if (lastWheelEventAt !== null && now - lastWheelEventAt >= timings.wheelResetMs) {
      resetWheelGesture();
      if (!mounted) return;
    }
    lastWheelEventAt = now;
    if (wheelResetTimer !== null) {
      win.clearTimeout(wheelResetTimer);
    }
    wheelResetTimer = win.setTimeout(resetWheelGesture, timings.wheelResetMs);
    if (!event.cancelable) {
      // A gesture already owned by the browser cannot be taken over halfway.
      // Let the existing rest alignment recover after native scrolling ends.
      wheelHandled = true;
      notifyLocks();
      clearWheelAccumulation();
      return;
    }
    event.preventDefault();
    if (isNavigationLocked()) {
      wheelHandled = true;
      notifyLocks();
    }
    // Navigation animation time and wheel gesture lifetime are independent.
    // Keep consuming inertia until there has been a full quiet interval.
    if (wheelHandled || deltaY === 0) {
      return;
    }
    const direction = deltaY > 0 ? 1 : -1;
    if (!getDirectionalStop(direction, event)) {
      clearWheelAccumulation();
      return;
    }
    if (wheelDeltaY !== 0 && Math.sign(wheelDeltaY) !== direction) {
      wheelDeltaY = 0;
    }
    wheelDeltaY += deltaY;
    if (Math.abs(wheelDeltaY) >= timings.wheelThreshold) {
      wheelHandled = true;
      navigateDirection(direction, event);
      notifyLocks();
    }
  }

  function markTouchActivity(event) {
    lastTouchEventAt = Date.now();
    touchPointsActive = event && event.touches ? event.touches.length : 0;
  }

  function handleTouchStart(event) {
    markTouchActivity(event);
    scheduleRestAlignmentCheck(timings.touchActivityStaleMs + 320);
    if (!event.touches || event.touches.length !== 1) {
      touchStartStopId = '';
      return;
    }
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchHandled = false;
    notifyLocks();
    touchStartStopId = getEventStopId(event);
  }

  function handleTouchMove(event) {
    markTouchActivity(event);
    if (!event.touches || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    const deltaX = touchStartX - touch.clientX;
    const deltaY = touchStartY - touch.clientY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    const gesture = {
      deltaX,
      deltaY,
      absDeltaX,
      absDeltaY,
      horizontalDominant: absDeltaX > absDeltaY,
      verticalIntent: absDeltaY >= timings.touchIntentThreshold && absDeltaY >= absDeltaX * timings.verticalIntentRatio
    };
    if (typeof options.shouldYieldTouch === 'function' && options.shouldYieldTouch(event, gesture)) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    if (!gesture.verticalIntent) {
      return;
    }
    const direction = deltaY > 0 ? 1 : -1;
    if (!getDirectionalStop(direction, event, touchStartStopId)) {
      return;
    }
    if (touchHandled || absDeltaY < timings.touchThreshold) {
      return;
    }
    touchHandled = true;
    navigateDirection(direction, event, touchStartStopId);
    notifyLocks();
  }

  function handleTouchEnd(event) {
    markTouchActivity(event);
    if (touchHandled && navigation) {
      lockFor(prefersReducedMotion() ? 160 : timings.touchMomentumSettleMs + 140);
      cancelScrollAlignment();
      settle(navigation, timings.touchMomentumSettleMs);
    }
    touchHandled = false;
    touchStartStopId = '';
    notifyLocks();
    if (touchPointsActive === 0) {
      scheduleRestAlignmentCheck(timings.touchMomentumSettleMs + 200);
    }
  }

  function getEventStopId(event) {
    if (!event) {
      return '';
    }
    const stop = index.getStops().find((candidate) => {
      const region = candidate.eventRegion || null;
      return region && eventIncludesElement(event, region);
    });
    return stop ? stop.id : '';
  }

  function handleScroll() {
    if (!navigation && !isNavigationLocked()) {
      const stop = findStopAtCurrentPosition(false);
      if (stop) {
        if (Math.abs(getScrollY() - readStopTop(stop)) <= 1) settledId = stop.id;
        activateStop(stop, 'position');
      }
    }
    if (shouldMonitorRestAlignment()) {
      scheduleRestAlignmentCheck(260);
    }
  }

  function findStopAtCurrentPosition(auxiliaryOnly, maxDistance = Infinity) {
    const current = getScrollY();
    let match = null;
    let matchDistance = Infinity;
    index.getOrderedStops(readStopTop).forEach((stop) => {
      if (auxiliaryOnly && getRole(stop) === 'content') {
        return;
      }
      const distance = Math.abs(stop.top - current);
      const tolerance = Math.min(getActivationTolerance(stop), maxDistance);
      if (distance <= tolerance && distance < matchDistance) {
        match = stop;
        matchDistance = distance;
      }
    });
    return match;
  }

  function getActivationTolerance(stop) {
    if (typeof stop.activationTolerance === 'function') {
      return Number(stop.activationTolerance({ stop, viewportHeight: getViewportHeight() })) || 0;
    }
    if (Number.isFinite(stop.activationTolerance)) {
      return stop.activationTolerance;
    }
    if (getRole(stop) !== 'content' && stop.element) {
      return Math.max(12, stop.element.offsetHeight * 0.4);
    }
    return getPositionTolerance();
  }

  function getPositionTolerance() {
    return Math.max(4, Math.round(getViewportHeight() * 0.02));
  }

  function shouldMonitorRestAlignment() {
    if (typeof options.monitorRestAlignment === 'boolean') {
      return options.monitorRestAlignment;
    }
    return 'ontouchstart' in win || win.matchMedia('(any-pointer: coarse)').matches;
  }

  function scheduleRestAlignmentCheck(delay) {
    if (!shouldMonitorRestAlignment()) {
      return;
    }
    if (restTimer !== null) {
      win.clearTimeout(restTimer);
    }
    restTimer = win.setTimeout(runRestAlignmentCheck, delay);
  }

  function runRestAlignmentCheck() {
    restTimer = null;
    const touchRecentlyActive = touchPointsActive > 0 && (Date.now() - lastTouchEventAt) < timings.touchActivityStaleMs;
    if (touchRecentlyActive || isNavigationLocked() || pendingId || alignmentFrame !== null) {
      restSampleScrollY = null;
      scheduleRestAlignmentCheck(320);
      return;
    }
    touchPointsActive = 0;
    if ((win.visualViewport && win.visualViewport.scale > timings.zoomThreshold) || index.getStops().length === 0) {
      return;
    }
    const current = getScrollY();
    if (restSampleScrollY === null || Math.abs(restSampleScrollY - current) > 2) {
      restSampleScrollY = current;
      scheduleRestAlignmentCheck(220);
      return;
    }
    restSampleScrollY = null;
    const nearest = index.findNearest(current, readStopTop);
    if (!nearest) {
      return;
    }
    const tolerance = getPositionTolerance();
    if (nearest.distance > tolerance) {
      goTo(nearest.stop.id, { source: 'rest', behavior: 'auto', settleMs: 0, updateHistory: false });
    } else {
      if (nearest.distance <= 1) settledId = nearest.stop.id;
      activateStop(nearest.stop, 'rest');
    }
  }

  function getState() {
    return {
      ...index.getState(),
      pendingId,
      targetId: navigation?.id || '',
      settledId,
      moving: navigation !== null,
      navigationLocked: isNavigationLocked(),
      wheelLocked: wheelHandled,
      touchLocked: touchHandled,
      locked: isNavigationLocked() || wheelHandled || touchHandled,
      mounted,
      aligning: alignmentFrame !== null
    };
  }

  const api = Object.freeze({
    subscribe,
    getStop: index.getById,
    getStops: index.getStops,
    mount,
    refresh,
    destroy,
    goTo,
    move,
    setActive: activateStop,
    readStopTop,
    getState
  });
  return api;
}

function eventIncludesElement(event, element) {
  if (!event || !element) {
    return false;
  }
  if (typeof event.composedPath === 'function') {
    return event.composedPath().includes(element);
  }
  const EventNode = element.ownerDocument && element.ownerDocument.defaultView
    ? element.ownerDocument.defaultView.Node
    : (typeof Node !== 'undefined' ? Node : null);
  return Boolean(EventNode && event.target instanceof EventNode && element.contains(event.target));
}
