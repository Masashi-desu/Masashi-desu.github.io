(function () {
  const DEFAULT_SOURCE = 'catalog';
  const SOURCES = {
    home: {
      href: '../../index.html#products-section',
      labels: {
        ja: '← ホームに戻る',
        en: '← Back to Home'
      }
    },
    catalog: {
      href: '../index.html',
      labels: {
        ja: '← 一覧に戻る',
        en: '← Back to List'
      }
    }
  };

  function resolveSource() {
    try {
      const params = new URLSearchParams(window.location.search);
      const source = params.get('from') || DEFAULT_SOURCE;
      return Object.prototype.hasOwnProperty.call(SOURCES, source) ? source : DEFAULT_SOURCE;
    } catch (error) {
      return DEFAULT_SOURCE;
    }
  }

  function resolveLang(lang) {
    return lang === 'en' ? 'en' : 'ja';
  }

  function sync(lang) {
    const source = resolveSource();
    const config = SOURCES[source] || SOURCES[DEFAULT_SOURCE];
    const label = config.labels[resolveLang(lang || document.documentElement.lang)];
    document.querySelectorAll('[data-product-backlink]').forEach((link) => {
      link.href = config.href;
      link.dataset.transitionDirection = 'left';
      const labelTarget = link.querySelector('[data-product-backlink-label]') || link;
      labelTarget.textContent = label;
    });
  }

  window.MDWProductBacklink = {
    sync
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sync(), { once: true });
  } else {
    sync();
  }
})();
