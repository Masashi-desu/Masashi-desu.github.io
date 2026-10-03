const { ProductPage } = require('./product-page');

class BarticalPage extends ProductPage {
  constructor(page) {
    super(page);
    this.mainButton = this.launcher('main');
    this.mainPanel = this.menu('main');
    this.themeSettingsTrigger = page.locator('[data-theme-settings-trigger]');
    this.themeSourceActions = page.locator('[data-theme-source-actions]');
    this.sourceSectionActions = page.locator('[data-source-section-actions]');
    this.sourceMenu = page.locator('[data-source-menu]');
    this.activationStrip = page.locator('[data-activation-strip]');
    this.aboutWindow = page.locator('[data-about-window]');
    this.aboutClose = page.locator('[data-about-close]');
    this.aboutTrigger = page.locator('[data-about-trigger]');
    this.aboutVersion = page.locator('[data-about-version]');
    this.distributionAction = page.locator('#coming-soon .bt-coming__button');
    this.hero = page.locator('.bt-hero');
    this.activeOriginalSection = page.locator('[data-original-section][aria-pressed="true"]');
    this.launchers = page.locator('[data-launcher]');
  }

  launcher(id) { return this.page.locator(`[data-launcher="${id}"]`); }
  menu(id) { return this.page.locator(`#bt-menu-${id}`); }
  sectionLink(menu, section) { return this.menu(menu).locator(`[data-section-link="${section}"]`); }
  placementItem(id) { return this.page.locator(`[data-placement-item="${id}"]`); }
  placementBoundary(id) { return this.page.locator(`[data-placement-boundary="${id}"]`); }
  async selectTheme(theme) { await this.page.locator(`[data-theme-option="${theme}"]`).click(); }
  async closeSourceMenu() { await this.page.locator('[data-source-close]').click(); }
  async navigateToSource() { await this.page.locator('[data-source-navigation]').click(); }
}

module.exports = { BarticalPage };
