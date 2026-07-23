(function () {
  const STORAGE_KEY = 'mdw-lang';
  const translations = {
    ja: {
      statusOpened: 'TypeFetchを表示しました。入力して確定してください。',
      statusConfirmed: '「{text}」を記憶したキャレット位置へ挿入しました。',
      statusCanceled: 'キャンセルしました。テキストボックスは変更されません。',
      statusEmpty: '空の入力は反映せず、TypeFetchを閉じました。'
    },
    en: {
      back: 'Back to list',
      manualLink: 'View the controls',
      heroLede: 'Summon it where you want to type.\nOnly the text you confirm moves forward.',
      targetLabel: 'Text field in the frontmost app',
      demoReady: 'Place the caret here, then summon TypeFetch.',
      openButton: 'Show TypeFetch',
      calloutTitle: 'Enter text…',
      calloutSubtitle: 'Confirm to insert it into the frontmost app.',
      calloutLabel: 'Text to send to the frontmost app',
      calloutPlaceholder: 'Start typing here',
      confirmHint: 'to confirm',
      cancelHint: 'to cancel',
      cancelButton: 'Cancel',
      confirmButton: 'Confirm',
      scrollCue: 'Scroll for the controls',
      manualTitleOne: 'Press.',
      manualTitleTwo: 'Type.',
      manualTitleThree: 'Send.',
      manualIntro: 'TypeFetch never interrupts the flow of the frontmost app.\nIt appears only when needed, then disappears when you confirm.',
      moveOneTitle: 'Summon',
      moveOneBody: 'Keep your destination app in front and press the default shortcut.\nYou can choose a different shortcut in Settings.',
      moveTwoTitle: 'Write freely',
      moveTwoBody: 'Type Japanese or multiline text.\nReturn on its own still creates a new line.',
      moveThreeTitle: 'Send forward',
      moveThreeBody: 'Confirm to reactivate the original app and insert at its caret.\nAfter a successful handoff, TypeFetch quietly closes.',
      rulesTitle: 'The line between confirm and cancel.',
      ruleConfirm: 'Inserts at the caret or selection, then closes.',
      ruleCancel: 'Closes the input window without changing anything.',
      ruleEmpty: 'Confirming an empty field is treated as cancel.',
      ruleRetry: 'If insertion fails, the same text returns with the window.',
      showcaseTitle: 'Into the frontmost app, without a break.',
      showcaseBody: 'TypeFetch prioritizes the Accessibility API.\nIf a destination resists, it automatically tries another insertion method.',
      factsTitle: 'Lightweight, local, and fluent in 10 languages.',
      factOsLabel: 'OS',
      factOsValue: 'macOS 13 Ventura or later',
      factResidenceLabel: 'Presence',
      factResidenceValue: 'Lives in the menu bar',
      factLanguageLabel: 'UI languages',
      factLanguageValue: '10 languages including Japanese',
      factPrivacyLabel: 'Privacy',
      factPrivacyValue: 'No analytics or tracking',
      purchaseTitle: 'Remove one step from every input.',
      purchaseBody: 'TypeFetch runs on macOS 13 and later.\nPurchase or download it from itch.io.',
      themeLabel: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      statusOpened: 'TypeFetch is open. Type something, then confirm.',
      statusConfirmed: 'Inserted “{text}” at the remembered caret position.',
      statusCanceled: 'Canceled. The destination text field was not changed.',
      statusEmpty: 'The empty input was ignored and TypeFetch closed.'
    }
  };
  const fallbackCopy = {};
  let currentLocale = resolveLocale(readStoredLanguage() || 'ja');
  let statusState = { key: 'demoReady', variables: null };

  const demo = document.getElementById('tf-demo');
  const callout = document.getElementById('tf-callout');
  const calloutInput = document.getElementById('tf-callout-input');
  const targetInput = document.getElementById('tf-target-input');
  const status = document.getElementById('tf-demo-status');
  const operationStory = document.querySelector('[data-operation-story]');
  const hero = document.getElementById('top');
  const manual = document.getElementById('manual');
  const rules = document.querySelector('.tf-rules');
  const manualMoves = Array.from(document.querySelectorAll('.tf-move'));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const openButtons = Array.from(document.querySelectorAll('[data-open-callout]'));
  const cancelButton = document.querySelector('[data-cancel-callout]');
  const confirmButton = document.querySelector('[data-confirm-callout]');
  let calloutOpen = callout && callout.getAttribute('aria-hidden') !== 'true';
  let isComposing = false;
  let targetSelection = { start: 0, end: 0 };
  let scrollStoryActive = false;
  let scrollStoryFrame = 0;
  let scrollStoryStep = -1;
  let scrollStoryTypedLength = -1;
  let scrollStorySnapshot = null;
  let demoHandoffFrame = 0;
  let demoMotionTimer = 0;
  let demoSurfaceAnimation = null;
  let demoApproachLift = 0;

  function resolveLocale(locale) {
    return locale === 'en' ? 'en' : 'ja';
  }

  function readStoredLanguage() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function recordFallbacks() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      if (!key || Object.prototype.hasOwnProperty.call(fallbackCopy, key)) {
        return;
      }
      fallbackCopy[key] = element.textContent.replace(/^\s+|\s+$/gu, '');
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (!key || Object.prototype.hasOwnProperty.call(fallbackCopy, key)) {
        return;
      }
      fallbackCopy[key] = element.getAttribute('placeholder') || '';
    });
  }

  function resolveCopy(key) {
    const localized = translations[currentLocale] && translations[currentLocale][key];
    return typeof localized === 'string' ? localized : fallbackCopy[key];
  }

  function formatCopy(copy, variables) {
    if (typeof copy !== 'string' || !variables) {
      return copy || '';
    }
    return copy.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, key) => (
      Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
    ));
  }

  function syncLanguageSelects(lang) {
    document.querySelectorAll('.lang-select').forEach((select) => {
      if (select.value !== lang) {
        select.value = lang;
      }
    });
  }

  function renderStatus() {
    if (!status || !statusState) {
      return;
    }
    const copy = resolveCopy(statusState.key);
    status.textContent = formatCopy(copy, statusState.variables);
  }

  function setStatus(key, variables) {
    statusState = { key, variables: variables || null };
    renderStatus();
  }

  function applyLanguage(locale) {
    recordFallbacks();
    currentLocale = resolveLocale(locale);
    document.documentElement.lang = currentLocale;

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      const copy = key ? resolveCopy(key) : null;
      if (typeof copy === 'string') {
        element.textContent = copy;
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder');
      const copy = key ? resolveCopy(key) : null;
      if (typeof copy === 'string') {
        element.setAttribute('placeholder', copy);
      }
    });

    syncLanguageSelects(currentLocale);
    renderStatus();
    try {
      localStorage.setItem(STORAGE_KEY, currentLocale);
    } catch (error) {
      /* Language persistence is optional. */
    }
    if (window.MDWProductBacklink) {
      window.MDWProductBacklink.sync(currentLocale);
    }
    scheduleScrollStoryUpdate();
    return currentLocale;
  }

  function setupLanguageSelector() {
    document.querySelectorAll('.lang-select').forEach((select) => {
      if (select.dataset.bound === 'true') {
        select.value = currentLocale;
        return;
      }
      select.dataset.bound = 'true';
      select.addEventListener('change', (event) => applyLanguage(event.target.value));
      select.value = currentLocale;
    });
  }

  function clampSelectionOffset(offset, textLength) {
    const numericOffset = Number.isFinite(offset) ? offset : textLength;
    return Math.min(Math.max(numericOffset, 0), textLength);
  }

  function captureTargetSelection(options) {
    if (!targetInput) {
      return;
    }
    const settings = options || {};
    const textLength = targetInput.value.length;
    if (settings.atEnd === true) {
      targetSelection = { start: textLength, end: textLength };
      targetInput.setSelectionRange(textLength, textLength);
      return;
    }

    const start = clampSelectionOffset(targetInput.selectionStart, textLength);
    const end = clampSelectionOffset(targetInput.selectionEnd, textLength);
    targetSelection = {
      start: Math.min(start, end),
      end: Math.max(start, end)
    };
  }

  function setCalloutOpen(nextOpen, options) {
    if (!callout || !demo || !calloutInput) {
      return;
    }
    const settings = options || {};
    calloutOpen = nextOpen;
    demo.dataset.calloutOpen = String(nextOpen);
    callout.setAttribute('aria-hidden', String(!nextOpen));
    callout.inert = !nextOpen;

    if (nextOpen) {
      if (settings.reset !== false) {
        calloutInput.value = '';
      }
      if (settings.announce !== false) {
        setStatus('statusOpened');
      }
      if (settings.focus !== false) {
        window.requestAnimationFrame(() => {
          calloutInput.focus({ preventScroll: true });
        });
      }
    }
  }

  function openCallout() {
    captureTargetSelection();
    setCalloutOpen(true, { reset: true, announce: true });
  }

  function restoreTargetFocus() {
    if (!targetInput) {
      return;
    }
    const textLength = targetInput.value.length;
    const start = clampSelectionOffset(targetSelection.start, textLength);
    const end = clampSelectionOffset(targetSelection.end, textLength);
    targetInput.focus({ preventScroll: true });
    targetInput.setSelectionRange(start, end);
  }

  function cancelCallout(reason, options) {
    if (!calloutOpen) {
      return;
    }
    const settings = options || {};
    setCalloutOpen(false, { announce: false });
    setStatus(reason === 'empty' ? 'statusEmpty' : 'statusCanceled');
    if (settings.restoreFocus !== false) {
      window.requestAnimationFrame(restoreTargetFocus);
    }
  }

  function previewText(value) {
    const singleLine = value.replace(/\s+/gu, ' ').trim();
    if (!singleLine) {
      return value.length > 12 ? `${value.slice(0, 12)}…` : value;
    }
    return singleLine.length > 30 ? `${singleLine.slice(0, 30)}…` : singleLine;
  }

  function confirmCallout() {
    if (!calloutOpen || !calloutInput || !targetInput) {
      return;
    }
    const nextValue = calloutInput.value;
    if (nextValue.length === 0) {
      cancelCallout('empty');
      return;
    }

    const currentValue = targetInput.value;
    const start = clampSelectionOffset(targetSelection.start, currentValue.length);
    const end = clampSelectionOffset(targetSelection.end, currentValue.length);
    targetInput.value = `${currentValue.slice(0, start)}${nextValue}${currentValue.slice(end)}`;
    const nextCaret = start + nextValue.length;
    targetInput.classList.remove('is-updated');
    void targetInput.offsetWidth;
    targetInput.classList.add('is-updated');
    window.setTimeout(() => targetInput.classList.remove('is-updated'), 700);
    setCalloutOpen(false, { announce: false });
    setStatus('statusConfirmed', { text: previewText(nextValue) });
    window.requestAnimationFrame(() => {
      targetInput.focus({ preventScroll: true });
      targetInput.setSelectionRange(nextCaret, nextCaret);
      captureTargetSelection();
    });
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function getScrollStorySample() {
    return currentLocale === 'en'
      ? 'The text moves to the frontmost app.'
      : '入力した文字を、前面へ。';
  }

  function joinScrollStoryTargetValue(targetValue, sample) {
    if (!targetValue || /\s$/u.test(targetValue)) {
      return `${targetValue}${sample}`;
    }
    return `${targetValue} ${sample}`;
  }

  function captureScrollStorySnapshot() {
    if (!targetInput || !calloutInput) {
      return null;
    }
    return {
      targetValue: targetInput.value,
      calloutValue: calloutInput.value,
      calloutOpen,
      selection: { ...targetSelection },
      status: statusState ? {
        key: statusState.key,
        variables: statusState.variables ? { ...statusState.variables } : null
      } : null
    };
  }

  function setScrollStoryTargetValue(value, flash) {
    if (!targetInput) {
      return;
    }
    if (targetInput.value !== value) {
      targetInput.value = value;
    }
    const nextCaret = value.length;
    targetSelection = { start: nextCaret, end: nextCaret };
    targetInput.setSelectionRange(nextCaret, nextCaret);
    targetInput.scrollTop = 0;
    targetInput.scrollLeft = 0;

    if (flash) {
      targetInput.classList.remove('is-updated');
      void targetInput.offsetWidth;
      targetInput.classList.add('is-updated');
      return;
    }
    targetInput.classList.remove('is-updated');
  }

  function restoreScrollStorySnapshot() {
    if (!scrollStorySnapshot || !targetInput || !calloutInput) {
      return;
    }

    targetInput.value = scrollStorySnapshot.targetValue;
    calloutInput.value = scrollStorySnapshot.calloutValue;
    targetSelection = { ...scrollStorySnapshot.selection };
    targetInput.setSelectionRange(targetSelection.start, targetSelection.end);
    targetInput.classList.remove('is-updated');
    setCalloutOpen(scrollStorySnapshot.calloutOpen, {
      reset: false,
      announce: false,
      focus: false
    });
    statusState = scrollStorySnapshot.status;
    renderStatus();
    scrollStorySnapshot = null;
    scrollStoryStep = -1;
    scrollStoryTypedLength = -1;
  }

  function renderScrollStoryStep(stepIndex, typingProgress) {
    if (!scrollStorySnapshot || !calloutInput || !targetInput) {
      return;
    }

    const sample = getScrollStorySample();
    const nextTypedLength = stepIndex === 0
      ? 0
      : stepIndex === 1
        ? (reducedMotion.matches ? sample.length : Math.round(sample.length * typingProgress))
        : sample.length;
    const stepChanged = stepIndex !== scrollStoryStep;

    if (stepChanged || nextTypedLength !== scrollStoryTypedLength) {
      calloutInput.value = sample.slice(0, nextTypedLength);
      scrollStoryTypedLength = nextTypedLength;
    }

    if (stepIndex < 2) {
      setCalloutOpen(true, {
        reset: false,
        announce: false,
        focus: false
      });
      setScrollStoryTargetValue(scrollStorySnapshot.targetValue, false);
      setStatus('statusOpened');
    } else {
      setCalloutOpen(false, {
        reset: false,
        announce: false,
        focus: false
      });
      setScrollStoryTargetValue(
        joinScrollStoryTargetValue(scrollStorySnapshot.targetValue, sample),
        stepChanged
      );
      setStatus('statusConfirmed', { text: previewText(sample) });
    }

    manualMoves.forEach((move, index) => {
      move.classList.toggle('is-current', index === stepIndex);
      if (index === stepIndex) {
        move.setAttribute('aria-current', 'step');
      } else {
        move.removeAttribute('aria-current');
      }
    });
    operationStory.dataset.storyStep = String(stepIndex + 1);
    scrollStoryStep = stepIndex;
  }

  function setDemoFixedRect(rect) {
    Object.entries({
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      minHeight: '0',
      margin: '0',
      transform: 'none'
    }).forEach(([property, value]) => {
      demo.style[property] = value;
    });
  }

  function clearDemoFixedRect() {
    ['position', 'top', 'left', 'width', 'height', 'min-height', 'margin', 'transform']
      .forEach((property) => demo.style.removeProperty(property));
  }

  function readActiveDemoRect() {
    const style = window.getComputedStyle(demo);
    const width = Number.parseFloat(style.width);
    const height = Number.parseFloat(style.height);
    const centerX = Number.parseFloat(style.left);
    const centerY = Number.parseFloat(style.top);
    return {
      top: centerY - height / 2,
      left: centerX - width / 2,
      width,
      height
    };
  }

  function clearDemoTransitionHandles() {
    if (demoHandoffFrame) {
      window.cancelAnimationFrame(demoHandoffFrame);
      demoHandoffFrame = 0;
    }
    if (demoMotionTimer) {
      window.clearTimeout(demoMotionTimer);
      demoMotionTimer = 0;
    }
    if (demoSurfaceAnimation) {
      demoSurfaceAnimation.cancel();
      demoSurfaceAnimation = null;
    }
  }

  function animateDemoSurface(surface, fromTransform) {
    if (!surface) {
      return;
    }
    surface.style.removeProperty('transform');
    const targetTransform = window.getComputedStyle(surface).transform;
    surface.style.transform = fromTransform;
    surface.getBoundingClientRect();
    demoSurfaceAnimation = surface.animate(
      [
        { transform: fromTransform },
        { transform: targetTransform }
      ],
      {
        duration: 420,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both'
      }
    );
  }

  function finishDemoMotion(direction) {
    demoMotionTimer = 0;
    operationStory.classList.add('is-demo-measuring');
    operationStory.classList.remove('is-demo-handoff', 'is-demo-moving', 'is-demo-returning');
    if (direction === 'return') {
      operationStory.classList.remove('is-manual-active');
    }
    clearDemoFixedRect();
    const surface = demo.querySelector('.tf-demo__surface');
    surface?.style.removeProperty('transform');
    if (demoSurfaceAnimation) {
      demoSurfaceAnimation.cancel();
      demoSurfaceAnimation = null;
    }
    demo.getBoundingClientRect();
    operationStory.classList.remove('is-demo-measuring');
  }

  function startDemoForwardMotion() {
    const surface = demo.querySelector('.tf-demo__surface');
    const startRect = demo.getBoundingClientRect();
    const startSurfaceTransform = surface ? window.getComputedStyle(surface).transform : 'none';
    clearDemoTransitionHandles();

    operationStory.classList.add('is-demo-measuring', 'is-manual-active');
    operationStory.classList.remove('is-demo-moving', 'is-demo-returning');
    clearDemoFixedRect();
    const targetRect = readActiveDemoRect();
    setDemoFixedRect(startRect);
    if (surface) {
      surface.style.transform = startSurfaceTransform;
    }
    operationStory.classList.add('is-demo-handoff');
    operationStory.classList.remove('is-demo-measuring');
    demo.getBoundingClientRect();

    if (reducedMotion.matches) {
      finishDemoMotion('forward');
      return;
    }

    demoHandoffFrame = window.requestAnimationFrame(() => {
      demoHandoffFrame = 0;
      operationStory.classList.remove('is-demo-handoff');
      operationStory.classList.add('is-demo-moving');
      animateDemoSurface(surface, startSurfaceTransform);
      setDemoFixedRect(targetRect);
      demoMotionTimer = window.setTimeout(() => finishDemoMotion('forward'), 460);
    });
  }

  function startDemoReturnMotion() {
    const surface = demo.querySelector('.tf-demo__surface');
    const startRect = demo.getBoundingClientRect();
    const startSurfaceTransform = surface ? window.getComputedStyle(surface).transform : 'none';
    clearDemoTransitionHandles();

    operationStory.classList.add('is-demo-measuring');
    operationStory.classList.remove(
      'is-demo-handoff',
      'is-demo-moving',
      'is-demo-returning',
      'is-manual-active'
    );
    clearDemoFixedRect();
    surface?.style.removeProperty('transform');
    const targetRect = demo.getBoundingClientRect();

    operationStory.classList.add('is-manual-active');
    setDemoFixedRect(startRect);
    if (surface) {
      surface.style.transform = startSurfaceTransform;
    }
    demo.getBoundingClientRect();
    operationStory.classList.remove('is-demo-measuring');

    if (reducedMotion.matches) {
      finishDemoMotion('return');
      return;
    }

    demoHandoffFrame = window.requestAnimationFrame(() => {
      demoHandoffFrame = 0;
      operationStory.classList.add('is-demo-moving', 'is-demo-returning');
      animateDemoSurface(surface, startSurfaceTransform);
      setDemoFixedRect(targetRect);
      demoMotionTimer = window.setTimeout(() => finishDemoMotion('return'), 460);
    });
  }

  function syncDemoPresentation(storyIsVisible, returningToHero) {
    if (!operationStory || !demo) {
      return;
    }

    if (storyIsVisible) {
      if (
        operationStory.classList.contains('is-manual-active')
        && !operationStory.classList.contains('is-demo-returning')
      ) {
        return;
      }
      startDemoForwardMotion();
      return;
    }

    if (!operationStory.classList.contains('is-manual-active')) {
      clearDemoTransitionHandles();
      return;
    }

    if (!returningToHero) {
      clearDemoTransitionHandles();
      operationStory.classList.add('is-demo-measuring');
      operationStory.classList.remove(
        'is-demo-handoff',
        'is-demo-moving',
        'is-demo-returning',
        'is-manual-active'
      );
      clearDemoFixedRect();
      demo.querySelector('.tf-demo__surface')?.style.removeProperty('transform');
      demo.getBoundingClientRect();
      operationStory.classList.remove('is-demo-measuring');
      return;
    }

    if (!operationStory.classList.contains('is-demo-returning')) {
      startDemoReturnMotion();
    }
  }

  function syncHeroDemoApproach(viewportHeight, topbarHeight, manualRect) {
    if (
      !demo
      || !callout
      || operationStory.classList.contains('is-manual-active')
    ) {
      return;
    }

    const demoRect = demo.getBoundingClientRect();
    const calloutRect = callout.getBoundingClientRect();
    const safeTop = topbarHeight + 12;
    const safeBottom = viewportHeight - 12;
    const availableHeight = safeBottom - safeTop;
    const demoFitsViewport = demoRect.height <= availableHeight;
    const focusRect = demoFitsViewport ? demoRect : calloutRect;
    const unshiftedTop = focusRect.top + demoApproachLift;
    const unshiftedBottom = focusRect.bottom + demoApproachLift;
    const requiredLift = Math.max(0, unshiftedBottom - safeBottom);
    const availableLift = Math.max(0, unshiftedTop - safeTop);
    const targetLift = Math.min(requiredLift, availableLift);
    const heroHeight = hero.getBoundingClientRect().height;
    const approachRunway = Math.max(heroHeight - viewportHeight, 1);
    const approachProgress = clamp(
      (heroHeight - manualRect.top) / approachRunway,
      0,
      1
    );

    demoApproachLift = targetLift * approachProgress;
    demo.style.setProperty('--tf-demo-approach-y', `${-demoApproachLift}px`);
    operationStory.style.setProperty('--tf-demo-approach-progress', String(approachProgress));
  }

  function syncScrollStory() {
    scrollStoryFrame = 0;
    if (!operationStory || !hero || !manual || manualMoves.length !== 3) {
      return;
    }

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const topbarHeight = document.querySelector('.tf-topbar')?.getBoundingClientRect().height || 0;
    const manualRect = manual.getBoundingClientRect();
    const storyEndBottom = rules?.getBoundingClientRect().bottom ?? manualRect.bottom;
    // Keep the hero demo operable until the next section has reached the
    // viewport center. This prevents a shallow scroll on short displays from
    // immediately handing control to the automatic story.
    const storyHandoffLine = Math.max(topbarHeight, viewportHeight * 0.5);
    const storyIsVisible = manualRect.top <= storyHandoffLine && storyEndBottom > topbarHeight;
    syncHeroDemoApproach(viewportHeight, topbarHeight, manualRect);
    scrollStoryActive = storyIsVisible;
    syncDemoPresentation(
      storyIsVisible,
      manualRect.top >= storyHandoffLine - 1
    );
    hero.inert = storyIsVisible;
    status?.setAttribute('aria-live', storyIsVisible ? 'off' : 'polite');

    if (!storyIsVisible) {
      manualMoves.forEach((move) => {
        move.classList.remove('is-current');
        move.removeAttribute('aria-current');
      });
      if (manualRect.top >= storyHandoffLine - 1) {
        restoreScrollStorySnapshot();
        delete operationStory.dataset.storyStep;
      }
      return;
    }

    if (!scrollStorySnapshot) {
      scrollStorySnapshot = captureScrollStorySnapshot();
    }

    const activationLine = viewportHeight * 0.72;
    let stepIndex = 0;
    const moveTriggerRects = manualMoves.map((move) => (
      move.querySelector('.tf-move__key') || move
    ).getBoundingClientRect());
    if (moveTriggerRects[2].top <= activationLine) {
      stepIndex = 2;
    } else if (moveTriggerRects[1].top <= activationLine) {
      stepIndex = 1;
    }

    const typingDistance = Math.max(viewportHeight * 0.5, 240);
    const typingProgress = clamp(
      (activationLine - moveTriggerRects[1].top) / typingDistance,
      0,
      1
    );
    operationStory.style.setProperty('--tf-story-progress', String(typingProgress));
    renderScrollStoryStep(stepIndex, typingProgress);
  }

  function scheduleScrollStoryUpdate() {
    if (scrollStoryFrame) {
      return;
    }
    scrollStoryFrame = window.requestAnimationFrame(syncScrollStory);
  }

  function hasOnlyModifiers(event, required) {
    return event.metaKey === Boolean(required.meta)
      && event.shiftKey === Boolean(required.shift)
      && event.altKey === Boolean(required.alt)
      && event.ctrlKey === Boolean(required.ctrl);
  }

  openButtons.forEach((button) => button.addEventListener('click', openCallout));
  cancelButton?.addEventListener('click', () => cancelCallout('cancel'));
  confirmButton?.addEventListener('click', confirmCallout);

  targetInput?.addEventListener('select', () => captureTargetSelection());
  targetInput?.addEventListener('keyup', () => captureTargetSelection());
  targetInput?.addEventListener('pointerup', () => captureTargetSelection());
  targetInput?.addEventListener('input', () => captureTargetSelection());

  calloutInput?.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  calloutInput?.addEventListener('compositionend', () => {
    isComposing = false;
  });

  document.addEventListener('keydown', (event) => {
    if (scrollStoryActive) {
      return;
    }

    const isShowShortcut = (event.key === ' ' || event.code === 'Space')
      && hasOnlyModifiers(event, { meta: true, shift: true });
    if (isShowShortcut) {
      event.preventDefault();
      if (calloutOpen) {
        cancelCallout('cancel');
      } else {
        openCallout();
      }
      return;
    }

    if (!calloutOpen) {
      return;
    }

    const isCancelShortcut = event.key === 'Escape'
      && hasOnlyModifiers(event, {});
    if (isCancelShortcut) {
      event.preventDefault();
      cancelCallout('cancel');
      return;
    }

    const isConfirmShortcut = event.key === 'Enter'
      && hasOnlyModifiers(event, { meta: true });
    if (isConfirmShortcut && !isComposing && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      confirmCallout();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (scrollStoryActive) {
      return;
    }
    if (!calloutOpen || !callout || callout.contains(event.target)) {
      return;
    }
    if (openButtons.some((button) => button.contains(event.target))) {
      return;
    }
    cancelCallout('cancel', { restoreFocus: false });
  });

  window.TypeFetchDemo = {
    open: openCallout,
    confirm: confirmCallout,
    cancel: () => cancelCallout('cancel'),
    get isOpen() {
      return calloutOpen;
    }
  };

  window.TypeFetchScrollStory = {
    update: syncScrollStory,
    getState() {
      return {
        active: scrollStoryActive,
        step: scrollStoryStep + 1,
        typedLength: scrollStoryTypedLength
      };
    }
  };

  recordFallbacks();
  setupLanguageSelector();
  applyLanguage(currentLocale);
  captureTargetSelection({ atEnd: true });
  setCalloutOpen(true, { reset: false, announce: false });
  window.addEventListener('scroll', scheduleScrollStoryUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollStoryUpdate);
  window.addEventListener('pageshow', scheduleScrollStoryUpdate);
  reducedMotion.addEventListener?.('change', scheduleScrollStoryUpdate);
  scheduleScrollStoryUpdate();

  window.addEventListener('mdw:footer-loaded', () => {
    setupLanguageSelector();
    applyLanguage(currentLocale);
  });
})();
