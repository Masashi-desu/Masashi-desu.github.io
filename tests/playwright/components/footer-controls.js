class FooterControls {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
    this.controls = {
      language: page.locator('#footer-language'),
      theme: page.locator('#footer-theme')
    };
    this.copyright = page.locator('.site-footer__shared .site-footer__copyright');
  }

  async waitUntilLoaded(options = {}) {
    await this.controls.language.waitFor({ state: 'attached', ...options });
    await this.controls.theme.waitFor({ state: 'attached', ...options });
  }

  async selectTheme(theme) {
    await this.controls.theme.selectOption(theme);
  }

  async expectedFocus(accent) {
    return this.page.evaluate((accent) => {
      const probe = document.createElement('span');
      const expectedProbe = document.createElement('span');
      probe.style.color = 'var(--accent-color)';
      probe.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--accent-color) 32%, transparent)';
      expectedProbe.style.color = accent || 'var(--accent-color)';
      document.body.append(probe, expectedProbe);
      const style = getComputedStyle(probe);
      const result = {
        border: style.color,
        expectedAccent: getComputedStyle(expectedProbe).color,
        ring: style.boxShadow
      };
      probe.remove();
      expectedProbe.remove();
      return result;
    }, accent);
  }

  async focusControl(name, expected) {
    const control = this.controls[name];
    await control.focus();
    await this.page.waitForFunction(({ id, expected }) => {
      const element = document.getElementById(id);
      if (!element || document.activeElement !== element) return false;
      const style = getComputedStyle(element);
      return style.borderColor === expected.border && style.boxShadow === expected.ring
        && (expected.background === undefined || style.backgroundColor === expected.background);
    }, { id: await control.getAttribute('id'), expected }, { timeout: 2000, polling: 50 });
    return control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        active: document.activeElement === element,
        border: style.borderColor,
        background: style.backgroundColor,
        ring: style.boxShadow
      };
    });
  }

  async readMobileOrder() {
    return this.page.evaluate(() => {
      const shared = document.querySelector('.site-footer__shared');
      const actions = shared?.querySelector('.site-footer__actions');
      const copyright = shared?.querySelector('.site-footer__copyright');
      return {
        copyrightCount: document.querySelectorAll('.site-footer__copyright').length,
        copyrightText: copyright?.textContent.trim() || null,
        flexDirection: shared ? getComputedStyle(shared).flexDirection : null,
        actionsBottom: actions ? Number(actions.getBoundingClientRect().bottom.toFixed(2)) : null,
        copyrightTop: copyright ? Number(copyright.getBoundingClientRect().top.toFixed(2)) : null
      };
    });
  }
}

module.exports = { FooterControls };
