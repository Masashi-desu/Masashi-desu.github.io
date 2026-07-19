(function () {
  const PAGE_SIZE = 6;
  const LONG_PRESS_MS = 600;
  const DRAG_THRESHOLD_PX = 2;
  const SWIPE_THRESHOLD_PX = 40;
  const PAGE_SCROLL_THRESHOLD_PX = 36;
  const PAGE_SCROLL_IDLE_MS = 350;
  const PAGE_TRANSITION_MS = 320;
  const ICON_OUTPUT_SIZE = 384;
  const EDITS_STORAGE_KEY = 'retreatscreen-launcher-item-edits-v1';
  const SUPPORTED_ICON_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg'];
  const SUPPORTED_ICON_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml'];

  const grid = document.getElementById('retreat-app-grid');
  const gridViewport = document.querySelector('.retreat-app-grid-viewport');
  const pagePanels = Array.from(document.querySelectorAll('[data-launcher-page]'));
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
  const screenContent = document.querySelector('.retreat-screen__content');
  const iconEditorOverlay = document.getElementById('retreat-icon-editor-overlay');
  const iconEditorDialog = document.getElementById('retreat-icon-editor');
  const iconEditorClose = document.getElementById('retreat-icon-editor-close');
  const iconEditorName = document.getElementById('retreat-icon-editor-name');
  const iconEditorPreview = document.getElementById('retreat-icon-editor-preview');
  const iconEditorSelected = document.getElementById('retreat-icon-editor-selected');
  const iconEditorError = document.getElementById('retreat-icon-editor-error');
  const iconEditorFile = document.getElementById('retreat-icon-editor-file');
  const iconEditorChoose = document.getElementById('retreat-icon-editor-choose');
  const iconEditorRevert = document.getElementById('retreat-icon-editor-revert');
  const iconEditorCancel = document.getElementById('retreat-icon-editor-cancel');
  const iconEditorSave = document.getElementById('retreat-icon-editor-save');
  const launcherActionAttributes = ['href', 'data-pressable', 'data-transition-direction', 'role', 'tabindex', 'aria-label'];
  const launcherActionState = new WeakMap();

  if (
    !grid || !gridViewport || pagePanels.length === 0 || !glassPanel || !interactionSurface
    || !screen || !screenContent || !editButton || !editButtonLabel || !title || !titleInput
    || !iconEditorOverlay || !iconEditorDialog || !iconEditorClose || !iconEditorName
    || !iconEditorPreview || !iconEditorSelected || !iconEditorError || !iconEditorFile
    || !iconEditorChoose || !iconEditorRevert || !iconEditorCancel || !iconEditorSave
  ) {
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
  let pageTransitionTimer = 0;
  let pageScrollDistance = 0;
  let pageScrollLocked = false;
  let pageScrollTimer = 0;
  let iconEditorState = null;
  let iconEditorReturnFocus = null;
  const shiftTimers = new WeakMap();
  const originalIconState = new Map();
  const customIconState = new Map();
  const savedNameState = new Map();
  const contentInertState = new Map();

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
    pagePanels.forEach((panel, index) => {
      items.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE).forEach((item) => {
        panel.append(item);
      });
    });
  }

  function clearPageTransition() {
    window.clearTimeout(pageTransitionTimer);
    grid.classList.remove('is-page-transitioning');
  }

  function movePageTrack(shouldAnimate) {
    window.clearTimeout(pageTransitionTimer);
    grid.classList.toggle(
      'is-page-transitioning',
      shouldAnimate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    grid.style.setProperty('--retreat-page-offset', `${(currentPage - 1) * -100}%`);
    pageTransitionTimer = window.setTimeout(() => {
      clearPageTransition();
    }, PAGE_TRANSITION_MS);
  }

  function renderPage(options = {}) {
    const { announcePage = false, direction = null } = options;
    pagePanels.forEach((panel) => {
      const isCurrent = Number(panel.dataset.launcherPage) === currentPage;
      panel.inert = !isCurrent;
      panel.setAttribute('aria-hidden', String(!isCurrent));
    });

    movePageTrack(direction === 'next' || direction === 'previous');

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
    // 本家と同様、常設したページトラックの位置だけを変える。
    // DOMの複製・追加・削除やLiquidGLの再生成はページ送りでは行わない。
  }

  function setPage(nextPage, options = {}) {
    const normalizedPage = Math.min(totalPages, Math.max(1, Number(nextPage) || 1));
    if (normalizedPage === currentPage) {
      return false;
    }
    const direction = normalizedPage > currentPage ? 'next' : 'previous';
    currentPage = normalizedPage;
    renderPage({ ...options, direction });
    return true;
  }

  function wheelDeltaInPixels(event, value) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return value * 16;
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return value * Math.max(1, interactionSurface.clientWidth);
    }
    return value;
  }

  function resetPageScrollGesture() {
    pageScrollDistance = 0;
    pageScrollLocked = false;
  }

  function handlePageScroll(event) {
    if (event.ctrlKey || iconEditorState || dragState?.active || totalPages <= 1) {
      return;
    }

    const pageDelta = event.deltaX;
    if (Math.abs(pageDelta) <= 0.01) {
      return;
    }

    // 本家同様、トラックパッド等の通常の横スクロールだけをページ送りに使う。
    event.preventDefault();
    window.clearTimeout(pageScrollTimer);
    pageScrollTimer = window.setTimeout(
      resetPageScrollGesture,
      PAGE_SCROLL_IDLE_MS
    );

    if (pageScrollLocked) {
      return;
    }

    pageScrollDistance += wheelDeltaInPixels(event, pageDelta);
    if (Math.abs(pageScrollDistance) < PAGE_SCROLL_THRESHOLD_PX) {
      return;
    }

    setPage(currentPage + (pageScrollDistance > 0 ? 1 : -1), {
      announcePage: true
    });
    pageScrollDistance = 0;
    pageScrollLocked = true;
  }

  function getLabel(item) {
    return item.querySelector('.retreat-app-label');
  }

  function getIcon(item) {
    return item.querySelector('.retreat-app-icon');
  }

  function getItemKey(item) {
    return item.dataset.launcherItem || '';
  }

  function snapshotOriginalIcons() {
    items.forEach((item) => {
      const key = getItemKey(item);
      const icon = getIcon(item);
      if (!key || !icon) {
        return;
      }
      originalIconState.set(key, {
        className: icon.className,
        html: icon.innerHTML
      });
    });
  }

  function readStoredEdits() {
    try {
      const parsed = JSON.parse(localStorage.getItem(EDITS_STORAGE_KEY) || 'null');
      return parsed && parsed.version === 1 && parsed.items && typeof parsed.items === 'object'
        ? parsed.items
        : {};
    } catch (error) {
      return {};
    }
  }

  function isSupportedStoredIcon(icon) {
    return Boolean(
      icon
      && typeof icon.dataUrl === 'string'
      && /^data:image\/(?:png|gif);base64,/iu.test(icon.dataUrl)
    );
  }

  function createIconElement(item, customIcon) {
    const key = getItemKey(item);
    const original = originalIconState.get(key);
    const icon = document.createElement('span');
    if (!original) {
      icon.className = 'retreat-app-icon';
      return icon;
    }

    icon.className = original.className;
    if (!customIcon) {
      icon.innerHTML = original.html;
      return icon;
    }

    icon.classList.add('retreat-app-icon--custom');
    const image = document.createElement('img');
    image.src = customIcon.dataUrl;
    image.alt = '';
    image.width = 384;
    image.height = 384;
    icon.replaceChildren(image);
    return icon;
  }

  function applyIconToItem(item, customIcon) {
    const currentIcon = getIcon(item);
    if (!currentIcon) {
      return;
    }
    currentIcon.replaceWith(createIconElement(item, customIcon));
  }

  function applyStoredEdits() {
    const stored = readStoredEdits();
    items.forEach((item) => {
      const key = getItemKey(item);
      const edit = stored[key];
      const label = getLabel(item);
      if (!edit || !label) {
        return;
      }
      if (typeof edit.name === 'string' && edit.name.trim()) {
        const savedName = edit.name.trim().slice(0, 28);
        savedNameState.set(key, savedName);
        label.textContent = savedName;
        label.dataset.userLabel = 'true';
      }
      if (isSupportedStoredIcon(edit.icon)) {
        const savedIcon = {
          dataUrl: edit.icon.dataUrl,
          contentType: edit.icon.contentType === 'image/gif' ? 'image/gif' : 'image/png'
        };
        customIconState.set(key, savedIcon);
        applyIconToItem(item, savedIcon);
      }
    });
  }

  function persistProposedEdit(key, name, customIcon) {
    const storedItems = {};
    const proposedNames = new Map(savedNameState);
    const proposedIcons = new Map(customIconState);
    proposedNames.set(key, name);
    if (customIcon) {
      proposedIcons.set(key, customIcon);
    } else {
      proposedIcons.delete(key);
    }

    items.forEach((item) => {
      const itemKey = getItemKey(item);
      const savedName = proposedNames.get(itemKey);
      const savedIcon = proposedIcons.get(itemKey);
      if (!savedName && !savedIcon) {
        return;
      }
      storedItems[itemKey] = {};
      if (savedName) {
        storedItems[itemKey].name = savedName;
      }
      if (savedIcon) {
        storedItems[itemKey].icon = savedIcon;
      }
    });

    try {
      localStorage.setItem(EDITS_STORAGE_KEY, JSON.stringify({ version: 1, items: storedItems }));
      return true;
    } catch (error) {
      return false;
    }
  }

  function syncLauncherAccessibility() {
    titleInput.setAttribute('aria-label', t('titleRenameLabel'));
    pageDots.forEach((dot, index) => {
      dot.setAttribute('aria-label', t(index === 0 ? 'pageOneLabel' : 'pageTwoLabel'));
    });
    if (iconEditorState) {
      renderIconEditorMessages();
    }
  }

  function setUnderlyingContentInert(shouldBeInert) {
    const targets = [
      ...Array.from(screenContent.children).filter((child) => child !== iconEditorOverlay),
      document.getElementById('retreat-content'),
      document.querySelector('.retreat-footer')
    ].filter(Boolean);
    targets.forEach((child) => {
      if (child === iconEditorOverlay) {
        return;
      }
      if (shouldBeInert) {
        contentInertState.set(child, child.hasAttribute('inert'));
        child.inert = true;
        return;
      }
      if (contentInertState.get(child)) {
        child.inert = true;
      } else {
        child.inert = false;
      }
      contentInertState.delete(child);
    });
  }

  function renderIconEditorMessages() {
    if (!iconEditorState) {
      iconEditorSelected.hidden = true;
      iconEditorError.hidden = true;
      return;
    }
    const selectedName = iconEditorState.selectedFileName;
    iconEditorSelected.hidden = !selectedName;
    iconEditorSelected.textContent = selectedName
      ? t('iconEditorCurrentCustomIcon', { name: selectedName })
      : '';
    iconEditorError.hidden = !iconEditorState.errorKey;
    iconEditorError.textContent = iconEditorState.errorKey ? t(iconEditorState.errorKey) : '';
  }

  function renderIconEditorPreview() {
    if (!iconEditorState) {
      return;
    }
    iconEditorPreview.replaceChildren(
      createIconElement(iconEditorState.item, iconEditorState.draftIcon)
    );
    renderIconEditorMessages();
  }

  function syncIconEditorControls() {
    if (!iconEditorState) {
      return;
    }
    const isProcessing = iconEditorState.isProcessing;
    iconEditorDialog.setAttribute('aria-busy', String(isProcessing));
    iconEditorChoose.disabled = isProcessing;
    iconEditorRevert.disabled = isProcessing;
    iconEditorCancel.disabled = isProcessing;
    iconEditorSave.disabled = isProcessing || !iconEditorName.value.trim();
  }

  function openIconEditor(item) {
    if (!isEditing || iconEditorState) {
      return;
    }
    const label = getLabel(item);
    const link = item.querySelector('.retreat-app-link');
    if (!label || !link) {
      return;
    }
    const key = getItemKey(item);
    iconEditorState = {
      item,
      draftIcon: customIconState.get(key) || null,
      selectedFileName: null,
      errorKey: null,
      isProcessing: false
    };
    iconEditorReturnFocus = link;
    iconEditorName.value = label.textContent.trim();
    iconEditorFile.value = '';
    setUnderlyingContentInert(true);
    iconEditorOverlay.hidden = false;
    document.body.classList.add('is-retreat-icon-editor-open');
    renderIconEditorPreview();
    syncIconEditorControls();
    window.requestAnimationFrame(() => {
      iconEditorName.focus();
      iconEditorName.select();
    });
  }

  function closeIconEditor(options = {}) {
    const { restoreFocus = true } = options;
    if (!iconEditorState) {
      return;
    }
    iconEditorState = null;
    iconEditorOverlay.hidden = true;
    iconEditorDialog.removeAttribute('aria-busy');
    document.body.classList.remove('is-retreat-icon-editor-open');
    setUnderlyingContentInert(false);
    const focusTarget = iconEditorReturnFocus;
    iconEditorReturnFocus = null;
    iconEditorFile.value = '';
    requestLiquidRefresh(60);
    if (restoreFocus && focusTarget && focusTarget.isConnected) {
      window.requestAnimationFrame(() => focusTarget.focus());
    }
  }

  function saveIconEditor() {
    if (!iconEditorState || iconEditorState.isProcessing) {
      return;
    }
    const nextName = iconEditorName.value.trim();
    if (!nextName) {
      iconEditorState.errorKey = 'iconEditorMissingName';
      renderIconEditorMessages();
      syncIconEditorControls();
      return;
    }
    const key = getItemKey(iconEditorState.item);
    if (!persistProposedEdit(key, nextName, iconEditorState.draftIcon)) {
      iconEditorState.errorKey = 'iconEditorPersistFailed';
      renderIconEditorMessages();
      return;
    }

    const label = getLabel(iconEditorState.item);
    if (label) {
      label.textContent = nextName;
      label.dataset.userLabel = 'true';
    }
    savedNameState.set(key, nextName);
    if (iconEditorState.draftIcon) {
      customIconState.set(key, iconEditorState.draftIcon);
    } else {
      customIconState.delete(key);
    }
    applyIconToItem(iconEditorState.item, iconEditorState.draftIcon);
    syncLauncherActions();
    announce('iconEditorSavedStatus', { name: nextName });
    closeIconEditor();
  }

  function fileExtension(file) {
    const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/u);
    return match ? match[1] : '';
  }

  function isSupportedIconFile(file) {
    return SUPPORTED_ICON_TYPES.includes(file.type) || SUPPORTED_ICON_EXTENSIONS.includes(fileExtension(file));
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true });
      reader.addEventListener('error', reject, { once: true });
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image), { once: true });
      image.addEventListener('error', reject, { once: true });
      image.src = source;
    });
  }

  async function importIconFile(file) {
    const source = await readFileAsDataURL(file);
    if (file.type === 'image/gif' || fileExtension(file) === 'gif') {
      return {
        dataUrl: source.replace(/^data:[^;,]*;/iu, 'data:image/gif;'),
        contentType: 'image/gif'
      };
    }

    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    canvas.width = ICON_OUTPUT_SIZE;
    canvas.height = ICON_OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    if (!context || !image.naturalWidth || !image.naturalHeight) {
      throw new Error('Image canvas unavailable');
    }
    context.clearRect(0, 0, ICON_OUTPUT_SIZE, ICON_OUTPUT_SIZE);
    const scale = Math.min(
      ICON_OUTPUT_SIZE / image.naturalWidth,
      ICON_OUTPUT_SIZE / image.naturalHeight
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(
      image,
      (ICON_OUTPUT_SIZE - width) / 2,
      (ICON_OUTPUT_SIZE - height) / 2,
      width,
      height
    );
    return { dataUrl: canvas.toDataURL('image/png'), contentType: 'image/png' };
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
    syncLauncherAccessibility();
  }

  function syncLauncherAction(link, isActive) {
    if (!launcherActionState.has(link)) {
      launcherActionState.set(link, Object.fromEntries(
        launcherActionAttributes.map((attribute) => [attribute, link.getAttribute(attribute)])
      ));
    }

    const savedAttributes = launcherActionState.get(link);
    if (isActive) {
      launcherActionAttributes.forEach((attribute) => {
        const value = savedAttributes[attribute];
        if (value === null) {
          link.removeAttribute(attribute);
        } else {
          link.setAttribute(attribute, value);
        }
      });
      return;
    }

    link.removeAttribute('href');
    link.removeAttribute('data-pressable');
    link.removeAttribute('data-transition-direction');
    link.setAttribute('role', 'button');
    link.tabIndex = 0;
    const item = link.closest('[data-launcher-item]');
    const label = item && getLabel(item);
    if (label) {
      link.setAttribute('aria-label', t('editIconLabel', { name: label.textContent.trim() }));
    }
  }

  function syncLauncherActions() {
    items.forEach((item) => {
      const link = item.querySelector('.retreat-app-link');
      if (link) {
        syncLauncherAction(link, !isEditing);
      }
    });
  }

  function setEditing(nextEditing, options = {}) {
    const { focusItem = null } = options;
    const next = Boolean(nextEditing);
    if (next === isEditing) {
      if (next && focusItem) {
        const link = focusItem.querySelector('.retreat-app-link');
        if (link) {
          link.focus();
        }
      }
      return;
    }

    if (!next) {
      closeIconEditor({ restoreFocus: false });
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
      item.draggable = false;
      if (link) {
        link.draggable = false;
      }
    });
    syncLauncherActions();

    syncEditingCopy();
    announce(isEditing ? 'editOnStatus' : 'editOffStatus');
    requestLiquidRefresh(60);

    if (isEditing && focusItem) {
      const link = focusItem.querySelector('.retreat-app-link');
      if (link) {
        link.focus();
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
    const link = item.querySelector('.retreat-app-link');
    if (link) {
      link.focus();
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
      if (Number(item.dataset.page) !== currentPage || item === dragState?.item) {
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
      if (Number(item.dataset.page) !== currentPage) {
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
    if (!placeholder || !target || target === item || Number(target.dataset.page) !== currentPage) {
      return;
    }

    const activePanel = pagePanels[currentPage - 1];
    if (!activePanel) {
      return;
    }
    const visibleSlots = Array.from(activePanel.children).filter((element) => (
      element === placeholder
      || (element.matches('[data-launcher-item]') && element !== item)
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
      if (setPage(Number(dot.dataset.pageTarget))) {
        const activePanel = pagePanels[currentPage - 1];
        if (activePanel && dragState.placeholder) {
          activePanel.append(dragState.placeholder);
        }
      }
      return;
    }

    const target = pointedElement && pointedElement.closest('[data-launcher-item]');
    if (!target || target === dragState.item || Number(target.dataset.page) !== currentPage) {
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
    }
  }

  function bindItem(item) {
    const link = item.querySelector('.retreat-app-link');
    if (!link) {
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
          openIconEditor(item);
        }
      }
    });

    link.addEventListener('keydown', (event) => {
      if (isEditing && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openIconEditor(item);
        return;
      }
      if (isEditing && event.altKey && event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        moveByOffset(item, -1);
      }
      if (isEditing && event.altKey && event.shiftKey && event.key === 'ArrowRight') {
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

  iconEditorClose.addEventListener('click', () => closeIconEditor());
  iconEditorCancel.addEventListener('click', () => closeIconEditor());
  iconEditorSave.addEventListener('click', saveIconEditor);

  iconEditorName.addEventListener('input', () => {
    if (!iconEditorState) {
      return;
    }
    iconEditorState.errorKey = null;
    renderIconEditorMessages();
    syncIconEditorControls();
  });

  iconEditorName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveIconEditor();
    }
  });

  iconEditorChoose.addEventListener('click', () => {
    if (iconEditorState && !iconEditorState.isProcessing) {
      iconEditorFile.click();
    }
  });

  iconEditorRevert.addEventListener('click', () => {
    if (!iconEditorState || iconEditorState.isProcessing) {
      return;
    }
    iconEditorState.draftIcon = null;
    iconEditorState.selectedFileName = null;
    iconEditorState.errorKey = null;
    renderIconEditorPreview();
  });

  iconEditorFile.addEventListener('change', async () => {
    const file = iconEditorFile.files && iconEditorFile.files[0];
    const activeState = iconEditorState;
    if (!file || !activeState) {
      return;
    }
    if (!isSupportedIconFile(file)) {
      activeState.errorKey = 'iconEditorUnsupportedType';
      iconEditorFile.value = '';
      renderIconEditorMessages();
      return;
    }

    activeState.isProcessing = true;
    activeState.errorKey = null;
    syncIconEditorControls();
    renderIconEditorMessages();
    try {
      const imported = await importIconFile(file);
      if (iconEditorState !== activeState) {
        return;
      }
      activeState.draftIcon = imported;
      activeState.selectedFileName = file.name;
      activeState.errorKey = null;
      renderIconEditorPreview();
    } catch (error) {
      if (iconEditorState === activeState) {
        activeState.errorKey = 'iconEditorLoadFailed';
        renderIconEditorMessages();
      }
    } finally {
      if (iconEditorState === activeState) {
        activeState.isProcessing = false;
        iconEditorFile.value = '';
        syncIconEditorControls();
      }
    }
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

  interactionSurface.addEventListener('wheel', handlePageScroll, { passive: false, capture: true });

  window.addEventListener('pointermove', handlePointerMove, { passive: false });
  window.addEventListener('pointerup', handlePointerEnd);
  window.addEventListener('pointercancel', handlePointerEnd);

  document.addEventListener('keydown', (event) => {
    if (iconEditorState) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeIconEditor();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [
          iconEditorName,
          iconEditorChoose,
          iconEditorRevert,
          iconEditorCancel,
          iconEditorSave,
          iconEditorClose
        ].filter((element) => !element.disabled && !element.hidden);
        if (!focusable.length) {
          return;
        }
        const currentIndex = focusable.indexOf(document.activeElement);
        const nextIndex = event.shiftKey
          ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
          : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
        event.preventDefault();
        focusable[nextIndex].focus();
      }
      return;
    }
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
    syncLauncherActions();
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

  snapshotOriginalIcons();
  applyStoredEdits();
  items.forEach(bindItem);
  assignPagesFromOrder();
  renderPage();
  syncLauncherAccessibility();

  window.RetreatLauncher = {
    setEditing,
    setPage,
    reset() {
      window.location.reload();
    },
    getState() {
      return {
        isEditing,
        isIconEditorOpen: Boolean(iconEditorState),
        currentPage,
        order: items.map((item) => item.dataset.launcherItem),
        labels: Object.fromEntries(items.map((item) => [
          item.dataset.launcherItem,
          getLabel(item).textContent.trim()
        ])),
        customIcons: Object.fromEntries(items.map((item) => [
          item.dataset.launcherItem,
          customIconState.has(item.dataset.launcherItem)
        ]))
      };
    }
  };
})();
