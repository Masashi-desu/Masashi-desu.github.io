const { SitePage } = require('./site-page');

class ProductPage extends SitePage {
  constructor(page) {
    super(page);
    this.backlink = page.locator('[data-product-backlink]').first();
  }

  async returnToSource() { await this.backlink.click(); }

  async readBacklink() {
    return this.backlink.evaluate((link) => ({
      href: link.href,
      text: link.textContent.trim(),
      search: window.location.search,
      pathname: window.location.pathname,
      hash: window.location.hash
    }));
  }
}

module.exports = { ProductPage };
