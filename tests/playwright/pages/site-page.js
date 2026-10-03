const { FooterControls } = require('../components/footer-controls');

class SitePage {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
    this.footer = new FooterControls(page);
  }
}

module.exports = { SitePage };
