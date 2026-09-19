export function createStopIndex(options = {}) {
  let stops = [];
  let activeId = options.initialId || '';
  let activeContentId = options.initialContentId || '';

  function setStops(nextStops) {
    const normalized = Array.isArray(nextStops) ? nextStops.filter(Boolean) : [];
    const ids = new Set();
    normalized.forEach((stop) => {
      if (!stop || typeof stop.id !== 'string' || !stop.id) {
        throw new TypeError('Each segmented scroll stop requires a non-empty string id.');
      }
      if (ids.has(stop.id)) {
        throw new Error(`Duplicate segmented scroll stop id: ${stop.id}`);
      }
      ids.add(stop.id);
    });
    stops = normalized.map((stop) => Object.freeze({ ...stop }));

    const fallback = getById(options.initialId) || getFirstContentStop() || stops[0] || null;
    if (!getById(activeId)) {
      activeId = fallback ? fallback.id : '';
    }
    const activeContent = getById(activeContentId);
    if (!activeContent || getRole(activeContent) !== 'content') {
      const active = getById(activeId);
      activeContentId = active && getRole(active) === 'content'
        ? active.id
        : ((getFirstContentStop() || {}).id || '');
    }
    if (activeId) {
      activate(activeId);
    }
    return getState();
  }

  function getStops() {
    return stops.slice();
  }

  function getById(id) {
    return stops.find((stop) => stop.id === id) || null;
  }

  function getFirstContentStop() {
    return stops.find((stop) => getRole(stop) === 'content') || null;
  }

  function activate(id) {
    const stop = getById(id);
    if (!stop) {
      return null;
    }
    activeId = stop.id;
    if (getRole(stop) === 'content') {
      activeContentId = stop.id;
    } else {
      const anchoredContent = resolveContentAnchor(stop);
      if (anchoredContent) {
        activeContentId = anchoredContent.id;
      }
    }
    return stop;
  }

  function resolveContentAnchor(stop) {
    if (typeof stop.contentAnchor === 'function') {
      const requestedId = stop.contentAnchor({
        stop,
        stops: getStops(),
        activeContentId
      });
      const requested = getById(requestedId);
      return requested && getRole(requested) === 'content' ? requested : null;
    }
    if (typeof stop.contentAnchor === 'string' && stop.contentAnchor !== 'previous') {
      const requested = getById(stop.contentAnchor);
      return requested && getRole(requested) === 'content' ? requested : null;
    }
    if (stop.contentAnchor !== 'previous') {
      return null;
    }
    const stopIndex = stops.indexOf(stop);
    for (let index = stopIndex - 1; index >= 0; index -= 1) {
      if (getRole(stops[index]) === 'content') {
        return stops[index];
      }
    }
    return null;
  }

  function getOrderedStops(readTop) {
    if (typeof readTop !== 'function') {
      return stops.slice();
    }
    return stops
      .map((stop, order) => ({
        ...stop,
        top: readTop(stop),
        __order: order
      }))
      .filter((stop) => Number.isFinite(stop.top))
      .sort((left, right) => left.top - right.top || left.__order - right.__order)
      .map(({ __order, ...stop }) => stop);
  }

  function findDirectional(direction, currentTop, preferredId, readTop) {
    if (direction === 0) {
      return null;
    }
    const ordered = getOrderedStops(readTop);
    if (preferredId) {
      const preferredIndex = ordered.findIndex((stop) => stop.id === preferredId);
      if (preferredIndex >= 0) {
        return ordered[preferredIndex + direction] || null;
      }
    }
    const tolerance = 1;
    if (direction > 0) {
      return ordered.find((stop) => stop.top > currentTop + tolerance) || null;
    }
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if (ordered[index].top < currentTop - tolerance) {
        return ordered[index];
      }
    }
    return null;
  }

  function findNearest(currentTop, readTop) {
    const ordered = getOrderedStops(readTop);
    let nearest = null;
    let distance = Infinity;
    ordered.forEach((stop) => {
      const candidateDistance = Math.abs(stop.top - currentTop);
      if (candidateDistance < distance) {
        nearest = stop;
        distance = candidateDistance;
      }
    });
    return nearest ? { stop: nearest, distance } : null;
  }

  function getState() {
    return {
      activeId,
      activeIndex: stops.findIndex((stop) => stop.id === activeId),
      activeContentId,
      activeContentIndex: stops.findIndex((stop) => stop.id === activeContentId),
      size: stops.length
    };
  }

  return Object.freeze({
    setStops,
    getStops,
    getById,
    getOrderedStops,
    findDirectional,
    findNearest,
    activate,
    getState
  });
}

export function getRole(stop) {
  return stop && stop.role === 'auxiliary' ? 'auxiliary' : 'content';
}
