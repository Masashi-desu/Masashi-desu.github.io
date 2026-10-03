const { SitePage } = require('./site-page');

class HomePage extends SitePage {
  constructor(page) {
    super(page);
    this.productGrid = page.locator('.home-product-grid');
    this.productTrack = page.locator('.home-product-track');
    this.productsTab = page.locator('[data-section-target="products-section"]');
    this.footerTab = page.locator('.home-section-nav__footer-link');
    this.catalogLink = page.locator('.home-products__all-link');
  }

  productLink(product, source = '') {
    const sourceSelector = source ? `[href*="from=${source}"]` : '';
    return this.page.locator(`.home-product-card[href*="${product}"]${sourceSelector}`).first();
  }

  async showProducts() { await this.productsTab.click(); }
  async showFooter() { await this.footerTab.click(); }
  async openCatalog() { await this.catalogLink.click(); }
  async openProduct(product, source = '') { await this.productLink(product, source).click(); }
  async readScrollState() {
    return this.page.evaluate(() => {
      const active = document.querySelector('.home-section-nav__button.is-active, .home-section-nav__footer-link.is-active');
      const catchRect = document.getElementById('catch-section').getBoundingClientRect();
      const productsRect = document.getElementById('products-section').getBoundingClientRect();
      const footerRect = document.getElementById('home-footer').getBoundingClientRect();
      return {
        scrollY: Math.round(window.scrollY),
        activeTarget: active ? active.dataset.sectionTarget || active.dataset.footerTarget : null,
        catchTop: Number(catchRect.top.toFixed(2)),
        productsTop: Number(productsRect.top.toFixed(2)),
        footerTop: Number(footerRect.top.toFixed(2)),
        distanceFromBottom: Math.round(document.documentElement.scrollHeight - (window.scrollY + window.innerHeight))
      };
    });
  }

  async readCarouselState() {
    return this.page.evaluate(() => {
      const grid = document.querySelector('.home-product-grid');
      const track = document.querySelector('.home-product-track');
      const gridRect = grid.getBoundingClientRect();
      const gridStyle = getComputedStyle(grid);
      const trackStyle = getComputedStyle(track);
      const firstCard = document.querySelector('.home-product-card:not(.home-product-card--clone)');
      const firstCardStyle = firstCard ? getComputedStyle(firstCard) : null;
      const transform = trackStyle.transform;
      let trackTranslateX = null;
      if (transform && transform !== 'none') {
        const matrix = transform.match(/matrix\(([^)]+)\)/);
        if (matrix) {
          trackTranslateX = Number.parseFloat(matrix[1].split(',')[4]);
        }
      }
      const api = grid.emblaApi || null;
      const autoScroll = api && api.plugins() ? api.plugins().autoScroll : null;
      const slides = Array.from(document.querySelectorAll('.home-product-slide'));
      const slideWidths = slides.map((slide) => slide.offsetWidth);
      const slideCardWidthGaps = slides.map((slide) => {
        const card = slide.querySelector('.home-product-card');
        return card ? Math.abs(slide.offsetWidth - card.offsetWidth) : Number.POSITIVE_INFINITY;
      });
      const slideOffsets = slides.map((slide) => slide.offsetLeft);
      const slideLayoutDeltas = slideOffsets.slice(1).map((offset, index) => offset - slideOffsets[index]);
      const slideFlexBasis = slides[0] ? getComputedStyle(slides[0]).flexBasis : null;
      const visibleCards = Array.from(document.querySelectorAll('.home-product-card')).filter((card) => {
        const rect = card.getBoundingClientRect();
        return rect.right > gridRect.left + 24 && rect.left < gridRect.right - 24;
      }).length;
      return {
        cardCount: document.querySelectorAll('.home-product-card').length,
        cloneCount: document.querySelectorAll('.home-product-card--clone').length,
        slideCount: document.querySelectorAll('.home-product-slide').length,
        setSize: Number.parseInt(gridStyle.getPropertyValue('--home-product-count'), 10),
        emblaReady: Boolean(api),
        emblaLoop: api ? api.internalEngine().options.loop : null,
        autoScrollPlaying: autoScroll ? autoScroll.isPlaying() : null,
        trackTranslateX,
        slideWidthSpread: Math.max(...slideWidths) - Math.min(...slideWidths),
        maxSlideCardWidthGap: Math.max(...slideCardWidthGaps),
        slideLayoutDeltaSpread: slideLayoutDeltas.length > 0
          ? Math.max(...slideLayoutDeltas) - Math.min(...slideLayoutDeltas)
          : 0,
        slideFlexBasis,
        gridOverflowX: gridStyle.overflowX,
        gridBackgroundColor: gridStyle.backgroundColor,
        gridPaddingBottom: gridStyle.paddingBottom,
        trackBackgroundColor: trackStyle.backgroundColor,
        cardBoxShadow: firstCardStyle ? firstCardStyle.boxShadow : null,
        clientWidth: grid.clientWidth,
        trackScrollWidth: track.scrollWidth,
        visibleCards
      };
    });
  }

  async readProductLayout() {
    return this.page.evaluate(() => {
      const roundRect = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: Number(rect.left.toFixed(2)),
          top: Number(rect.top.toFixed(2)),
          right: Number(rect.right.toFixed(2)),
          bottom: Number(rect.bottom.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2))
        };
      };
      const grid = document.querySelector('.home-product-grid');
      const gridRect = roundRect(grid);
      const visibleCards = Array.from(document.querySelectorAll('.home-product-card'))
        .map(roundRect)
        .filter((rect) => rect.right > gridRect.left + 8 && rect.left < gridRect.right - 8);
      const visibleDescriptions = Array.from(document.querySelectorAll('.home-product-card__description'))
        .filter((description) => {
          const rect = description.getBoundingClientRect();
          return rect.right > gridRect.left + 8 && rect.left < gridRect.right - 8;
        });
      const barticalIcon = document.querySelector('.home-product-card[href*="products/Bartical/"] .home-product-card__icon');
      const referenceIcon = document.querySelector('.home-product-card[href*="products/RetreatScreen/"] .home-product-card__icon');
      const barticalVideo = document.querySelector('.home-product-card[href*="products/Bartical/"] .home-product-card__media-video');
      const barticalVideoStyle = barticalVideo ? getComputedStyle(barticalVideo) : null;
      const barticalIconStyle = barticalIcon ? getComputedStyle(barticalIcon) : null;
      const productVideoSources = Array.from(new Set(
        Array.from(document.querySelectorAll('.home-product-card__media-video'))
          .map((video) => video.getAttribute('src'))
      )).sort();

      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scroll: {
          clientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth
        },
        sectionRect: roundRect(document.getElementById('products-section')),
        productsRect: roundRect(document.querySelector('.home-products')),
        headerRect: roundRect(document.querySelector('.home-products__header')),
        hasHeaderCaption: Boolean(document.querySelector('.home-products__body')),
        gridRect,
        footerRect: roundRect(document.querySelector('.home-products__footer')),
        ctaRect: roundRect(document.querySelector('.home-products__all-link')),
        visibleCards,
        visibleDescriptionLineClamps: visibleDescriptions.map((description) => getComputedStyle(description).webkitLineClamp),
        barticalIcon: barticalIcon ? {
          src: barticalIcon.getAttribute('src'),
          naturalWidth: barticalIcon.naturalWidth,
          naturalHeight: barticalIcon.naturalHeight,
          filter: barticalIconStyle.filter,
          scale: new DOMMatrix(barticalIconStyle.transform).a,
          rect: roundRect(barticalIcon),
          referenceRect: referenceIcon ? roundRect(referenceIcon) : null
        } : null,
        barticalVideo: barticalVideo ? {
          src: barticalVideo.getAttribute('src'),
          poster: barticalVideo.getAttribute('poster'),
          muted: barticalVideo.muted,
          loop: barticalVideo.loop,
          autoplay: barticalVideo.autoplay,
          playsInline: barticalVideo.playsInline,
          controls: barticalVideo.controls,
          paused: barticalVideo.paused,
          readyState: barticalVideo.readyState,
          videoWidth: barticalVideo.videoWidth,
          videoHeight: barticalVideo.videoHeight,
          objectPosition: barticalVideoStyle.objectPosition
        } : null,
        productVideoSources,
        reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
      };
    });
  }

  async readTileSamples({ tileSize, tileGap }) {
    return this.page.evaluate(({ tileSize, tileGap }) => {
      const canvas = document.querySelector('[data-philosophy-tiles]');
      const section = canvas.closest('.home-section--catch');
      const columns = Number(canvas.dataset.tileColumns);
      const rows = Number(canvas.dataset.tileRows);
      const stride = tileSize + tileGap;
      const width = section.getBoundingClientRect().width;
      const height = section.getBoundingClientRect().height;
      const gridWidth = columns * tileSize + (columns - 1) * tileGap;
      const gridHeight = rows * tileSize + (rows - 1) * tileGap;
      const offsetX = (width - gridWidth) / 2;
      const offsetY = (height - gridHeight) / 2;
      const column = Math.max(8, Math.min(columns - 9, Math.round((width / 2 - offsetX - tileSize / 2) / stride)));
      const row = Math.max(1, Math.min(rows - 2, Math.round((height / 2 - offsetY - tileSize / 2) / stride)));
      const centerX = offsetX + column * stride + tileSize / 2;
      const centerY = offsetY + row * stride + tileSize / 2;
      const dprX = canvas.width / width;
      const dprY = canvas.height / height;
      const context = canvas.getContext('2d');
      const alphaAt = (columnOffset) => {
        const x = Math.round((centerX + columnOffset * stride) * dprX);
        const y = Math.round(centerY * dprY);
        return context.getImageData(x, y, 1, 1).data[3] / 255;
      };
      return {
        pointer: {
          x: section.getBoundingClientRect().left + centerX,
          y: section.getBoundingClientRect().top + centerY
        },
        alpha: {
          center: alphaAt(0),
          near: alphaAt(2),
          middle: alphaAt(4),
          outside: alphaAt(8)
        },
        idleOpacity: Number(canvas.dataset.tileIdleOpacity),
        pointerGlowRadius: Number(canvas.dataset.pointerGlowRadius),
        pointerGlowOpacity: Number(canvas.dataset.pointerGlowOpacity),
        pointerGlowIntensity: Number(canvas.dataset.pointerGlowIntensity),
        pointerTileCount: Number(canvas.dataset.pointerTileCount),
        pointerTileIntensitySpread: Number(canvas.dataset.pointerTileIntensitySpread),
        pointerTileIntensitySample: canvas.dataset.pointerTileIntensitySample,
        pointerShapeSignature: canvas.dataset.pointerShapeSignature,
        pointerShapeExtents: canvas.dataset.pointerShapeExtents,
        hoveredTile: Number(canvas.dataset.hoveredTile)
      };
    }, { tileSize, tileGap });
  }
}

module.exports = { HomePage };
