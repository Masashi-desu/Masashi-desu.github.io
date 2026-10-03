const { ProductPage } = require('./product-page');

class RetreatScreenPage extends ProductPage {
  constructor(page) {
    super(page);
    this.launcher = page.locator('#launcher');
    this.surface = page.locator('.retreat-launcher-panel__content');
    this.grid = page.locator('#retreat-app-grid');
    this.editToggle = page.locator('#retreat-edit-toggle');
    this.renameInputs = page.locator('.retreat-app-rename');
    this.header = page.locator('.retreat-launcher-header');
    this.content = page.locator('#retreat-content');
    this.editor = page.locator('#retreat-icon-editor');
    this.editorOverlay = page.locator('#retreat-icon-editor-overlay');
    this.editorName = page.locator('#retreat-icon-editor-name');
    this.editorFile = page.locator('#retreat-icon-editor-file');
    this.editorChoose = page.locator('#retreat-icon-editor-choose');
    this.editorSelected = page.locator('#retreat-icon-editor-selected');
    this.editorSave = page.locator('#retreat-icon-editor-save');
    this.editorPreview = page.locator('#retreat-icon-editor-preview');
  }

  icon(name) { return this.page.locator(`[data-launcher-item="${name}"] .retreat-app-icon`); }
  itemLink(name) { return this.page.locator(`[data-launcher-item="${name}"] .retreat-app-link`); }
  itemLabel(name) { return this.page.locator(`[data-launcher-item="${name}"] .retreat-app-label`); }
  pageTab(number) { return this.page.locator(`[data-page-target="${number}"]`); }
  async toggleEditing() { await this.editToggle.click(); }
  async editIcon(name, options) { await this.icon(name).click(options); }
  async renameIcon(name) { await this.editorName.fill(name); }
  async cancelIconEdit() { await this.page.locator('#retreat-icon-editor-cancel').click(); }
  async saveIconEdit() { await this.editorSave.click(); }
  async revertIcon() { await this.page.locator('#retreat-icon-editor-revert').click(); }
  async applyLanguage(language) { await this.page.evaluate(language => window.RetreatI18n.apply(language), language); }
  async readActionState() {
    return this.page.evaluate(() => Object.fromEntries(
      Array.from(document.querySelectorAll('[data-launcher-item]')).map((item) => {
        const link = item.querySelector('.retreat-app-link');
        return [item.dataset.launcherItem, {
          href: link.getAttribute('href'),
          pressable: link.getAttribute('data-pressable'),
          role: link.getAttribute('role'),
          tabIndex: link.tabIndex,
          transitionDirection: link.getAttribute('data-transition-direction')
        }];
      })
    ));
  }

  async readAppStoreHrefs() {
    return this.page.locator('[data-retreat-app-store-link]').evaluateAll((links) => (
      links.map((link) => link.getAttribute('href'))
    ));
  }

  async readIconEffect(itemName) {
    return this.icon(itemName).evaluate((icon) => {
      const style = getComputedStyle(icon);
      return {
        boxShadow: style.boxShadow,
        filter: style.filter
      };
    });
  }

  async scrollLauncher(deltaX, expectedPage) {
    const bounds = await this.surface.boundingBox();
    if (!bounds) throw new Error('The launcher interaction surface did not have a bounding box.');
    await this.page.mouse.move(
      bounds.x + bounds.width * 0.75,
      bounds.y + bounds.height * 0.42
    );
    await this.page.mouse.wheel(deltaX, 0);
    await this.page.waitForFunction((pageNumber) => (
      window.RetreatLauncher.getState().currentPage === pageNumber
    ), expectedPage);
    await this.page.waitForFunction(() => (
      !document.querySelector('#retreat-app-grid').classList.contains('is-page-transitioning')
    ));
  }
}

module.exports = { RetreatScreenPage };
