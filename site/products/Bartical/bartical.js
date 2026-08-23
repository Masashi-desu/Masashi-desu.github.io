const STORAGE_KEY = 'mdw-lang';
const ABOUT_VERSION_FALLBACK = '1.0.0(1)';
const SPARKLE_NAMESPACE = 'http://www.andymatuschak.org/xml-namespaces/sparkle';
let aboutVersion = ABOUT_VERSION_FALLBACK;
const GROUPED_ITEM_ORDER = Object.freeze([
  'how-it-works',
  'customize',
  'privacy',
  'requirements',
  'coming-soon',
  'theme'
]);
const translations = {
  ja: {
    sourceNavigation: '{section}を表示',
    sourceClose: 'メニューを閉じる',
    statusSourceOpen: 'アンカーと元項目を一時表示し、{section}の元メニューを開いています。',
    placementCalendar: 'カレンダー',
    placementCloud: 'クラウド',
    placementBell: '通知',
    placementWifi: 'Wi-Fi',
    placementMembership: '{boundary}に所属しています',
    placementMembershipTooltip: 'に所属しています',
    placementUnassigned: 'どの境界にも所属していません',
    placementItemDescription: '{item}。{membership}。⌘ドラッグで移動できます。',
    placementMoved: '{item}を移動しました。{membership}。'
  },
  en: {
    back: 'Back to list',
    backAria: 'Back to the product list',
    topAria: 'Back to the Bartical top',
    launchersAria: 'Bartical launchers',
    launcherThreeAria: 'Bartical 3 launcher',
    launcherTwoAria: 'Bartical 2 launcher',
    launcherMainAria: 'Bartical main launcher',
    anchorThreeAria: 'Bartical 3 configuration anchor',
    anchorTwoAria: 'Bartical 2 configuration anchor',
    anchorMainAria: 'Bartical main configuration anchor',
    menuThreeAria: 'Items grouped in Bartical 3',
    menuTwoAria: 'Items grouped in Bartical 2',
    menuMainAria: 'Items grouped in Bartical',
    otherAppsAria: 'Other menu bar apps',
    activationStripAria: 'Temporarily restored configuration anchors, original items, and launchers',
    activationAnchorsAria: 'Configuration anchors',
    originalItemsAria: 'Restored original menu bar items',
    activationLaunchersAria: 'Bartical launchers kept available',
    sourceMenuAria: 'Original app menu',
    heroSimulationAria: 'Bartical menu bar simulation',
    aboutWindowControlsAria: 'Window controls',
    aboutCloseAria: 'Close About',
    aboutWindowTitle: 'About Bartical',
    aboutVersionLabel: 'Version',
    aboutCopyrightLabel: 'Copyright',
    aboutWebsiteLabel: 'Website',
    themeSettingsAria: 'Open the original display theme item',
    themeSettingsLabel: 'Display settings',
    navOverview: 'Overview',
    navHow: 'How it works',
    navCustomize: 'Customize',
    navPrivacy: 'Privacy',
    navRequirements: 'Requirements',
    navComing: 'Get Bartical',
    navHowAria: 'Open the original How it works item',
    navCustomizeAria: 'Open the original Customize item',
    navPrivacyAria: 'Open the original Privacy item',
    navRequirementsAria: 'Open the original Requirements item',
    navComingAria: 'Open the original Get Bartical item',
    sourceNavigation: 'Show {section}',
    sourceClose: 'Close menu',
    heroTitle: 'Put a crowded menu bar away vertically.',
    heroLede: 'Items placed to the left of a boundary are grouped automatically from their physical positions.',
    heroPrompt: 'Press any of the three launchers above to try the vertical menu.',
    statusMainOpen: 'The main launcher menu is open.',
    statusAboutOpen: 'The main launcher and About are open. Version {version}.',
    statusTwoOpen: 'Bartical 2 is open with three grouped items.',
    statusThreeOpen: 'Bartical 3 is open with three grouped items.',
    statusClosed: 'The Bartical menu is closed.',
    statusSourceOpen: 'Configuration anchors and original items are temporarily visible. The original menu for {section} is open.',
    statusNavigated: 'Moving to {section}.',
    scrollCue: 'See how it works',
    placementAria: 'Interactive placement of menu bar items and two numbered boundaries',
    placementLabel: 'Place with Command-drag',
    boundaryOneAria: 'Numbered boundary 1',
    boundaryTwoAria: 'Numbered boundary 2',
    placementCaption: 'Each icon belongs to the first boundary on its right. Command-drag an icon across a boundary to move it.',
    placementCalendar: 'Calendar',
    placementCloud: 'Cloud',
    placementBell: 'Notifications',
    placementWifi: 'Wi-Fi',
    placementMembership: 'Grouped in {boundary}',
    placementMembershipTooltip: 'Grouped in this boundary',
    placementUnassigned: 'Not grouped in any boundary',
    placementItemDescription: '{item}. {membership}. Command-drag to move it.',
    placementMoved: 'Moved {item}. {membership}.',
    howTitle: 'Only three moves.',
    howBody: 'Place it. Open it. Use the original app. Everything returns when you finish.',
    stepOneTitle: 'Place a boundary',
    stepOneBody: 'Command-drag a numbered boundary to the right of the items you want to group.',
    stepTwoTitle: 'Open a launcher',
    stepTwoBody: 'A narrow vertical menu containing only its grouped items extends from the menu bar.',
    stepThreeTitle: 'Use the original app',
    stepThreeBody: 'The anchors and original icons return while its menu or popover opens, then everything is stored again when you finish.',
    customizeTitle: 'Configure every Bartical your way.',
    customizeBody: 'Set its name, icon, rendering, and color independently, then add as many as you need.',
    customizerAria: 'Settings available for each Bartical',
    customizerNameLabel: 'Name',
    customizerNameValue: 'Choose any name for its purpose',
    customizerIconLabel: 'Icon',
    customizerIconValue: 'SF Symbols, any SVG, or a number',
    customizerAppearanceLabel: 'Rendering and color',
    customizerAppearanceValue: 'Template, Original, or Custom Color',
    iconFormatsAria: 'Adding and configuring Barticals',
    iconCount: 'Add as many as needed',
    individualSettings: 'Configure each Bartical independently',
    privacyTitle: 'Everything stays on your Mac.',
    privacyBody: 'Appearance and Accessibility information are used only to organize and control items, never sent away.',
    privacyFactOneLabel: 'Data',
    privacyFactOneValue: 'No external transfer',
    privacyFactTwoLabel: 'Control',
    privacyFactTwoValue: 'Leaves the cursor alone',
    privacyFactThreeLabel: 'Safety',
    privacyFactThreeValue: 'Unsafe layouts stay visible',
    requirementsTitle: 'What Bartical needs.',
    requirementOsLabel: 'Operating system',
    requirementOsValue: 'macOS 14 or later',
    requirementAccessibility: 'Detect and control original items',
    requirementRecordingLabel: 'Screen & System Audio Recording',
    requirementRecording: 'Capture each current icon',
    requirementLanguageLabel: 'UI languages',
    requirementLanguage: '10 languages including Japanese',
    comingTitle: 'Bartical is available now.',
    comingBody: 'Download Bartical from itch.io.',
    comingCta: 'Get it on itch.io',
    themeLabel: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark'
  }
};

const fallbackText = {};
const fallbackAttributes = {};
let currentLocale = resolveLocale(readStoredLanguage() || 'ja');
let activeLauncher = 'main';
let activeSourceSection = null;
let sourceReturnLauncher = null;

const launcherButtons = Array.from(document.querySelectorAll('[data-launcher]'));
const menuPanels = Array.from(document.querySelectorAll('[data-menu-panel]'));
const launcherStatus = document.querySelector('[data-launcher-status]');
const sectionLinks = Array.from(document.querySelectorAll('[data-section-link]'));
const sections = Array.from(document.querySelectorAll('main section[id]'));
const menubar = document.querySelector('[data-bartical-menubar]');
const activationStrip = document.querySelector('[data-activation-strip]');
const originalItems = Array.from(document.querySelectorAll('[data-original-section]'));
const activationLauncherButtons = Array.from(document.querySelectorAll('[data-activation-launcher]'));
const sourceMenu = document.querySelector('[data-source-menu]');
const sourceNavigation = document.querySelector('[data-source-navigation]');
const sourceNavigationLabel = document.querySelector('[data-source-navigation-label]');
const sourceClose = document.querySelector('[data-source-close]');
const sourceSectionActions = document.querySelector('[data-source-section-actions]');
const themeSourceActions = document.querySelector('[data-theme-source-actions]');
const aboutWindow = document.querySelector('[data-about-window]');
const aboutClose = document.querySelector('[data-about-close]');
const themeOptionButtons = Array.from(document.querySelectorAll('[data-theme-option]'));
const themeSelect = document.querySelector('[data-theme-select]');
const heroVideo = document.querySelector('[data-hero-video]');
const reduceMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
const placementBar = document.querySelector('[data-placement-bar]');
const placementItems = Array.from(document.querySelectorAll('[data-placement-item]'));
const placementStatus = document.querySelector('[data-placement-status]');
const responsiveMenubarProperties = [
  '--bt-menubar-control-size',
  '--bt-menubar-icon-size',
  '--bt-menu-item-icon-size',
  '--bt-menubar-vertical-room',
  '--bt-launcher-gap',
  '--bt-launcher-main-offset',
  '--bt-activation-leading-gap',
  '--bt-activation-leading-margin',
  '--bt-activation-original-gap',
  '--bt-activation-original-margin',
  '--bt-activation-current-margin',
  '--bt-activation-launcher-gap',
  '--bt-system-leading-offset',
  '--bt-system-item-width',
  '--bt-vertical-menu-width',
  '--bt-vertical-menu-padding-inline',
  '--bt-vertical-menu-padding-top',
  '--bt-vertical-menu-padding-bottom',
  '--bt-vertical-menu-control-size',
  '--bt-original-pill-inline-offset'
];

function groupedItemOrder(section) {
  const index = GROUPED_ITEM_ORDER.indexOf(section);
  return index === -1 ? GROUPED_ITEM_ORDER.length : index;
}

function enforceGroupedItemOrder() {
  menuPanels.forEach((panel) => {
    Array.from(panel.querySelectorAll(':scope > [data-section-link]'))
      .sort((left, right) => (
        groupedItemOrder(left.dataset.sectionLink) - groupedItemOrder(right.dataset.sectionLink)
      ))
      .forEach((item) => panel.append(item));
  });

  const originalItemContainer = document.querySelector('.bt-original-items');
  originalItems
    .sort((left, right) => (
      groupedItemOrder(left.dataset.originalSection) - groupedItemOrder(right.dataset.originalSection)
    ))
    .forEach((item) => originalItemContainer?.append(item));
}

enforceGroupedItemOrder();

if (!window.BarticalLucide?.createBarticalIcons) {
  throw new Error('Lucide icon runtime is unavailable.');
}

window.BarticalLucide.createBarticalIcons(document);

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
    const key = element.dataset.i18n;
    if (key && !Object.prototype.hasOwnProperty.call(fallbackText, key)) {
      fallbackText[key] = element.textContent.replace(/^\s+|\s+$/gu, '');
    }
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    if (key && !Object.prototype.hasOwnProperty.call(fallbackAttributes, key)) {
      fallbackAttributes[key] = element.getAttribute('aria-label') || '';
    }
  });
}

function resolveCopy(key) {
  const localized = translations[currentLocale] && translations[currentLocale][key];
  if (typeof localized === 'string') {
    return localized;
  }
  if (Object.prototype.hasOwnProperty.call(fallbackText, key)) {
    return fallbackText[key];
  }
  return fallbackAttributes[key] || '';
}

function formatCopy(copy, variables) {
  if (!variables || typeof copy !== 'string') {
    return copy || '';
  }
  return copy.replace(/\{([a-zA-Z0-9_]+)\}/gu, (match, key) => (
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
  ));
}

function renderAboutVersion() {
  document.querySelectorAll('[data-about-version]').forEach((output) => {
    output.textContent = aboutVersion;
  });
  if (activeLauncher === 'main' && aboutWindow && !aboutWindow.hidden) {
    renderLauncherStatus('statusAboutOpen');
  }
}

async function syncAboutVersionFromAppcast() {
  try {
    const response = await fetch('./appcast.xml', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Bartical appcast request failed: ${response.status}`);
    }
    const documentXml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (documentXml.querySelector('parsererror')) {
      throw new Error('Bartical appcast is not valid XML');
    }
    const item = documentXml.querySelector('channel > item');
    const shortVersion = item
      ?.getElementsByTagNameNS(SPARKLE_NAMESPACE, 'shortVersionString')[0]
      ?.textContent.trim();
    const build = item
      ?.getElementsByTagNameNS(SPARKLE_NAMESPACE, 'version')[0]
      ?.textContent.trim();
    if (!shortVersion || !build) {
      throw new Error('Bartical appcast is missing version metadata');
    }
    aboutVersion = `${shortVersion}(${build})`;
    document.documentElement.dataset.barticalVersionSource = 'appcast';
  } catch (error) {
    aboutVersion = ABOUT_VERSION_FALLBACK;
    document.documentElement.dataset.barticalVersionSource = 'fallback';
  }
  renderAboutVersion();
}

function placementBoundaryGlyph(boundary) {
  return ({ 1: '①', 2: '②' })[boundary] || '';
}

function placementMembershipForItem(item) {
  let candidate = item?.nextElementSibling || null;
  while (candidate) {
    if (candidate.matches('[data-placement-boundary]')) {
      return candidate.dataset.placementBoundary || null;
    }
    if (candidate.classList.contains('bt-placement__launcher')) {
      return null;
    }
    candidate = candidate.nextElementSibling;
  }
  return null;
}

function placementMembershipCopy(boundary) {
  if (!boundary) {
    return resolveCopy('placementUnassigned');
  }
  return formatCopy(resolveCopy('placementMembership'), {
    boundary: placementBoundaryGlyph(boundary)
  });
}

function ensurePlacementTooltip(item) {
  let tooltip = item.querySelector('.bt-placement__membership');
  if (tooltip) {
    return tooltip;
  }
  tooltip = document.createElement('span');
  tooltip.className = 'bt-placement__membership';
  tooltip.setAttribute('aria-hidden', 'true');
  const badge = document.createElement('span');
  badge.className = 'bt-placement__membership-badge';
  badge.dataset.placementMembershipBadge = '';
  const label = document.createElement('span');
  label.dataset.placementMembershipLabel = '';
  tooltip.append(badge, label);
  item.appendChild(tooltip);
  return tooltip;
}

function placementBoundaryIcon(boundary) {
  if (!boundary || !placementBar) {
    return null;
  }
  const source = placementBar.querySelector(`[data-placement-boundary="${boundary}"]`);
  if (!source) {
    return null;
  }
  const icon = source.cloneNode(true);
  icon.classList.add('bt-placement__membership-anchor');
  icon.removeAttribute('data-placement-boundary');
  icon.removeAttribute('data-i18n-aria-label');
  icon.setAttribute('aria-hidden', 'true');
  icon.removeAttribute('aria-label');
  return icon;
}

function positionPlacementTooltip(item) {
  const tooltip = item.querySelector('.bt-placement__membership');
  if (!tooltip) {
    return;
  }
  tooltip.style.setProperty('--bt-placement-tooltip-shift', '0px');
  window.requestAnimationFrame(() => {
    const rect = tooltip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    let shift = 0;
    if (rect.left < 12) {
      shift = 12 - rect.left;
    } else if (rect.right > viewportWidth - 12) {
      shift = viewportWidth - 12 - rect.right;
    }
    tooltip.style.setProperty('--bt-placement-tooltip-shift', `${shift}px`);
  });
}

function updatePlacementMembership() {
  placementItems.forEach((item) => {
    const boundary = placementMembershipForItem(item);
    const membership = placementMembershipCopy(boundary);
    const itemLabel = resolveCopy(item.dataset.placementLabelKey) || item.dataset.placementItem;
    const tooltip = ensurePlacementTooltip(item);
    const badge = tooltip.querySelector('[data-placement-membership-badge]');
    const boundaryIcon = placementBoundaryIcon(boundary);
    item.dataset.placementMembership = boundary || 'none';
    badge.replaceChildren(...(boundaryIcon ? [boundaryIcon] : []));
    tooltip.querySelector('[data-placement-membership-label]').textContent = boundary
      ? resolveCopy('placementMembershipTooltip')
      : membership;
    item.setAttribute('aria-label', formatCopy(resolveCopy('placementItemDescription'), {
      item: itemLabel,
      membership
    }));
  });
}

function reorderPlacementItem(item, clientX) {
  if (!placementBar) {
    return;
  }
  const candidates = Array.from(placementBar.children).filter((candidate) => (
    candidate !== item
      && !candidate.classList.contains('bt-placement__space')
      && !candidate.classList.contains('bt-placement__launcher')
  ));
  const next = candidates.find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return clientX < rect.left + (rect.width / 2);
  });
  const fallback = placementBar.querySelector('.bt-placement__space, .bt-placement__launcher');
  placementBar.insertBefore(item, next || fallback);
  updatePlacementMembership();
}

function announcePlacementMove(item) {
  if (!placementStatus) {
    return;
  }
  const boundary = placementMembershipForItem(item);
  placementStatus.textContent = formatCopy(resolveCopy('placementMoved'), {
    item: resolveCopy(item.dataset.placementLabelKey) || item.dataset.placementItem,
    membership: placementMembershipCopy(boundary)
  });
}

function beginPlacementDrag(item, event) {
  if (!placementBar || event.button !== 0 || (!event.metaKey && !event.ctrlKey)) {
    return;
  }
  event.preventDefault();
  const initialOrder = Array.from(placementBar.children);
  const rect = item.getBoundingClientRect();
  const ghost = item.cloneNode(true);
  ghost.querySelector('.bt-placement__membership')?.remove();
  ghost.className = 'bt-placement__drag-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
  document.body.appendChild(ghost);
  item.classList.add('is-dragging');
  placementBar.classList.add('is-dragging');
  try {
    item.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic pointer events used by isolated browser checks have no active capture target.
  }

  const handleMove = (moveEvent) => {
    ghost.style.left = `${moveEvent.clientX}px`;
    ghost.style.top = `${moveEvent.clientY}px`;
    reorderPlacementItem(item, moveEvent.clientX);
  };
  const finish = (finishEvent, cancelled = false) => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleCancel);
    if (item.hasPointerCapture(finishEvent.pointerId)) {
      item.releasePointerCapture(finishEvent.pointerId);
    }
    if (cancelled) {
      initialOrder.forEach((child) => placementBar.appendChild(child));
    }
    ghost.remove();
    item.classList.remove('is-dragging');
    placementBar.classList.remove('is-dragging');
    updatePlacementMembership();
    if (!cancelled) {
      announcePlacementMove(item);
    }
    item.focus({ preventScroll: true });
    positionPlacementTooltip(item);
  };
  const handleUp = (upEvent) => finish(upEvent);
  const handleCancel = (cancelEvent) => finish(cancelEvent, true);
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleCancel);
}

function movePlacementItemWithKeyboard(item, direction) {
  if (!placementBar) {
    return;
  }
  const siblings = Array.from(placementBar.children).filter((candidate) => (
    !candidate.classList.contains('bt-placement__space')
      && !candidate.classList.contains('bt-placement__launcher')
  ));
  const index = siblings.indexOf(item);
  if (direction < 0 && index > 0) {
    placementBar.insertBefore(item, siblings[index - 1]);
  } else if (direction > 0 && index >= 0 && index < siblings.length - 1) {
    siblings[index + 1].after(item);
  } else {
    return;
  }
  updatePlacementMembership();
  announcePlacementMove(item);
  positionPlacementTooltip(item);
}

function setupPlacementSimulation() {
  placementItems.forEach((item) => {
    if (item.dataset.placementBound === 'true') {
      return;
    }
    item.dataset.placementBound = 'true';
    item.addEventListener('pointerdown', (event) => beginPlacementDrag(item, event));
    item.addEventListener('pointerenter', () => positionPlacementTooltip(item));
    item.addEventListener('focus', () => positionPlacementTooltip(item));
    item.addEventListener('keydown', (event) => {
      if ((!event.metaKey && !event.ctrlKey) || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      movePlacementItemWithKeyboard(item, event.key === 'ArrowLeft' ? -1 : 1);
    });
  });
  updatePlacementMembership();
}

function setupLanguageSelectors() {
  document.querySelectorAll('.lang-select').forEach((select) => {
    if (select.dataset.barticalBound !== 'true') {
      select.dataset.barticalBound = 'true';
      select.addEventListener('change', (event) => applyLanguage(event.target.value));
    }
    select.value = currentLocale;
  });
}

function effectiveTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function syncThemeOptions() {
  const theme = effectiveTheme();
  themeOptionButtons.forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.themeOption === theme));
  });
}

function syncHeroVideo() {
  if (!heroVideo) {
    return;
  }
  const source = effectiveTheme() === 'light'
    ? heroVideo.dataset.srcLight
    : heroVideo.dataset.srcDark;
  if (source && heroVideo.getAttribute('src') !== source) {
    heroVideo.setAttribute('src', source);
    heroVideo.load();
  }
  if (reduceMotionMedia.matches) {
    heroVideo.pause();
    return;
  }
  heroVideo.play().catch(() => {
    /* Autoplay is decorative and may be denied without affecting the page. */
  });
}

function syncThemePresentation() {
  syncThemeOptions();
  syncHeroVideo();
}

function stripSharedBacklinkArrows() {
  document.querySelectorAll('[data-product-backlink-label]').forEach((label) => {
    label.textContent = label.textContent.replace(/^\s*←\s*/u, '');
  });
}

function applyLanguage(locale) {
  recordFallbacks();
  currentLocale = resolveLocale(locale);
  document.documentElement.lang = currentLocale;

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const copy = resolveCopy(element.dataset.i18n);
    if (typeof copy === 'string') {
      element.textContent = copy;
    }
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    const copy = resolveCopy(element.dataset.i18nAriaLabel);
    if (typeof copy === 'string') {
      element.setAttribute('aria-label', copy);
    }
  });

  setupLanguageSelectors();
  try {
    localStorage.setItem(STORAGE_KEY, currentLocale);
  } catch (error) {
    /* Language persistence is optional. */
  }

  if (window.MDWProductBacklink) {
    window.MDWProductBacklink.sync(currentLocale);
  }
  stripSharedBacklinkArrows();
  updatePlacementMembership();

  if (activeSourceSection) {
    renderSourceMenuCopy();
    renderLauncherStatus('statusSourceOpen', {
      section: labelForSection(activeSourceSection)
    });
  } else {
    renderLauncherStatus();
  }
}

function statusKeyForLauncher(launcher) {
  if (launcher === '2') {
    return 'statusTwoOpen';
  }
  if (launcher === '3') {
    return 'statusThreeOpen';
  }
  if (launcher === 'main' && aboutWindow && !aboutWindow.hidden) {
    return 'statusAboutOpen';
  }
  return 'statusMainOpen';
}

function renderLauncherStatus(key = activeLauncher ? statusKeyForLauncher(activeLauncher) : 'statusClosed', variables) {
  if (!launcherStatus) {
    return;
  }
  launcherStatus.textContent = formatCopy(resolveCopy(key), {
    version: aboutVersion,
    ...variables
  });
}

function openAbout(options = {}) {
  if (!aboutWindow) {
    return false;
  }
  aboutWindow.hidden = false;
  renderLauncherStatus('statusAboutOpen');
  if (options.scroll !== false) {
    document.getElementById('top')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  }
  return true;
}

function closeAbout(options = {}) {
  if (!aboutWindow) {
    return false;
  }
  aboutWindow.hidden = true;
  if (options.updateStatus !== false) {
    renderLauncherStatus();
  }
  if (options.restoreFocus === true) {
    launcherButtons.find((button) => button.dataset.launcher === 'main')
      ?.focus({ preventScroll: true });
  }
  return true;
}

function labelForSection(section) {
  const matchingItem = sectionLinks.find((item) => item.dataset.sectionLink === section);
  return matchingItem?.querySelector('[data-i18n]')?.textContent.trim() || section;
}

function renderSourceMenuCopy() {
  if (!activeSourceSection || !sourceNavigationLabel) {
    return;
  }
  sourceNavigationLabel.textContent = formatCopy(resolveCopy('sourceNavigation'), {
    section: labelForSection(activeSourceSection)
  });
}

function positionSourceMenu() {
  if (!activeSourceSection || !sourceMenu || sourceMenu.hidden || !menubar) {
    return;
  }
  const selectedItem = originalItems.find((item) => (
    item.dataset.originalSection === activeSourceSection
  ));
  if (!selectedItem) {
    return;
  }
  const itemRect = selectedItem.getBoundingClientRect();
  const menuRect = sourceMenu.getBoundingClientRect();
  const menubarRect = menubar.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const preferredLeft = itemRect.left;
  const activationRect = activationStrip?.getBoundingClientRect();
  const pinsToMobileLeft = window.matchMedia('(max-width: 760px)').matches
    && activationRect
    && activationRect.left < 0;
  const left = pinsToMobileLeft
    ? 8
    : Math.min(
      Math.max(preferredLeft, 8),
      viewportWidth - menuRect.width - 8
    );
  sourceMenu.style.left = `${left - menubarRect.left}px`;
}

function syncRevealedOriginalItems(launcher) {
  const launcherPanel = menuPanels.find((panel) => panel.dataset.menuPanel === launcher);
  const groupedSections = new Set(
    Array.from(launcherPanel?.querySelectorAll('[data-section-link]') || [])
      .map((item) => item.dataset.sectionLink)
  );
  originalItems.forEach((item) => {
    item.hidden = !groupedSections.has(item.dataset.originalSection);
  });
}

function syncResponsiveMenubarLayout() {
  if (!menubar || !activationStrip) {
    return;
  }
  const root = document.documentElement;
  responsiveMenubarProperties.forEach((property) => {
    root.style.removeProperty(property);
  });
  root.style.removeProperty('--bt-responsive-scale');
  const storedMainLauncher = launcherButtons.find((button) => button.dataset.launcher === 'main');
  if (!storedMainLauncher) {
    return;
  }
  const baseValues = Object.fromEntries(responsiveMenubarProperties.map((property) => [
    property,
    Number.parseFloat(getComputedStyle(root).getPropertyValue(property)) || 0
  ]));
  const storedRect = storedMainLauncher.getBoundingClientRect();
  const storedMainCenter = storedRect.left + (storedRect.width / 2);
  const allowsMobileLeftOverflow = window.matchMedia('(max-width: 760px)').matches;
  const originalItemCount = originalItems.length;
  const leadingAnchorCount = activationStrip.querySelectorAll(
    '.bt-activation-anchors--leading .bt-activation-anchor'
  ).length;
  const currentAnchorCount = activationStrip.querySelectorAll(
    '.bt-activation-anchors--current .bt-activation-anchor'
  ).length;
  const activationLauncherCount = activationLauncherButtons.length;
  const controlCount = leadingAnchorCount
    + originalItemCount
    + currentAnchorCount
    + activationLauncherCount;
  const compactWidth = controlCount * baseValues['--bt-menubar-icon-size'];
  const spacingWidth = (
    Math.max(leadingAnchorCount - 1, 0) * baseValues['--bt-activation-leading-gap']
    + baseValues['--bt-activation-leading-margin']
    + Math.max(originalItemCount - 1, 0) * baseValues['--bt-activation-original-gap']
    + baseValues['--bt-activation-original-margin']
    + baseValues['--bt-activation-current-margin']
    + Math.max(activationLauncherCount - 1, 0) * baseValues['--bt-activation-launcher-gap']
  );
  const requiredWidth = compactWidth + spacingWidth;
  const requiredLeftSpan = requiredWidth - (baseValues['--bt-menubar-icon-size'] / 2);
  const responsiveScale = allowsMobileLeftOverflow || requiredLeftSpan <= 0
    ? 1
    : Math.min(Math.max(storedMainCenter / requiredLeftSpan, 0), 1);
  responsiveMenubarProperties.forEach((property) => {
    root.style.setProperty(property, `${baseValues[property] * responsiveScale}px`);
  });
  root.style.setProperty('--bt-responsive-scale', String(responsiveScale));
}

function alignRevealedMainLauncher() {
  if (!activationStrip || activationStrip.hidden) {
    return;
  }
  const storedMainLauncher = launcherButtons.find((button) => button.dataset.launcher === 'main');
  const mainLauncher = activationLauncherButtons.find((button) => (
    button.dataset.activationLauncher === 'main'
  ));
  if (!storedMainLauncher || !mainLauncher) {
    return;
  }
  const storedRect = storedMainLauncher.getBoundingClientRect();
  const revealedRect = mainLauncher.getBoundingClientRect();
  const storedCenter = storedRect.left + (storedRect.width / 2);
  const revealedCenter = revealedRect.left + (revealedRect.width / 2);
  const currentOffset = Number.parseFloat(
    getComputedStyle(activationStrip).getPropertyValue('--bt-activation-main-offset')
  ) || 0;
  activationStrip.style.setProperty(
    '--bt-activation-main-offset',
    `${currentOffset + storedCenter - revealedCenter}px`
  );
}

function showSourceMenu(section, options = {}) {
  if (!activationStrip || !sourceMenu) {
    return false;
  }
  activeSourceSection = section;
  document.documentElement.dataset.barticalActivation = 'revealed';
  activationStrip.hidden = false;
  syncRevealedOriginalItems(sourceReturnLauncher || 'main');
  originalItems.forEach((item) => {
    item.setAttribute('aria-pressed', String(item.dataset.originalSection === section));
  });
  alignRevealedMainLauncher();
  sourceMenu.hidden = false;
  if (sourceSectionActions) {
    sourceSectionActions.hidden = section === 'theme';
  }
  if (themeSourceActions) {
    themeSourceActions.hidden = section !== 'theme';
  }
  syncThemeOptions();
  renderSourceMenuCopy();
  renderLauncherStatus('statusSourceOpen', {
    section: labelForSection(section)
  });
  positionSourceMenu();
  window.requestAnimationFrame(() => {
    alignRevealedMainLauncher();
    positionSourceMenu();
    if (options.focusMenu !== false) {
      if (section === 'theme') {
        themeOptionButtons.find((button) => button.dataset.themeOption === effectiveTheme())
          ?.focus({ preventScroll: true });
      } else {
        sourceNavigation?.focus({ preventScroll: true });
      }
    } else {
      originalItems.find((item) => item.dataset.originalSection === section)
        ?.focus({ preventScroll: true });
    }
  });
  return true;
}

function beginSourceActivation(section, options = {}) {
  sourceReturnLauncher = activeLauncher || sourceReturnLauncher || 'main';
  closeLauncher();
  return showSourceMenu(section, options);
}

function closeSourceActivation(options = {}) {
  const returnLauncher = sourceReturnLauncher || 'main';
  const selectedSection = activeSourceSection;
  activeSourceSection = null;
  sourceReturnLauncher = null;
  delete document.documentElement.dataset.barticalActivation;
  if (activationStrip) {
    activationStrip.hidden = true;
    activationStrip.style.removeProperty('--bt-activation-main-offset');
  }
  if (sourceMenu) {
    sourceMenu.hidden = true;
    sourceMenu.style.removeProperty('left');
  }
  originalItems.forEach((item) => item.removeAttribute('aria-pressed'));

  if (options.reopenLauncher === true) {
    openLauncher(returnLauncher, { focusFirst: true });
    return;
  }
  renderLauncherStatus(options.statusKey || 'statusClosed', options.statusVariables);
  if (options.restoreFocus === true) {
    launcherButtons.find((button) => button.dataset.launcher === returnLauncher)
      ?.focus({ preventScroll: true });
  }
  return selectedSection;
}

function navigateToSourceSection() {
  if (!activeSourceSection) {
    return;
  }
  const section = activeSourceSection;
  const label = labelForSection(section);
  const target = document.getElementById(section);
  closeSourceActivation({
    statusKey: 'statusNavigated',
    statusVariables: { section: label }
  });
  if (!target) {
    return;
  }
  window.history.pushState(null, '', `#${section}`);
  target.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'start'
  });
}

function openLauncher(launcher, options = {}) {
  const targetButton = launcherButtons.find((button) => button.dataset.launcher === launcher);
  const targetPanel = menuPanels.find((panel) => panel.dataset.menuPanel === launcher);
  if (!targetButton || !targetPanel) {
    return false;
  }

  launcherButtons.forEach((button) => {
    button.setAttribute('aria-expanded', String(button === targetButton));
  });
  menuPanels.forEach((panel) => {
    panel.hidden = panel !== targetPanel;
  });
  activeLauncher = launcher;
  document.documentElement.dataset.barticalLauncher = launcher;
  renderLauncherStatus();

  if (options.focusFirst === true) {
    targetPanel.querySelector('[data-section-link]')?.focus({ preventScroll: true });
  }
  return true;
}

function closeLauncher(options = {}) {
  const previouslyActive = activeLauncher;
  launcherButtons.forEach((button) => button.setAttribute('aria-expanded', 'false'));
  menuPanels.forEach((panel) => {
    panel.hidden = true;
  });
  activeLauncher = null;
  delete document.documentElement.dataset.barticalLauncher;
  renderLauncherStatus('statusClosed');

  if (options.restoreFocus === true && previouslyActive) {
    launcherButtons.find((button) => button.dataset.launcher === previouslyActive)?.focus({ preventScroll: true });
  }
}

launcherButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const launcher = button.dataset.launcher;
    if (activeLauncher === launcher && button.getAttribute('aria-expanded') === 'true') {
      closeLauncher();
      return;
    }
    openLauncher(launcher);
  });
});

sectionLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const section = link.dataset.sectionLink;
    beginSourceActivation(section, { focusMenu: event.detail === 0 });
  });
});

themeOptionButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    const preference = button.dataset.themeOption;
    if (!themeSelect || (preference !== 'light' && preference !== 'dark')) {
      return;
    }
    themeSelect.value = preference;
    themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    syncThemeOptions();
    closeSourceActivation({ restoreFocus: event.detail === 0 });
  });
});

originalItems.forEach((item) => {
  item.addEventListener('click', (event) => {
    showSourceMenu(item.dataset.originalSection, {
      focusMenu: event.detail === 0
    });
  });
});

activationLauncherButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const launcher = button.dataset.activationLauncher;
    closeSourceActivation();
    openLauncher(launcher);
  });
});

sourceNavigation?.addEventListener('click', navigateToSourceSection);
sourceClose?.addEventListener('click', () => {
  closeSourceActivation({ restoreFocus: true });
});
aboutClose?.addEventListener('click', () => {
  closeAbout({ restoreFocus: true });
});

document.addEventListener('pointerdown', (event) => {
  if (activeSourceSection) {
    if (event.target.closest('[data-source-menu], [data-original-section], [data-activation-launcher]')) {
      return;
    }
    closeSourceActivation();
    return;
  }
  if (!activeLauncher || event.target.closest('.bt-launcher-slot')) {
    return;
  }
  closeLauncher();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }
  if (activeSourceSection) {
    event.preventDefault();
    closeSourceActivation({ restoreFocus: true });
    return;
  }
  if (!activeLauncher) {
    return;
  }
  event.preventDefault();
  closeLauncher({ restoreFocus: true });
});

window.addEventListener('resize', () => {
  window.requestAnimationFrame(() => {
    syncResponsiveMenubarLayout();
    alignRevealedMainLauncher();
    positionSourceMenu();
  });
});

new MutationObserver(syncThemePresentation).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});

if (typeof reduceMotionMedia.addEventListener === 'function') {
  reduceMotionMedia.addEventListener('change', syncHeroVideo);
} else if (typeof reduceMotionMedia.addListener === 'function') {
  reduceMotionMedia.addListener(syncHeroVideo);
}

function markCurrentSection(sectionId) {
  sectionLinks.forEach((link) => {
    if (link.dataset.sectionLink === sectionId) {
      link.setAttribute('aria-current', 'location');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible?.target?.id) {
      markCurrentSection(visible.target.id);
    }
  }, {
    rootMargin: '-18% 0px -58% 0px',
    threshold: [0.08, 0.28, 0.55]
  });
  sections.forEach((section) => sectionObserver.observe(section));
}

window.BarticalHero = {
  open: openLauncher,
  close: closeLauncher,
  activateSource: beginSourceActivation,
  restoreSource: closeSourceActivation,
  openAbout,
  closeAbout,
  openThemeSettings: (options = {}) => beginSourceActivation('theme', options),
  closeThemeSettings: (options = {}) => (
    activeSourceSection === 'theme' ? closeSourceActivation(options) : false
  ),
  get activeLauncher() {
    return activeLauncher;
  },
  get activeSourceSection() {
    return activeSourceSection;
  }
};

recordFallbacks();
setupLanguageSelectors();
setupPlacementSimulation();
applyLanguage(currentLocale);
syncThemePresentation();
syncResponsiveMenubarLayout();
openLauncher('main');
openAbout({ scroll: false });
syncAboutVersionFromAppcast();

window.addEventListener('mdw:footer-loaded', () => {
  setupLanguageSelectors();
  applyLanguage(currentLocale);
});
