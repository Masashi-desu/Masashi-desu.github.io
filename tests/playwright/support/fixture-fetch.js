const productData = require('../../../site/products/index.json');
const footerMarkup = '<footer data-test="injected">Playwright Footer</footer>';

// file:// navigation tests need only product data and a deterministic footer.
async function installFixtureFetch(context) {
  await context.addInitScript(({ data, footer }) => {
    const originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (/index\.json($|\?)/.test(url)) {
        return new Response(JSON.stringify(data), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('partials/footer.html')) {
        return new Response(footer, {
          status: 200, headers: { 'Content-Type': 'text/html' }
        });
      }
      if (originalFetch) return originalFetch(input, init);
      throw new Error('Fetch not supported in this environment');
    };
  }, { data: productData, footer: footerMarkup });
}

module.exports = { installFixtureFetch };
