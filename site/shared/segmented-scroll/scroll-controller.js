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
  const ownedHorizontalRegions = new Set();
  const rootElement = options.rootElement || doc.documentElement;
  const eventTarget = options.eventTarget || win;
  const supportsScrollEnd = 'onscrollend' in doc;
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
  let previousScrollY = 0;
  let nativeRange = null;
  let nativeRangeTimer = null;
  let touchPointsActive = 0;
  let lastTouchEventAt = 0;
  let wheelDelta = 0;
  let wheelAxis = '';
  let wheelResetTimer = null;
  let lastWheelEventAt = null;
  let wheelHandled = false;
  let wheelRangeId = '';
  let touchStartX = 0;
  let touchStartY = 0;
  let touchHandled = false;
  let touchStartStopId = '';
  let touchHorizontalScroll = null;
  let touchAxis = '';
  let touchRange = null;
  let touchRangeNative = false;

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
    const managed = mounted && index.getStops().length > 0;
    for (const name of ['segmented-scroll-managed', options.managedClass].filter(Boolean)) {
      syncRootClass(name, managed);
    }
    syncNativeRangeClass(managed ? findScrollRange(4) : null);
  }

  function syncRootClass(name, enabled) {
    if (enabled) {
      if (rootElement?.classList && !rootElement.classList.contains(name)) {
        rootElement.classList.add(name);
        ownedClasses.add(name);
      }
    } else if (ownedClasses.delete(name)) {
      rootElement.classList.remove(name);
    }
  }

  function refresh() {
    index.setStops(getStops());
    if (nativeRange && !index.getById(nativeRange.id)?.scrollWithin) clearNativeRange();
    if (touchRange && !index.getById(touchRange.stop.id)?.scrollWithin) {
      touchRange = null;
      touchRangeNative = false;
    }
    if (mounted) syncHorizontalRegions();
    if (navigation && !index.getById(navigation.id)) cancelNavigation('stop-removed');
    if (!index.getById(settledId)) settledId = '';
    const active = index.getById(index.getState().activeId);
    if (!navigation && isAtStopEdge(active)) {
      settledId = index.getState().activeId;
    }
    syncManagedClasses();
    setupObserver();
    if (index.getState().activeId) activateStop(index.getState().activeId, 'refresh', true);
    else emit('activechange', { source: 'refresh', stop: null });
    return getState();
  }

  function syncHorizontalRegions() {
    const className = 'segmented-scroll-horizontal';
    const regions = new Set(mounted ? index.getStops().map((stop) => stop.horizontalScroll?.element).filter(Boolean) : []);
    for (const element of ownedHorizontalRegions) {
      if (regions.has(element)) continue;
      element.classList.remove(className);
      ownedHorizontalRegions.delete(element);
    }
    for (const element of regions) {
      if (!element.classList || element.classList.contains(className)) continue;
      element.classList.add(className);
      ownedHorizontalRegions.add(element);
    }
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
      if (navigation || isNavigationLocked() || nativeRange) {
        return;
      }
      const positionStop = findScrollRange()?.stop || findStopAtCurrentPosition(true);
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
    previousScrollY = getScrollY();
    listen(eventTarget, 'wheel', handleWheel, { passive: false });
    listen(eventTarget, 'scroll', handleScroll, { passive: true });
    listen(doc, 'scrollend', handleNativeScrollEnd, { passive: true });
    listen(win.visualViewport || win, 'resize', () => syncNativeRangeClass(), { passive: true });
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
    clearNativeRange();
    cancelScrollAlignment();
    if (restTimer !== null) {
      win.clearTimeout(restTimer);
      restTimer = null;
    }
    syncManagedClasses();
    syncHorizontalRegions();
    if (navigationLockTimer !== null) win.clearTimeout(navigationLockTimer);
    navigationLockTimer = null;
    navigationLockUntil = 0;
    pendingId = '';
    restSampleScrollY = null;
    touchPointsActive = 0;
    lastTouchEventAt = 0;
    touchHandled = false;
    touchStartStopId = '';
    touchHorizontalScroll = null;
    touchAxis = '';
    touchRange = null;
    touchRangeNative = false;
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
    wheelDelta = 0;
  }

  function resetWheelGesture() {
    clearWheelAccumulation();
    wheelHandled = false;
    wheelAxis = '';
    wheelRangeId = '';
    lastWheelEventAt = null;
    notifyLocks();
    if (wheelResetTimer !== null) {
      win.clearTimeout(wheelResetTimer);
      wheelResetTimer = null;
    }
    if (mounted && nativeRange?.scrollEnded) finishNativeRange(true);
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
      const targetTop = current.readTop(index.getById(current.id));
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
    const { edge } = navigationOptions;
    const readTop = (candidate) => readNavigationTop(candidate, edge);
    const top = readTop(stop);
    if (!mounted || !stop || top === null) return false;
    clearNativeRange();
    const sequence = ++navigationSequence;
    cancelNavigation('superseded');
    // A subscriber may synchronously start another navigation or destroy us.
    if (!mounted || sequence !== navigationSequence) return false;
    const current = { id: stop.id, source: navigationOptions.source || 'programmatic', sequence, readTop };
    navigation = current;
    pendingId = stop.id;
    if (wheelRangeId) {
      wheelRangeId = '';
      wheelHandled = true;
    }
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
    return target ? goToDirectionalStop(target, direction, navigationOptions) : false;
  }

  function readRangeEnd(stop, start) {
    if (!stop?.scrollWithin || start === null) return start;
    return Math.max(start, readStopTop({ ...stop, align: 'end', getTop: undefined }) ?? start);
  }

  function readNavigationTop(stop, edge) {
    const start = readStopTop(stop);
    if (edge !== 'end' && edge !== 'reverse-entry') return start;
    const end = readRangeEnd(stop, start);
    if (edge === 'end' || start === null || !stop?.scrollWithin || typeof stop.getReverseEntryTop !== 'function') return end;
    const entry = readStopTop(stop, stop.getReverseEntryTop);
    return entry === null ? end : Math.min(end, Math.max(start, entry));
  }

  function goToDirectionalStop(stop, direction, options) {
    return goTo(stop.id, { ...options, edge: options.edge ?? (direction < 0 ? 'reverse-entry' : 'start') });
  }

  function isAtStopEdge(stop) {
    const start = readStopTop(stop);
    if (start === null) return false;
    const y = getScrollY();
    return Math.abs(y - start) <= 1 || Math.abs(y - readRangeEnd(stop, start)) <= 1;
  }

  function findScrollRange(tolerance = 1, y = getScrollY()) {
    for (const stop of index.getStops()) {
      if (!stop.scrollWithin) continue;
      const start = readStopTop(stop);
      if (start === null) continue;
      const end = readRangeEnd(stop, start);
      if (end > start && y >= start - tolerance && y <= end + tolerance) return { stop, start, end };
    }
    return null;
  }

  function syncNativeRangeClass(range = findScrollRange(4)) {
    syncRootClass('segmented-scroll-native-range', Boolean(range));
  }

  function canScrollIntoRange(range, y, delta) {
    if (!range) return false;
    // Landing and layout can differ by a few pixels at the same stop.
    const edgeTolerance = Math.min(4, (range.end - range.start) / 2);
    return delta > 0 ? y < range.end - edgeTolerance : delta < 0 && y > range.start + edgeTolerance;
  }

  function yieldToNativeRange(id) {
    nativeRange ??= { id, moved: false, scrollEnded: false, forwardExit: false, outward: 0 };
    scheduleNativeRangeEnd();
  }

  function clearNativeRange() {
    if (nativeRangeTimer !== null) win.clearTimeout(nativeRangeTimer);
    nativeRangeTimer = null;
    nativeRange = null;
  }

  function scheduleNativeRangeEnd() {
    if (nativeRangeTimer !== null) win.clearTimeout(nativeRangeTimer);
    nativeRangeTimer = null;
    if (supportsScrollEnd && nativeRange?.moved) return;
    // Older browsers lack scrollend. Wait for a quiet period after the last
    // input or scroll update before reconciling a range boundary.
    nativeRangeTimer = win.setTimeout(finishNativeRange, 260);
  }

  function handleNativeScrollEnd(event) {
    if (event.target !== doc || !nativeRange?.moved) return;
    // Some browsers end each discrete wheel tick. Preserve ownership until
    // the same quiet interval used to distinguish threshold gestures.
    nativeRange.scrollEnded = true;
    if (!wheelRangeId) finishNativeRange(true);
  }

  function finishNativeRange(ended = false) {
    if (!nativeRange) return;
    if (!ended && touchPointsActive > 0 && Date.now() - lastTouchEventAt < timings.touchActivityStaleMs) {
      scheduleNativeRangeEnd();
      return;
    }
    const { id, forwardExit, outward } = nativeRange;
    const stop = index.getById(id);
    clearNativeRange();
    if (!stop?.scrollWithin || navigation || win.visualViewport?.scale > timings.zoomThreshold) return;
    const start = readStopTop(stop);
    const end = readRangeEnd(stop, start);
    if (start === null || end <= start) return;
    const y = getScrollY();
    const exitTop = readForwardExitTop(stop, start, end);
    if (forwardExit && exitTop !== null && y >= exitTop && move(1, { fromId: stop.id, source: 'range-exit' })) return;
    if (outward && (outward < 0 ? y < start - 1 : y > end + 1) &&
        move(outward, { fromId: stop.id, source: 'touch' })) return;
    if (y < start - 1 || y > end + 1) {
      adapter.scrollTo(y < start ? start : end, 'instant');
    }
  }

  function getDirectionalStop(direction, event, preferredId = '') {
    // Treat small position errors as being at a stop, so input does not select
    // the current section again. Cap the distance: auxiliary/custom visibility
    // tolerances can span hundreds of pixels and must not skip unvisited stops.
    const anchorId = preferredId || getEventStopId(event) || findScrollRange()?.stop.id
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
    return goToDirectionalStop(target, direction, {
      source: event ? event.type : 'direction',
      updateHistory: false
    });
  }

  function normalizeWheelDelta(event, delta, pageSize) {
    if (event.deltaMode === 1) {
      return delta * 16;
    }
    if (event.deltaMode === 2) {
      return delta * pageSize;
    }
    return delta;
  }

  function getHorizontalScroll(event) {
    return index.getStops().find((stop) => eventIncludesElement(event, stop.horizontalScroll?.element))?.horizontalScroll;
  }

  function moveHorizontally(scroll, direction) {
    const { element } = scroll;
    const end = Math.max(0, element.scrollWidth - element.clientWidth);
    const current = Math.min(end, Math.max(0, element.scrollLeft));
    const points = scroll.getSnapPoints().filter(Number.isFinite)
      .map((left) => Math.min(end, Math.max(0, left))).sort((a, b) => a - b);
    const next = direction > 0
      ? points.find((left) => left > current + 1)
      : points.reverse().find((left) => left < current - 1);
    if (next !== undefined) element.scrollTo({ left: next, behavior: prefersReducedMotion() ? 'instant' : 'smooth' });
  }

  function accumulateWheel(delta) {
    if (wheelDelta && Math.sign(wheelDelta) !== Math.sign(delta)) clearWheelAccumulation();
    wheelDelta += delta;
    if (Math.abs(wheelDelta) < timings.wheelThreshold) return false;
    wheelHandled = true;
    return true;
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
    const region = getHorizontalScroll(event);
    const horizontal = gesture.horizontalDominant || gesture.shiftKey;
    const mayScrollHorizontally = region && (wheelAxis === 'x' || horizontal);
    const deltaY = normalizeWheelDelta(event, event.deltaY, getViewportHeight());
    if (!Number.isFinite(deltaY) || index.getStops().length === 0) {
      return;
    }
    if (!mayScrollHorizontally && deltaY === 0 && event.deltaX !== 0) {
      return;
    }
    if (deltaY === 0 && event.deltaX === 0 && findScrollRange(4)) return;

    const now = Date.now();
    // A busy renderer can deliver this input before an overdue reset timer.
    // The quiet interval, not timer task ordering, defines a new gesture.
    if (lastWheelEventAt !== null && now - lastWheelEventAt >= timings.wheelResetMs) {
      resetWheelGesture();
      if (!mounted) return;
    }
    const firstWheelEvent = lastWheelEventAt === null;
    lastWheelEventAt = now;
    if (wheelResetTimer !== null) {
      win.clearTimeout(wheelResetTimer);
    }
    wheelResetTimer = win.setTimeout(resetWheelGesture, timings.wheelResetMs);
    // Keep the configured region's leading axis through diagonal inertia.
    if (!wheelAxis && region && (event.deltaX || event.deltaY)) {
      if (horizontal) clearWheelAccumulation();
      wheelAxis = horizontal ? 'x' : 'y';
    }
    if (wheelAxis === 'x' && region?.mode === 'free' && horizontal) return;
    if (wheelAxis === 'x' && !region && !wheelHandled) return;
    if (wheelRangeId) {
      if (!navigation && index.getById(wheelRangeId)?.scrollWithin) yieldToNativeRange(wheelRangeId);
      return;
    }
    if (firstWheelEvent && deltaY && wheelAxis !== 'x' && !navigation && !isNavigationLocked()) {
      const range = findScrollRange(4);
      if (nativeRange || canScrollIntoRange(range, getScrollY(), deltaY)) {
        wheelRangeId = nativeRange?.id || range.stop.id;
        yieldToNativeRange(wheelRangeId);
        return;
      }
    }
    // WebKit can decide ownership on the first wheel event. Threshold stops
    // still cancel even subpixel input; a native range keeps the whole gesture.
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
    if (wheelHandled) {
      return;
    }
    if (wheelAxis === 'x' && region) {
      if (region.mode === 'free') return;
      const delta = normalizeWheelDelta(event, event.deltaX || (event.shiftKey ? event.deltaY : 0), region.element.clientWidth);
      if (Number.isFinite(delta) && delta && accumulateWheel(delta)) {
        moveHorizontally(region, Math.sign(delta));
        notifyLocks();
      }
      return;
    }
    if (deltaY === 0) return;
    const direction = deltaY > 0 ? 1 : -1;
    if (!getDirectionalStop(direction, event)) {
      clearWheelAccumulation();
      return;
    }
    if (accumulateWheel(deltaY)) {
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
    touchHorizontalScroll = null;
    touchAxis = '';
    touchRange = null;
    touchRangeNative = false;
    if (!event.touches || event.touches.length !== 1) {
      touchStartStopId = '';
      return;
    }
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchHandled = false;
    notifyLocks();
    touchStartStopId = getEventStopId(event);
    touchHorizontalScroll = getHorizontalScroll(event);
    if (!navigation && !isNavigationLocked()) {
      const y = getScrollY();
      const range = findScrollRange(4, y);
      if (range) touchRange = { ...range, y };
    }
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
    if (touchRangeNative) {
      if (!navigation) {
        yieldToNativeRange(touchRange.stop.id);
        trackNativeTouchBoundary(gesture);
      }
      return;
    }
    if (touchHorizontalScroll) {
      if (!touchAxis) {
        if (gesture.verticalIntent) touchAxis = 'y';
        else if (gesture.horizontalDominant && absDeltaX >= timings.touchIntentThreshold) touchAxis = 'x';
        else {
          if (touchHorizontalScroll.mode === 'threshold' && event.cancelable) event.preventDefault();
          return;
        }
      }
      if (touchAxis === 'x') {
        if (touchHorizontalScroll.mode === 'free' || !event.cancelable) return;
        event.preventDefault();
        if (!touchHandled && absDeltaX >= timings.touchThreshold) {
          touchHandled = true;
          if (!isNavigationLocked()) moveHorizontally(touchHorizontalScroll, Math.sign(deltaX));
          notifyLocks();
        }
        return;
      }
    }
    if (touchRange && !navigation && !isNavigationLocked()) {
      if (!deltaY) return;
      if (win.visualViewport?.scale > timings.zoomThreshold) return;
      const inward = canScrollIntoRange(touchRange, touchRange.y, deltaY);
      // A non-cancelable pan has already been claimed by the browser, even
      // at the boundary. Finish that outward gesture before turning the page.
      if (inward || !event.cancelable) {
        touchRangeNative = true;
        yieldToNativeRange(touchRange.stop.id);
        trackNativeTouchBoundary(gesture);
        return;
      }
      touchRange = null;
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

  function trackNativeTouchBoundary({ deltaY, absDeltaY, verticalIntent }) {
    if (verticalIntent && absDeltaY >= timings.touchThreshold &&
        !canScrollIntoRange(touchRange, touchRange.y, deltaY)) {
      nativeRange.outward = Math.sign(deltaY);
    }
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
    touchHorizontalScroll = null;
    touchAxis = '';
    touchRange = null;
    touchRangeNative = false;
    notifyLocks();
    if (nativeRange) scheduleNativeRangeEnd();
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
    const y = getScrollY();
    const previousY = previousScrollY;
    previousScrollY = y;
    if (nativeRange && y !== previousY) {
      nativeRange.moved = true;
      nativeRange.scrollEnded = false;
    }
    const range = findScrollRange(4, y);
    syncNativeRangeClass(range);
    if (!navigation && !isNavigationLocked()) {
      const stop = index.getById(nativeRange?.id) || range?.stop || findStopAtCurrentPosition(false);
      if (stop) {
        if (isAtStopEdge(stop)) settledId = stop.id;
        activateStop(stop, 'position');
      }
      const exitStop = stop || index.getById(index.getState().activeId);
      if (!navigation && !isNavigationLocked() && crossedForwardExit(exitStop, previousY, y)) {
        if (nativeRange) nativeRange.forwardExit = true;
        else move(1, { fromId: exitStop.id, source: 'range-exit' });
      }
    }
    if (nativeRange) {
      scheduleNativeRangeEnd();
    } else if (shouldMonitorRestAlignment()) {
      scheduleRestAlignmentCheck(260);
    }
  }

  function crossedForwardExit(stop, previousY, y) {
    if (!stop?.scrollWithin || typeof stop.getForwardExitTop !== 'function' || y <= previousY ||
      win.visualViewport?.scale > timings.zoomThreshold) return false;
    const start = readStopTop(stop);
    const exitTop = readForwardExitTop(stop, start, readRangeEnd(stop, start));
    return exitTop !== null && previousY < exitTop && y >= exitTop;
  }

  function readForwardExitTop(stop, start, end) {
    if (start === null || typeof stop.getForwardExitTop !== 'function') return null;
    const top = readStopTop(stop, stop.getForwardExitTop);
    return top !== null && top >= start && top <= end ? top : null;
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
    if (nativeRange) {
      restSampleScrollY = null;
      return;
    }
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
    const range = findScrollRange();
    if (range) {
      if (isAtStopEdge(range.stop)) settledId = range.stop.id;
      activateStop(range.stop, 'rest');
      return;
    }
    const nearest = index.findNearest(current, (stop) => {
      const start = readStopTop(stop);
      const end = readRangeEnd(stop, start);
      return Math.abs(current - end) < Math.abs(current - start) ? end : start;
    });
    if (!nearest) {
      return;
    }
    const tolerance = getPositionTolerance();
    if (nearest.distance > tolerance) {
      const edge = nearest.stop.top === readStopTop(nearest.stop) ? 'start' : 'end';
      goTo(nearest.stop.id, { source: 'rest', edge, behavior: 'auto', settleMs: 0, updateHistory: false });
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
    readStopTop: readNavigationTop,
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
