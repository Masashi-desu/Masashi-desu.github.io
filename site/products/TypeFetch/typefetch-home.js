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
      manualTitle: 'Press.\nType.\nSend.',
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
  const openButtons = Array.from(document.querySelectorAll('[data-open-callout]'));
  const cancelButton = document.querySelector('[data-cancel-callout]');
  const confirmButton = document.querySelector('[data-confirm-callout]');
  let calloutOpen = callout && callout.getAttribute('aria-hidden') !== 'true';
  let isComposing = false;
  let targetSelection = { start: 0, end: 0 };

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
      window.requestAnimationFrame(() => {
        calloutInput.focus({ preventScroll: true });
      });
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

  recordFallbacks();
  setupLanguageSelector();
  applyLanguage(currentLocale);
  captureTargetSelection({ atEnd: true });
  setCalloutOpen(true, { reset: false, announce: false });

  window.addEventListener('mdw:footer-loaded', () => {
    setupLanguageSelector();
    applyLanguage(currentLocale);
  });
})();
