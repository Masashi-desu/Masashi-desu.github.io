(function () {
  const STORAGE_KEY = 'mdw-lang';
  const translations = {
    ja: {
      editHint: 'アイコンをドラッグして並べ替え、押すと名前や画像を変更できます。',
      done: '完了',
      editIconLabel: '{name} の名前と画像を編集',
      editOnStatus: '編集モードです。アイコンをドラッグして並べ替え、押すと名前や画像を変更できます。',
      editOffStatus: '編集を完了しました。',
      movedStatus: '{name} を移動しました。',
      renamedStatus: '{name} に名前を変更しました。',
      iconEditorClose: '閉じる',
      iconEditorNameLabel: 'アイコン名',
      iconEditorNamePlaceholder: 'ホーム画面に表示する名前',
      iconEditorNameHint: '保存するとランチャー上の表示名も更新されます。',
      iconEditorFileImportHint: 'Finder から PNG / JPG / GIF / SVG を選択するとコピーが保存され、元ファイル移動後も表示されます。',
      iconEditorRecommendedSize: '推奨サイズ: 192pt (Retina 384px 相当)',
      iconEditorSaveFormat: 'PNG / JPG / SVG は透過 PNG として保存されます。',
      iconEditorSupportedFormats: '対応形式: PNG / JPG / GIF / SVG',
      iconEditorCurrentCustomIcon: '現在のカスタムアイコン: {name}',
      iconEditorChoose: 'Finder から選択',
      iconEditorRevert: '元の参照アイコンに戻す',
      iconEditorCancel: 'キャンセル',
      iconEditorSave: '保存',
      iconEditorMissingName: 'アイコン名を入力してください。',
      iconEditorUnsupportedType: 'PNG / JPG / GIF / SVG のみ選択できます。',
      iconEditorLoadFailed: '画像を読み込めませんでした。ファイルが壊れていないか確認してください。',
      iconEditorPersistFailed: '変更を保存できませんでした。画像サイズを小さくして再度お試しください。',
      iconEditorSavedStatus: '{name} の名前とアイコンを保存しました。',
      pageStatus: '{page}ページ目を表示しています。',
      titleRenameLabel: 'ページ名を変更',
      pageOneLabel: '1ページ目',
      pageTwoLabel: '2ページ目'
    },
    en: {
      title: 'RetreatScreen',
      edit: 'Edit',
      done: 'Done',
      editHint: 'Drag icons to reorder them, then press one to change its name or image.',
      launcherDownload: 'Mac App Store',
      launcherFeatures: 'Features',
      launcherFlow: 'Flow',
      launcherSpecs: 'Tech Specs',
      launcherPrivacy: 'Privacy',
      launcherSupport: 'Support',
      launcherPreview: 'Preview',
      launcherProducts: 'Products',
      showcaseLabel: 'Live View',
      showcaseTitle: 'A quiet retreat, the moment you summon it.',
      lede: 'Press ⌘⇧Space to summon a full-screen, iOS-style launcher without breaking your flow.\nIt lives as an accessory app and jumps you to apps or files instantly.',
      featureLabel: 'Key Features',
      featureTitle: 'A launcher with zero friction',
      featureBody: 'RetreatScreen stays resident as an accessory app and appears only when you call it.\nOpen with your shortcut, dismiss with Esc or the same key—keep focus on your work.',
      f1Title: 'Hotkey toggle',
      f1Body: 'Show or hide the overlay with ⌘⇧Space. It auto-dismisses when focus leaves, so your desktop stays clean.',
      f2Title: 'Editable grid',
      f2Body: 'Long-press or tap “Edit” to enter edit mode. Drag to reorder, add with the + button, delete only via the × button, and later rename items or set custom icons.',
      f3Title: 'Glass retreat home screen',
      f3Body: 'A glassy card layout turns the grid into a vacation home for your favorites—arrange them like your own home screen and recall them with a calm, beautiful overlay.',
      flowLabel: 'Flow',
      flowTitle: 'From summon to edit',
      step1Title: 'Summon with ⌘⇧Space',
      step1Body: 'A blurred full-screen overlay appears. Close with Esc or the same shortcut.',
      step2Title: 'Launch apps/files',
      step2Body: 'Click icons to open targets. Use the context menu to reveal in Finder.',
      step3Title: 'Tidy in Edit Mode',
      step3Body: 'Drag to reorder in edit mode, add with +, delete only with ×. Rename items or assign icons later.',
      specLabel: 'Tech Specs',
      specTitle: 'Compatibility & care',
      specBody: 'Made to feel effortless on the latest macOS. It appears only when you need it and keeps your data on your Mac.',
      specOSLabel: 'OS',
      specOS: 'macOS Tahoe or later',
      specChipLabel: 'Chip',
      specChip: 'Apple silicon / Intel',
      specHotkeyLabel: 'Hotkey',
      specHotkey: '⌘⇧Space (customizable)',
      specFocusLabel: 'Focus mode',
      specFocus: 'Planned in a future update',
      careTitle: 'Feel-good details',
      careBody: '• Full-screen overlay that stays out of the way when you’re working.\n• Shortcuts and layouts live only on your Mac—no cloud syncing.\n• A simple first-run guide so you’re ready in moments.',
      ctaLabel: 'Get Ready',
      ctaTitle: 'Turn your desktop into a home screen',
      ctaBody: 'RetreatScreen is a jump pad that resets window chaos and gets you moving again.',
      privacyPolicyLink: 'Privacy Policy',
      supportLink: 'Support',
      backToLauncher: 'Back to launcher',
      themeLabel: 'Theme',
      themeSystem: 'System',
      themeLight: 'Light',
      themeDark: 'Dark',
      editIconLabel: 'Edit the name and image for {name}',
      editOnStatus: 'Edit mode is on. Drag icons to reorder them, then press one to change its name or image.',
      editOffStatus: 'Editing finished.',
      movedStatus: 'Moved {name}.',
      renamedStatus: 'Renamed to {name}.',
      iconEditorClose: 'Close',
      iconEditorNameLabel: 'Icon name',
      iconEditorNamePlaceholder: 'Name shown on the launcher',
      iconEditorNameHint: 'Saving updates the launcher label.',
      iconEditorFileImportHint: 'Choose PNG / JPG / GIF / SVG from Finder to copy the image and keep showing it even after moving the original file.',
      iconEditorRecommendedSize: 'Recommended size: 192pt (Retina 384px)',
      iconEditorSaveFormat: 'PNG / JPG / SVG are saved as transparent PNG.',
      iconEditorSupportedFormats: 'Supported formats: PNG / JPG / GIF / SVG',
      iconEditorCurrentCustomIcon: 'Current custom icon: {name}',
      iconEditorChoose: 'Choose from Finder',
      iconEditorRevert: 'Revert to original icon',
      iconEditorCancel: 'Cancel',
      iconEditorSave: 'Save',
      iconEditorMissingName: 'Enter an icon name.',
      iconEditorUnsupportedType: 'Choose a PNG, JPG, GIF, or SVG file.',
      iconEditorLoadFailed: 'The image could not be loaded. Check that the file is not damaged.',
      iconEditorPersistFailed: 'The changes could not be saved. Try again with a smaller image.',
      iconEditorSavedStatus: 'Saved the name and icon for {name}.',
      pageStatus: 'Showing page {page}.',
      titleRenameLabel: 'Rename page',
      pageOneLabel: 'Page 1',
      pageTwoLabel: 'Page 2'
    }
  };
  const fallbackCopy = {};
  let currentLocale = resolveLocale(readStoredLanguage() || 'ja');

  function recordFallbacks() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      if (!key || Object.prototype.hasOwnProperty.call(fallbackCopy, key)) {
        return;
      }
      fallbackCopy[key] = element.textContent.replace(/^\s+|\s+$/gu, '');
    });
  }

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

  function resolveLocalizedCopy(lang, key) {
    const localized = translations[lang] && translations[lang][key];
    return typeof localized === 'string' ? localized : fallbackCopy[key];
  }

  function formatCopy(copy, variables) {
    if (typeof copy !== 'string' || !variables) {
      return copy;
    }
    return copy.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, key) => (
      Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
    ));
  }

  function getCopy(key, variables) {
    recordFallbacks();
    return formatCopy(resolveLocalizedCopy(currentLocale, key), variables) || '';
  }

  function syncLanguageSelects(lang) {
    document.querySelectorAll('.lang-select').forEach((select) => {
      if (select.value !== lang) {
        select.value = lang;
      }
    });
  }

  function applyLanguage(locale) {
    recordFallbacks();
    const lang = resolveLocale(locale);
    currentLocale = lang;
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      if (element.dataset.userLabel === 'true') {
        return;
      }
      const key = element.getAttribute('data-i18n');
      if (!key) {
        return;
      }
      const text = resolveLocalizedCopy(lang, key);
      if (typeof text === 'string') {
        element.textContent = text;
      }
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
      const key = element.getAttribute('data-i18n-aria-label');
      const ariaLabel = key ? resolveLocalizedCopy(lang, key) : null;
      if (typeof ariaLabel === 'string') {
        element.setAttribute('aria-label', ariaLabel);
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder');
      const placeholder = key ? resolveLocalizedCopy(lang, key) : null;
      if (typeof placeholder === 'string') {
        element.setAttribute('placeholder', placeholder);
      }
    });

    syncLanguageSelects(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (error) {
      /* Language persistence is optional. */
    }

    if (window.MDWProductBacklink) {
      window.MDWProductBacklink.sync(lang);
    }
    window.dispatchEvent(new CustomEvent('retreat:language-applied', { detail: { lang } }));
    return lang;
  }

  function setupLanguageSelector() {
    document.querySelectorAll('.lang-select').forEach((select) => {
      if (select.dataset.bound === 'true') {
        select.value = currentLocale;
        return;
      }
      select.dataset.bound = 'true';
      select.addEventListener('change', (event) => {
        applyLanguage(event.target.value);
      });
      select.value = currentLocale;
    });
  }

  window.RetreatI18n = {
    apply: applyLanguage,
    get: getCopy,
    get language() {
      return currentLocale;
    }
  };

  setupLanguageSelector();
  applyLanguage(currentLocale);

  window.addEventListener('mdw:footer-loaded', () => {
    setupLanguageSelector();
    applyLanguage(currentLocale);
  });
})();
