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
  const verticalRegions = new Map();
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
    if (nativeRange && index.getById(nativeRange.id)?.scrollWithin?.element !== nativeRange.element) clearNativeRange();
    if (touchRange && index.getById(touchRange.stop.id)?.scrollWithin?.element !== touchRange.element) {
      touchRange = null;
      touchRangeNative = false;
    }
    if (mounted) syncHorizontalRegions();
    syncVerticalRegions();
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

  function syncVerticalRegions() {
    const className = 'segmented-scroll-vertical';
    const unifiedClass = 'segmented-scroll-vertical--document';
    const regions = new Map(mounted ? index.getStops().map((stop) => stop.scrollWithin)
      .filter((range) => range?.element).map((range) => [range.element, range.scrollbar === 'document']) : []);
    for (const [element, { unified, dispose }] of verticalRegions) {
      if (regions.get(element) === unified) continue;
      dispose();
      verticalRegions.delete(element);
    }
    for (const [element, unified] of regions) {
      if (verticalRegions.has(element)) continue;
      const classes = (unified ? [className, unifiedClass] : [className])
        .filter((name) => !element.classList.contains(name));
      classes.forEach((name) => element.classList.add(name));
      const onScroll = () => handleRangeScroll(element);
      element.addEventListener('scroll', onScroll, { passive: true });
      element.addEventListener('scrollend', handleNativeScrollEnd, { passive: true });
      const dispose = () => {
        element.removeEventListener('scroll', onScroll);
        element.removeEventListener('scrollend', handleNativeScrollEnd);
        classes.forEach((name) => element.classList.remove(name));
      };
      verticalRegions.set(element, { unified, dispose });
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
    clearNativeRange();
    cancelScrollAlignment();
    if (restTimer !== null) {
      win.clearTimeout(restTimer);
      restTimer = null;
    }
    syncManagedClasses();
    syncHorizontalRegions();
    syncVerticalRegions();
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
    if (mounted && nativeRange?.scrollEnded) finishNativeRange();
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
    const { edge } = navigationOptions;
    const top = readStopTop(stop);
    if (!mounted || !stop || top === null) return false;
    clearNativeRange();
    const sequence = ++navigationSequence;
    cancelNavigation('superseded');
    // A subscriber may synchronously start another navigation or destroy us.
    if (!mounted || sequence !== navigationSequence) return false;
    const current = { id: stop.id, source: navigationOptions.source || 'programmatic', sequence };
    navigation = current;
    pendingId = stop.id;
    if (wheelRangeId) {
      wheelRangeId = '';
      wheelHandled = true;
    }
    lockFor(prefersReducedMotion() ? 160 : Math.max(timings.navigationLockMs, timings.settleMs + 140));
    if (navigation !== current) return false;
    if (stop.scrollWithin?.element) scrollToRangeEdge(stop.scrollWithin, edge);
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

  function readRangeEnd(element) {
    return Math.max(0, element.scrollHeight - element.clientHeight);
  }

  function getDocumentRanges() {
    let extra = 0;
    const documentEnd = readRangeEnd(doc.scrollingElement || doc.documentElement);
    const stops = index.getOrderedStops((stop) => stop.scrollWithin?.scrollbar === 'document' ? readStopTop(stop) : null);
    const ranges = [];
    for (const stop of stops) {
      const { element } = stop.scrollWithin;
      const length = readRangeEnd(element);
      if (!length || stop.top > documentEnd) continue;
      const start = stop.top + extra;
      extra += length;
      ranges.push({ element, documentTop: stop.top, start, end: start + length, length });
    }
    return { ranges, end: documentEnd + extra };
  }

  function getDocumentScroll() {
    const { ranges, end } = getDocumentRanges();
    const y = getScrollY();
    let top = y;
    for (const range of ranges) {
      if (y < range.documentTop - 0.5) break;
      if (Math.abs(y - range.documentTop) <= 0.5) {
        top = range.start + Math.min(range.length, Math.max(0, range.element.scrollTop));
        break;
      }
      top += range.length;
    }
    return { top: Math.min(end, Math.max(0, top)), end };
  }

  function setDocumentScroll(top, { fromTop, direction = 0 } = {}) {
    if (!mounted || !Number.isFinite(top)) return;
    clearNativeRange();
    const { ranges, end } = getDocumentRanges();
    const fromRange = ranges.find((range) => {
      if (direction < 0 && fromTop <= range.start + 0.5) return false;
      if (direction > 0 && fromTop >= range.end - 0.5) return false;
      return fromTop >= range.start && fromTop <= range.end;
    });
    const target = Math.min(fromRange?.end ?? end, Math.max(fromRange?.start ?? 0, top));
    let position = target;
    for (const range of ranges) {
      if (target < range.start) break;
      if (target <= range.end) {
        range.element.scrollTo({ top: target - range.start, behavior: 'instant' });
        position = range.documentTop;
        break;
      }
      position -= range.length;
    }
    adapter.scrollTo(position, 'instant');
  }

  function scrollToRangeEdge({ element, getReverseEntryTop }, edge) {
    const end = readRangeEnd(element);
    const entry = edge === 'reverse-entry' ? getReverseEntryTop?.() : null;
    const top = Number.isFinite(entry) ? Math.min(end, Math.max(0, entry)) : end;
    element.scrollTo({ top: edge === 'end' || edge === 'reverse-entry' ? top : 0, behavior: 'instant' });
  }

  function goToDirectionalStop(stop, direction, options) {
    return goTo(stop.id, { ...options, edge: options.edge ?? (direction < 0 ? 'reverse-entry' : 'start') });
  }

  function isAtStopEdge(stop) {
    const start = readStopTop(stop);
    return start !== null && Math.abs(getScrollY() - start) <= 1;
  }

  function findScrollRange(tolerance = 1) {
    const y = getScrollY();
    for (const stop of index.getStops()) {
      const element = stop.scrollWithin?.element;
      if (!element) continue;
      const start = readStopTop(stop);
      if (start === null || Math.abs(y - start) > tolerance) continue;
      const end = readRangeEnd(element);
      if (end > 0) return { stop, element, end, y: element.scrollTop };
    }
    return null;
  }

  function canScrollIntoRange(range, delta) {
    if (!range) return false;
    // scrollHeight/clientHeight are rounded even when scrollTop is fractional.
    return delta > 0 ? range.y < range.end - 0.5 : delta < 0 && range.y > 0.5;
  }

  function yieldToNativeRange(stop) {
    const { element } = stop.scrollWithin;
    if (nativeRange?.id !== stop.id) {
      nativeRange = { id: stop.id, element, startTop: element.scrollTop, moved: false, scrollEnded: false };
    }
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
    // Some browsers omit scrollend for a wheel tick pinned at the boundary.
    nativeRangeTimer = win.setTimeout(finishNativeRange, 260);
  }

  function handleRangeScroll(element) {
    if (nativeRange?.element !== element) return;
    nativeRange.moved = true;
    nativeRange.scrollEnded = false;
    scheduleNativeRangeEnd();
  }

  function handleNativeScrollEnd(event) {
    if (event.target !== nativeRange?.element || !nativeRange.moved) return;
    // Some browsers end each discrete wheel tick. Preserve ownership until
    // the same quiet interval used to distinguish threshold gestures.
    nativeRange.scrollEnded = true;
    if (!wheelRangeId && !touchPointsActive) finishNativeRange();
  }

  function finishNativeRange() {
    if (!nativeRange) return;
    if (wheelRangeId || (touchPointsActive > 0 && Date.now() - lastTouchEventAt < timings.touchActivityStaleMs)) {
      scheduleNativeRangeEnd();
      return;
    }
    const { id, element, startTop, moved } = nativeRange;
    const stop = index.getById(id);
    clearNativeRange();
    if (moved && stop?.scrollWithin?.advanceAtEnd && !navigation && !isNavigationLocked() &&
        !(win.visualViewport?.scale > timings.zoomThreshold) && findScrollRange(4)?.stop.id === id &&
        element.scrollTop > startTop && element.scrollTop >= readRangeEnd(element) - 0.5) {
      move(1, { fromId: id, source: 'range-exit' });
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
      const stop = index.getById(wheelRangeId);
      if (stop?.scrollWithin && eventIncludesElement(event, stop.scrollWithin.element)) {
        yieldToNativeRange(stop);
      } else if (event.cancelable) {
        event.preventDefault();
      }
      return;
    }
    if (firstWheelEvent && deltaY && wheelAxis !== 'x' && !navigation && !isNavigationLocked()) {
      const range = findScrollRange(4);
      if (range && (nativeRange?.id === range.stop.id || canScrollIntoRange(range, deltaY))) {
        if (eventIncludesElement(event, range.element)) {
          wheelRangeId = range.stop.id;
          yieldToNativeRange(range.stop);
        } else if (event.cancelable) {
          event.preventDefault();
        }
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
    if (!navigation && !isNavigationLocked()) touchRange = findScrollRange(4);
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
      if (!navigation) yieldToNativeRange(touchRange.stop);
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
      const inward = canScrollIntoRange(touchRange, deltaY);
      if (inward || nativeRange?.id === touchRange.stop.id) {
        if (eventIncludesElement(event, touchRange.element)) {
          touchRangeNative = true;
          yieldToNativeRange(touchRange.stop);
        } else if (event.cancelable) {
          event.preventDefault();
        }
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
    if (nativeRange?.scrollEnded && !touchPointsActive) finishNativeRange();
    else if (nativeRange) scheduleNativeRangeEnd();
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
      const stop = findScrollRange(4)?.stop || findStopAtCurrentPosition(false);
      if (stop) {
        if (isAtStopEdge(stop)) settledId = stop.id;
        activateStop(stop, 'position');
      }
    }
    if (!nativeRange && shouldMonitorRestAlignment()) {
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
    getDocumentScroll,
    setDocumentScroll,
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
