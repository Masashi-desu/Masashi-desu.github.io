(function () {
  const PAGE_SIZE = 6;
  const LONG_PRESS_MS = 600;
  const DRAG_THRESHOLD_PX = 2;
  const SWIPE_THRESHOLD_PX = 40;

  const grid = document.getElementById('retreat-app-grid');
  const glassPanel = document.getElementById('retreat-screen-glass');
  const interactionSurface = document.querySelector('.retreat-launcher-panel__content');
  const screen = document.querySelector('.retreat-screen');
  const editButton = document.getElementById('retreat-edit-toggle');
  const editButtonLabel = editButton && editButton.querySelector('span');
  const editHint = document.getElementById('retreat-edit-hint');
  const liveStatus = document.getElementById('retreat-live-status');
  const title = document.getElementById('retreat-title');
  const titleInput = document.getElementById('retreat-title-input');
  const pageDots = Array.from(document.querySelectorAll('[data-page-target]'));

  if (!grid || !glassPanel || !interactionSurface || !screen || !editButton || !editButtonLabel || !title || !titleInput) {
    return;
  }

  let items = Array.from(grid.querySelectorAll('[data-launcher-item]'));
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  let currentPage = 1;
  let isEditing = false;
  let dragState = null;
  let swipeState = null;
  let longPressState = null;
  let suppressedClickItem = null;
  let suppressClickTimer = 0;
  let refreshTimer = 0;
  const shiftTimers = new WeakMap();

  function t(key, variables) {
    if (window.RetreatI18n && typeof window.RetreatI18n.get === 'function') {
      return window.RetreatI18n.get(key, variables);
    }
    return '';
  }

  function announce(key, variables) {
    if (!liveStatus) {
      return;
    }
    const message = t(key, variables);
    liveStatus.textContent = '';
    window.requestAnimationFrame(() => {
      liveStatus.textContent = message;
    });
  }

  function requestLiquidRefresh(delay = 180) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (window.MDWLiquidGL && typeof window.MDWLiquidGL.refresh === 'function') {
        window.MDWLiquidGL.refresh(0);
      }
    }, delay);
  }

  function assignPagesFromOrder() {
    items = Array.from(grid.querySelectorAll('[data-launcher-item]'));
    items.forEach((item, index) => {
      item.dataset.page = String(Math.floor(index / PAGE_SIZE) + 1);
    });
  }

  function renderPage(options = {}) {
    const { announcePage = false } = options;
    items.forEach((item) => {
      item.hidden = Number(item.dataset.page) !== currentPage;
    });

    pageDots.forEach((dot) => {
      const isCurrent = Number(dot.dataset.pageTarget) === currentPage;
      dot.classList.toggle('is-active', isCurrent);
      if (isCurrent) {
        dot.setAttribute('aria-current', 'page');
      } else {
        dot.removeAttribute('aria-current');
      }
    });

    if (announcePage) {
      announce('pageStatus', { page: currentPage });
    }
    requestLiquidRefresh();
  }

  function setPage(nextPage, options = {}) {
    const normalizedPage = Math.min(totalPages, Math.max(1, Number(nextPage) || 1));
    if (normalizedPage === currentPage) {
      return;
    }
    currentPage = normalizedPage;
    renderPage(options);
  }

  function getLabel(item) {
    return item.querySelector('.retreat-app-label');
  }

  function getRenameInput(item) {
    return item.querySelector('.retreat-app-rename');
  }

  function updateRenameAccessibility(item) {
    const label = getLabel(item);
    const input = getRenameInput(item);
    if (!label || !input) {
      return;
    }
    input.setAttribute('aria-label', t('renameLabel', { name: label.textContent.trim() }));
    input.setAttribute('aria-describedby', 'retreat-edit-hint');
  }

  function syncRenameInputs(options = {}) {
    const { preserveFocused = true } = options;
    items.forEach((item) => {
      const label = getLabel(item);
      const input = getRenameInput(item);
      if (!label || !input) {
        return;
      }
      if (!preserveFocused || document.activeElement !== input) {
        input.value = label.textContent.trim();
        delete input.dataset.dirty;
      }
      updateRenameAccessibility(item);
    });
    titleInput.setAttribute('aria-label', t('titleRenameLabel'));
    pageDots.forEach((dot, index) => {
      dot.setAttribute('aria-label', t(index === 0 ? 'pageOneLabel' : 'pageTwoLabel'));
    });
  }

  function commitRename(item, options = {}) {
    const { announceChange = true } = options;
    const label = getLabel(item);
    const input = getRenameInput(item);
    if (!label || !input) {
      return;
    }

    const previousName = label.textContent.trim();
    const nextName = input.value.trim();
    if (!nextName) {
      input.value = previousName;
      delete input.dataset.dirty;
      return;
    }

    if (input.dataset.dirty === 'true' && nextName !== previousName) {
      label.textContent = nextName;
      label.dataset.userLabel = 'true';
      if (announceChange) {
        announce('renamedStatus', { name: nextName });
      }
    }
    input.value = label.textContent.trim();
    delete input.dataset.dirty;
    updateRenameAccessibility(item);
    requestLiquidRefresh();
  }

  function commitTitle(options = {}) {
    const { announceChange = false } = options;
    const previousTitle = title.textContent.trim() || 'RetreatScreen';
    const nextTitle = titleInput.value.trim() || 'RetreatScreen';
    if (titleInput.dataset.dirty === 'true' && nextTitle !== previousTitle) {
      title.textContent = nextTitle;
      title.dataset.userLabel = 'true';
      if (announceChange) {
        announce('renamedStatus', { name: nextTitle });
      }
    }
    titleInput.value = title.textContent.trim() || 'RetreatScreen';
    delete titleInput.dataset.dirty;
  }

  function syncEditingCopy() {
    editButtonLabel.textContent = isEditing ? t('done') : t('edit');
    syncRenameInputs();
  }

  function setEditing(nextEditing, options = {}) {
    const { focusItem = null } = options;
    const next = Boolean(nextEditing);
    if (next === isEditing) {
      if (next && focusItem) {
        const input = getRenameInput(focusItem);
        if (input) {
          input.focus();
          input.select();
        }
      }
      return;
    }

    if (!next) {
      items.forEach((item) => commitRename(item, { announceChange: false }));
      commitTitle();
    }

    isEditing = next;
    grid.classList.toggle('is-editing', isEditing);
    editButton.setAttribute('aria-pressed', String(isEditing));
    editHint.hidden = !isEditing;
    title.hidden = isEditing;
    titleInput.hidden = !isEditing;
    if (isEditing) {
      titleInput.value = title.textContent.trim() || 'RetreatScreen';
    }

    items.forEach((item) => {
      const link = item.querySelector('.retreat-app-link');
      const input = getRenameInput(item);
      item.draggable = false;
      if (link) {
        link.draggable = false;
        link.setAttribute('aria-disabled', String(isEditing));
        link.tabIndex = isEditing ? -1 : 0;
      }
      if (input) {
        input.hidden = !isEditing;
        if (isEditing) {
          input.value = getLabel(item).textContent.trim();
        }
      }
    });

    syncEditingCopy();
    announce(isEditing ? 'editOnStatus' : 'editOffStatus');
    requestLiquidRefresh(60);

    if (isEditing && focusItem) {
      const input = getRenameInput(focusItem);
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function moveByOffset(item, offset) {
    const index = items.indexOf(item);
    const nextIndex = Math.min(items.length - 1, Math.max(0, index + offset));
    if (index < 0 || index === nextIndex) {
      return;
    }
    const target = items[nextIndex];
    if (offset > 0) {
      target.after(item);
    } else {
      target.before(item);
    }
    assignPagesFromOrder();
    currentPage = Number(item.dataset.page) || currentPage;
    renderPage();
    const input = getRenameInput(item);
    if (input) {
      input.focus();
    }
    announce('movedStatus', { name: getLabel(item).textContent.trim() });
  }

  function clearLongPress() {
    if (longPressState && longPressState.timer) {
      window.clearTimeout(longPressState.timer);
    }
    longPressState = null;
  }

  function suppressClickFor(item) {
    suppressedClickItem = item;
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(() => {
      if (suppressedClickItem === item) {
        suppressedClickItem = null;
      }
    }, 400);
  }

  function startLongPress(event, item) {
    clearLongPress();
    longPressState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: window.setTimeout(() => {
        suppressClickFor(item);
        setEditing(true, { focusItem: item });
        clearLongPress();
      }, LONG_PRESS_MS)
    };
  }

  function startDrag(event, item) {
    dragState = {
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastTarget: null,
      ghost: null,
      placeholder: null,
      offsetX: 0,
      offsetY: 0,
      active: false
    };
  }

  function clearDropTargets() {
    items.forEach((item) => item.classList.remove('is-drop-target'));
  }

  function captureGridPositions() {
    const positions = new Map();
    items.forEach((item) => {
      if (item.hidden || item === dragState?.item) {
        return;
      }
      positions.set(item, item.getBoundingClientRect());
      window.clearTimeout(shiftTimers.get(item));
      item.style.transition = 'none';
      item.style.transform = '';
    });
    return positions;
  }

  function animateGridShift(positions) {
    const shiftedItems = [];
    positions.forEach((previousRect, item) => {
      if (item.hidden) {
        return;
      }
      const nextRect = item.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
        item.style.transition = '';
        return;
      }
      item.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
      shiftedItems.push(item);
    });

    if (!shiftedItems.length) {
      return;
    }

    grid.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      shiftedItems.forEach((item) => {
        item.style.transition = 'transform 230ms cubic-bezier(0.2, 0.78, 0.22, 1)';
        item.style.transform = '';
        const timer = window.setTimeout(() => {
          item.style.transition = '';
          shiftTimers.delete(item);
        }, 260);
        shiftTimers.set(item, timer);
      });
    });
  }

  function updateGhostPosition(event) {
    if (!dragState?.ghost) {
      return;
    }
    dragState.ghost.style.left = `${event.clientX - dragState.offsetX}px`;
    dragState.ghost.style.top = `${event.clientY - dragState.offsetY}px`;
  }

  function activateDrag(event) {
    const item = dragState.item;
    const icon = item.querySelector('.retreat-app-icon');
    if (!icon) {
      return false;
    }

    const iconRect = icon.getBoundingClientRect();
    const placeholder = document.createElement('div');
    const ghost = document.createElement('div');
    placeholder.className = 'retreat-app-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    ghost.className = 'retreat-drag-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${iconRect.width}px`;
    ghost.style.height = `${iconRect.height}px`;
    ghost.append(icon.cloneNode(true));

    item.before(placeholder);
    document.body.append(ghost);
    dragState.active = true;
    dragState.placeholder = placeholder;
    dragState.ghost = ghost;
    dragState.offsetX = event.clientX - iconRect.left;
    dragState.offsetY = event.clientY - iconRect.top;
    item.classList.add('is-dragging');
    document.body.classList.add('is-retreat-dragging');
    updateGhostPosition(event);
    return true;
  }

  function movePlaceholder(target) {
    const { item, placeholder } = dragState;
    if (!placeholder || !target || target === item || target.hidden) {
      return;
    }

    const visibleSlots = Array.from(grid.children).filter((element) => (
      element === placeholder
      || (element.matches('[data-launcher-item]') && element !== item && !element.hidden)
    ));
    const placeholderIndex = visibleSlots.indexOf(placeholder);
    const targetIndex = visibleSlots.indexOf(target);
    if (placeholderIndex < 0 || targetIndex < 0) {
      return;
    }

    const positions = captureGridPositions();
    if (placeholderIndex < targetIndex) {
      target.after(placeholder);
    } else {
      target.before(placeholder);
    }
    animateGridShift(positions);
  }

  function settleDrag(state) {
    const { item, ghost, placeholder } = state;
    if (!ghost || !placeholder || !placeholder.isConnected) {
      ghost?.remove();
      placeholder?.remove();
      item.classList.remove('is-dragging');
      return;
    }

    const slotRect = placeholder.getBoundingClientRect();
    const ghostRect = ghost.getBoundingClientRect();
    ghost.getBoundingClientRect();
    ghost.classList.add('is-dropping');
    ghost.style.left = `${slotRect.left + (slotRect.width - ghostRect.width) / 2}px`;
    ghost.style.top = `${slotRect.top}px`;

    window.setTimeout(() => {
      placeholder.replaceWith(item);
      item.classList.remove('is-dragging');
      ghost.remove();
      assignPagesFromOrder();
      currentPage = Number(item.dataset.page) || currentPage;
      renderPage();
      announce('movedStatus', { name: getLabel(item).textContent.trim() });
      requestLiquidRefresh(60);
    }, 180);
  }

  function handlePointerMove(event) {
    if (longPressState && event.pointerId === longPressState.pointerId) {
      const distance = Math.hypot(
        event.clientX - longPressState.startX,
        event.clientY - longPressState.startY
      );
      if (distance > 8) {
        clearLongPress();
      }
    }

    if (!dragState || event.pointerId !== dragState.pointerId || !isEditing) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - dragState.startX,
      event.clientY - dragState.startY
    );
    if (!dragState.active && distance < DRAG_THRESHOLD_PX) {
      return;
    }

    if (!dragState.active) {
      if (!activateDrag(event)) {
        dragState = null;
        return;
      }
    }

    event.preventDefault();
    updateGhostPosition(event);
    const pointedElement = document.elementFromPoint(event.clientX, event.clientY);
    const dot = pointedElement && pointedElement.closest('[data-page-target]');
    if (dot) {
      clearDropTargets();
      setPage(Number(dot.dataset.pageTarget));
      return;
    }

    const target = pointedElement && pointedElement.closest('[data-launcher-item]');
    if (!target || target === dragState.item || target.hidden) {
      dragState.lastTarget = null;
      return;
    }
    if (target === dragState.lastTarget) {
      return;
    }
    clearDropTargets();
    target.classList.add('is-drop-target');
    dragState.lastTarget = target;
    movePlaceholder(target);
  }

  function handlePointerEnd(event) {
    if (longPressState && event.pointerId === longPressState.pointerId) {
      clearLongPress();
    }
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const completedDrag = dragState.active;
    const completedState = dragState;
    const draggedItem = completedState.item;
    clearDropTargets();
    document.body.classList.remove('is-retreat-dragging');
    dragState = null;

    if (completedDrag) {
      suppressClickFor(draggedItem);
      settleDrag(completedState);
      return;
    }

    if (isEditing) {
      const input = getRenameInput(draggedItem);
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function bindItem(item) {
    const link = item.querySelector('.retreat-app-link');
    const input = getRenameInput(item);
    if (!link || !input) {
      return;
    }

    link.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      if (isEditing) {
        startDrag(event, item);
      } else {
        startLongPress(event, item);
      }
    });

    link.addEventListener('click', (event) => {
      if (isEditing || suppressedClickItem === item) {
        event.preventDefault();
        event.stopPropagation();
        if (suppressedClickItem === item) {
          suppressedClickItem = null;
          return;
        }
        if (isEditing) {
          input.focus();
          input.select();
        }
      }
    });

    input.addEventListener('input', () => {
      input.dataset.dirty = 'true';
    });

    input.addEventListener('blur', () => {
      commitRename(item);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitRename(item);
        input.select();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        input.value = getLabel(item).textContent.trim();
        delete input.dataset.dirty;
        input.blur();
        return;
      }
      if (event.altKey && event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        moveByOffset(item, -1);
      }
      if (event.altKey && event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault();
        moveByOffset(item, 1);
      }
    });
  }

  pageDots.forEach((dot) => {
    dot.addEventListener('click', () => {
      setPage(Number(dot.dataset.pageTarget), { announcePage: true });
    });
  });

  editButton.addEventListener('click', () => {
    setEditing(!isEditing);
  });

  titleInput.addEventListener('input', () => {
    titleInput.dataset.dirty = 'true';
  });

  titleInput.addEventListener('blur', () => {
    commitTitle({ announceChange: true });
  });

  titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitTitle({ announceChange: true });
      titleInput.select();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      titleInput.value = title.textContent.trim() || 'RetreatScreen';
      delete titleInput.dataset.dirty;
      titleInput.blur();
    }
  });

  interactionSurface.addEventListener('pointerdown', (event) => {
    if (isEditing || event.target.closest('input')) {
      return;
    }
    swipeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
  });

  interactionSurface.addEventListener('pointerup', (event) => {
    if (!swipeState || swipeState.pointerId !== event.pointerId || isEditing) {
      swipeState = null;
      return;
    }
    const deltaX = event.clientX - swipeState.startX;
    const deltaY = event.clientY - swipeState.startY;
    swipeState = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }
    setPage(currentPage + (deltaX < 0 ? 1 : -1), { announcePage: true });
  });

  window.addEventListener('pointermove', handlePointerMove, { passive: false });
  window.addEventListener('pointerup', handlePointerEnd);
  window.addEventListener('pointercancel', handlePointerEnd);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isEditing && document.activeElement !== titleInput) {
      event.preventDefault();
      setEditing(false);
      editButton.focus();
      return;
    }
    if (event.metaKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      setPage(currentPage - 1, { announcePage: true });
    }
    if (event.metaKey && event.key === 'ArrowRight') {
      event.preventDefault();
      setPage(currentPage + 1, { announcePage: true });
    }
  });

  window.addEventListener('retreat:language-applied', () => {
    syncEditingCopy();
    if (title.dataset.userLabel !== 'true') {
      titleInput.value = title.textContent.trim() || 'RetreatScreen';
    }
    requestLiquidRefresh(320);
  });

  window.addEventListener('pageshow', () => {
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }
  }, { once: true });

  items.forEach(bindItem);
  assignPagesFromOrder();
  renderPage();
  syncRenameInputs({ preserveFocused: false });

  window.RetreatLauncher = {
    setEditing,
    setPage,
    reset() {
      window.location.reload();
    },
    getState() {
      return {
        isEditing,
        currentPage,
        order: items.map((item) => item.dataset.launcherItem),
        labels: Object.fromEntries(items.map((item) => [
          item.dataset.launcherItem,
          getLabel(item).textContent.trim()
        ]))
      };
    }
  };
})();
