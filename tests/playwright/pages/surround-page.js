const { ProductPage } = require('./product-page');

class SurroundPage extends ProductPage {
  constructor(page) {
    super(page);
    this.wordmark = page.locator('.surround-wordmark');
    this.interaction = page.locator('.surround-interaction');
    this.primaryAction = page.locator('.surround-action--primary');
    this.footerTab = page.locator('[data-surround-footer-target="surround-footer"]');
  }

  model(side) { return this.page.locator(`[data-surround-model="${side}"]`); }
  sectionTab(number) { return this.page.locator(`[data-surround-target="surround-0${number}"]`); }
  async selectSection(number) { await this.sectionTab(number).click(); }
  async showSection(number) {
    const id = `surround-0${number}`;
    await this.selectSection(number);
    await this.page.waitForFunction(({ id, index }) => (
      document.body.dataset.surroundScene === String(index)
      && Math.abs(document.getElementById(id).getBoundingClientRect().top) <= 1
    ), { id, index: number - 1 });
  }
  async showFooter() {
    await this.footerTab.click();
    await this.page.waitForFunction(() => (
      document.body.dataset.surroundStop === 'surround-footer'
      && Math.abs(document.documentElement.scrollHeight - window.innerHeight - window.scrollY) <= 1
    ));
  }
}

module.exports = { SurroundPage };
