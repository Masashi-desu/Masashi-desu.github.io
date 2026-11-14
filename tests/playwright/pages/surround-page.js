const { ProductPage } = require('./product-page');

class SurroundPage extends ProductPage {
  constructor(page) {
    super(page);
    this.wordmark = page.locator('.surround-wordmark');
    this.interaction = page.locator('.surround-interaction');
    this.primaryAction = page.locator('.surround-action--primary');
    this.footerTab = page.locator('[data-surround-footer-target="surround-footer"]');
    this.featureTab = this.sectionTab(2);
    this.technology = page.locator('#surround-technology');
    this.technologies = this.technology.getByRole('listitem');
  }

  model(side) { return this.page.locator(`[data-surround-model="${side}"]`); }
  sectionTab(number) { return this.page.locator(`[data-surround-target="surround-0${number}"]`); }
  async showTechnology() {
    await this.page.locator('[data-surround-target="surround-technology"]').click();
    await this.page.waitForFunction(() => document.body.dataset.surroundStop === 'surround-technology' &&
      window.MDWSurroundNavigation.isSettled());
  }
  async selectSection(number) { await this.sectionTab(number).click(); }
  async showSection(number) {
    if (number === 3) {
      await this.scrollFeatures(1);
      return;
    }
    const id = `surround-0${number}`;
    await this.selectSection(number);
    try {
      await this.page.waitForFunction(({ id, index }) => (
        document.body.dataset.surroundScene === String(index)
        // The controller aligns to a rounded scroll position. The section can start on a fractional CSS pixel.
        && Math.abs(document.getElementById(id).getBoundingClientRect().top) <= 2
      ), { id, index: number === 4 ? 4 : number - 1 });
    } catch (error) {
      const position = await this.page.evaluate((id) => ({
        stop: document.body.dataset.surroundStop,
        scene: document.body.dataset.surroundScene,
        top: document.getElementById(id).getBoundingClientRect().top,
        viewport: [innerWidth, innerHeight]
      }), id);
      throw new Error(`Did not arrive at ${id}: ${JSON.stringify(position)}`, { cause: error });
    }
  }
  async scrollFeatures(progress) {
    if (await this.featureTab.getAttribute('aria-current') !== 'true') {
      await this.showSection(2);
    }
    await this.page.waitForFunction(() => (
      Number(document.body.dataset.surroundFeatureProgress) > 0 || window.MDWSurroundNavigation.isSettled()
    ));
    await this.page.locator('.surround-feature-scroll').evaluate((scroller, progress) => {
      const distance = scroller.querySelector('#surround-03').offsetTop;
      scroller.scrollTo({ top: distance * progress, behavior: 'instant' });
    }, progress);
    await this.page.waitForFunction((target) => (
      document.body.dataset.surroundStop === 'surround-02' &&
      Math.abs(Number(document.body.dataset.surroundFeatureProgress) - target) < 0.005
    ), progress);
    await this.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
