const { SitePage } = require('./site-page');

class CatalogPage extends SitePage {
  constructor(page) {
    super(page);
    this.productSections = page.locator('[data-catalog-section="product"]');
    this.numberTabs = page.locator('.catalog-section-nav__number');
    this.numberTrack = page.locator('.catalog-section-nav__numbers');
    this.paginationTab = page.locator('#catalog-pagination-nav');
    this.footerTab = page.locator('.catalog-section-nav__footer-link');
    this.nextButton = page.locator('#catalog-pagination-next');
    this.previousButton = page.locator('#catalog-pagination-prev');
    this.categoryFilter = page.locator('#category-filter');
  }

  productLink(product, source = '') {
    const sourceSelector = source ? `[href*="from=${source}"]` : '';
    return this.page.locator(`#product-grid a[href*="${product}"]${sourceSelector}`).first();
  }

  async openProduct(product, source = '') { await this.productLink(product, source).click(); }
  async openFirstProduct() {
    await this.page.locator('#product-grid a[data-transition-direction="right"]').first().click();
  }
  async showProduct(id) { await this.page.locator(`.catalog-section-nav__number[data-section-target="${id}"]`).click(); }
  async showPagination() { await this.paginationTab.click(); }
  async showFooter() { await this.footerTab.click(); }
  async nextPage() { await this.nextButton.click(); }
  async previousPage() { await this.previousButton.click(); }
  async filterCategory(category) { await this.categoryFilter.selectOption(category); }
  async readOverflowState() {
    return this.page.evaluate(() => {
      const copy = document.querySelector('.section-copy');
      const rect = copy?.getBoundingClientRect();
      return {
        clientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        copyRight: rect ? Number(rect.right.toFixed(2)) : null,
        copyWidth: rect ? Number(rect.width.toFixed(2)) : null,
        copyWhiteSpace: copy ? getComputedStyle(copy).whiteSpace : null
      };
    });
  }
  async readPaginationState() {
    return this.page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('[data-catalog-section="product"]'));
      const catalogVideos = Array.from(document.querySelectorAll('.catalog-product-section__video'));
      const renderer = window.__liquidGLRenderer__;
      const video = document.querySelector('#catalog-product-bartical .catalog-product-section__video');
      const videoStyle = video ? getComputedStyle(video) : null;
      const videoRect = video?.getBoundingClientRect();
      const videoMediaRect = video?.parentElement?.getBoundingClientRect();
      const barticalIcon = document.querySelector('#catalog-product-bartical .catalog-product-section__icon');
      const barticalIconStyle = barticalIcon ? getComputedStyle(barticalIcon) : null;
      const navTrack = document.querySelector('.catalog-section-nav__track');
      const navTintStyle = navTrack ? getComputedStyle(navTrack, '::before') : null;
      const status = document.getElementById('catalog-pagination-status');
      const prev = document.getElementById('catalog-pagination-prev');
      const next = document.getElementById('catalog-pagination-next');
      return {
        sectionIds: sections.map((section) => section.id),
        productIndexes: sections.map((section) => section.dataset.productIndex),
        indexLabels: sections.map((section) => section.querySelector('.catalog-product-section__index')?.textContent.trim()),
        navNumbers: Array.from(document.querySelectorAll('.catalog-section-nav__number')).map((button) => button.textContent.trim()),
        page: status?.textContent.trim(),
        pageLabel: status?.getAttribute('aria-label'),
        prevDisabled: prev?.disabled,
        nextDisabled: next?.disabled,
        count: document.getElementById('product-count')?.textContent.trim(),
        catalogVideoSources: catalogVideos.map((item) => item.getAttribute('src')).sort(),
        liquidDynamicVideoSources: renderer && Array.isArray(renderer._videoNodes)
          ? renderer._videoNodes.map((item) => item.getAttribute('src')).sort()
          : [],
        catalogNavGlassTone: navTrack?.dataset.glassTone || null,
        catalogNavGlassTransition: navTintStyle ? {
          property: navTintStyle.transitionProperty,
          duration: navTintStyle.transitionDuration,
          timingFunction: navTintStyle.transitionTimingFunction
        } : null,
        video: video ? {
          src: video.getAttribute('src'),
          poster: video.getAttribute('poster'),
          muted: video.muted,
          loop: video.loop,
          autoplay: video.autoplay,
          playsInline: video.playsInline,
          disablePictureInPicture: video.hasAttribute('disablepictureinpicture'),
          disableRemotePlayback: video.hasAttribute('disableremoteplayback'),
          objectPosition: videoStyle?.objectPosition,
          topEdgeOffset: videoRect && videoMediaRect ? videoRect.top - videoMediaRect.top : null
        } : null,
        barticalFallbackImageCount: document.querySelectorAll('#catalog-product-bartical .catalog-product-section__image').length,
        catalogNavGlassTint: navTintStyle?.backgroundColor || null,
        barticalIconStyle: barticalIconStyle ? {
          src: barticalIcon.getAttribute('src'),
          naturalWidth: barticalIcon.naturalWidth,
          naturalHeight: barticalIcon.naturalHeight,
          borderRadius: barticalIconStyle.borderRadius,
          boxShadow: barticalIconStyle.boxShadow,
          objectFit: barticalIconStyle.objectFit
        } : null,
        liquidRefreshCalls: Array.isArray(window.__catalogLiquidRefreshCalls)
          ? window.__catalogLiquidRefreshCalls.slice()
          : []
      };
    });
  }

  async readScrollState() {
    return this.page.evaluate(() => {
      const active = document.querySelector(
        '.catalog-section-nav__icon-button.is-active, .catalog-section-nav__number.is-active, .catalog-section-nav__footer-link.is-active'
      );
      const pagination = document.getElementById('catalog-pagination-section');
      const footer = document.getElementById('catalog-footer');
      const productSections = Array.from(document.querySelectorAll('[data-catalog-section="product"]'));
      const lastProduct = productSections[productSections.length - 1] || null;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const paginationScrollTop = pagination
        ? Math.max(0, Math.round(pagination.getBoundingClientRect().bottom + window.scrollY - viewportHeight))
        : null;
      return {
        scrollY: Math.round(window.scrollY),
        activeTarget: active
          ? active.dataset.sectionTarget || active.dataset.paginationTarget || active.dataset.footerTarget
          : null,
        lastProductTarget: lastProduct ? lastProduct.id : null,
        lastProductTop: lastProduct ? Number(lastProduct.getBoundingClientRect().top.toFixed(2)) : null,
        paginationDistance: paginationScrollTop === null ? null : Math.abs(Math.round(window.scrollY) - paginationScrollTop),
        paginationTop: pagination ? Number(pagination.getBoundingClientRect().top.toFixed(2)) : null,
        footerTop: footer ? Number(footer.getBoundingClientRect().top.toFixed(2)) : null,
        distanceFromBottom: Math.round(documentHeight - (window.scrollY + viewportHeight))
      };
    });
  }
}

module.exports = { CatalogPage };
