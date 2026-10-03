const { ProductPage } = require('./product-page');

class TypeFetchPage extends ProductPage {
  constructor(page) {
    super(page);
    this.calloutInput = page.locator('#tf-callout-input');
    this.storyKeys = page.locator('.tf-move__key');
    this.rules = page.locator('.tf-rules');
  }

  async focusInput() { await this.calloutInput.click({ position: { x: 16, y: 16 } }); }
  async waitForTheme(theme) {
    await this.page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
    await this.page.waitForFunction((expected) => {
      const topbar = document.querySelector('.tf-topbar');
      const targetWindow = document.querySelector('.tf-target-window');
      if (!topbar || !targetWindow) {
        return false;
      }
      const expectedTopbar = expected === 'light' ? 'rgba(244, 247, 251, 0.82)' : 'rgba(7, 9, 16, 0.78)';
      const expectedWindow = expected === 'light' ? 'rgb(255, 255, 255)' : 'rgb(17, 20, 29)';
      return getComputedStyle(topbar).backgroundColor === expectedTopbar
        && getComputedStyle(targetWindow).backgroundColor === expectedWindow;
    }, theme);
  }

  async readThemeState() {
    return this.page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      const rootStyle = getComputedStyle(document.documentElement);
      const distributionAction = document.querySelector('.tf-purchase__button');
      const distributionLabel = distributionAction?.querySelector('[data-i18n="purchaseCta"]');
      const distributionIcon = distributionAction?.querySelector('.tf-purchase__button-icon');
      const distributionLabelRect = distributionLabel?.getBoundingClientRect();
      const distributionIconRect = distributionIcon?.getBoundingClientRect();
      const distributionStyle = distributionAction ? getComputedStyle(distributionAction) : null;
      const distributionLabelStyle = distributionLabel ? getComputedStyle(distributionLabel) : null;
      const distributionIconStyle = distributionIcon ? getComputedStyle(distributionIcon) : null;
      const purchaseSection = document.querySelector('.tf-purchase');
      const purchaseIcon = document.querySelector('.tf-purchase__icon');
      const purchaseCopy = document.querySelector('.tf-purchase__copy');
      const purchaseTitle = document.querySelector('#tf-purchase-title');
      const purchaseBody = document.querySelector('.tf-purchase__copy > p:last-child');
      const rect = (element) => {
        if (!element) {
          return null;
        }
        const bounds = element.getBoundingClientRect();
        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height
        };
      };
      const countTextLines = (element) => {
        if (!element) {
          return 0;
        }
        const range = document.createRange();
        range.selectNodeContents(element);
        return Array.from(range.getClientRects()).filter((line) => line.width > 0).length;
      };
      return {
        theme: document.documentElement.dataset.theme,
        preference: document.documentElement.dataset.themePreference,
        stored: localStorage.getItem('mdw-theme'),
        selected: document.querySelector('.theme-select')?.value,
        colorScheme: rootStyle.colorScheme,
        body: {
          background: style('body').backgroundColor,
          color: style('body').color
        },
        topbar: style('.tf-topbar').backgroundColor,
        story: style('.tf-operation-story').backgroundColor,
        targetWindow: style('.tf-target-window').backgroundColor,
        callout: {
          background: style('.tf-callout').backgroundImage,
          colorScheme: style('.tf-callout').colorScheme,
          title: style('.tf-callout__heading h2').color,
          subtitle: style('.tf-callout__heading p').color,
          input: style('#tf-callout-input').backgroundColor,
          inputText: style('#tf-callout-input').color,
          placeholder: getComputedStyle(document.querySelector('#tf-callout-input'), '::placeholder').color,
          cancel: style('.tf-callout-button--cancel').backgroundColor,
          cancelText: style('.tf-callout-button--cancel').color,
          confirm: style('.tf-callout-button--confirm').backgroundImage
        },
        rules: style('.tf-rules').backgroundColor,
        showcase: style('.tf-showcase').backgroundColor,
        facts: style('.tf-facts').backgroundColor,
        purchase: style('.tf-purchase').backgroundColor,
        footer: style('.tf-footer').backgroundColor,
        footerDesign: {
          sharedDirection: style('.site-footer__shared').flexDirection,
          sharedAlign: style('.site-footer__shared').alignItems,
          sharedGap: style('.site-footer__shared').gap,
          actionsDirection: style('.site-footer__actions').flexDirection,
          actionsGap: style('.site-footer__actions').gap,
          labelSize: style('.site-footer__label').fontSize,
          labelSpacing: style('.site-footer__label').letterSpacing,
          labelTransform: style('.site-footer__label').textTransform,
          shellBackground: style('.site-footer__select-shell').backgroundColor,
          selectBackground: style('.lang-select').backgroundColor,
          selectRadius: style('.lang-select').borderRadius,
          selectSize: style('.lang-select').fontSize,
          selectSpacing: style('.lang-select').letterSpacing,
          selectTransform: style('.lang-select').textTransform
        },
        distribution: {
          href: distributionAction?.getAttribute('href') || null,
          target: distributionAction?.getAttribute('target') || null,
          rel: distributionAction?.getAttribute('rel') || null,
          label: distributionLabel?.textContent || null,
          backgroundColor: distributionStyle?.backgroundColor || null,
          labelColor: distributionLabelStyle?.color || null,
          iconColor: distributionIconStyle?.backgroundColor || null,
          iconMask: distributionIconStyle
            ? `${distributionIconStyle.maskImage} ${distributionIconStyle.webkitMaskImage}`
            : '',
          iconIsLeftOfLabel: Boolean(
            distributionLabelRect && distributionIconRect && distributionIconRect.right <= distributionLabelRect.left
          )
        },
        purchaseLayout: {
          section: rect(purchaseSection),
          sectionPaddingLeft: purchaseSection ? parseFloat(getComputedStyle(purchaseSection).paddingLeft) : 0,
          sectionPaddingRight: purchaseSection ? parseFloat(getComputedStyle(purchaseSection).paddingRight) : 0,
          icon: rect(purchaseIcon),
          copy: rect(purchaseCopy),
          title: rect(purchaseTitle),
          body: rect(purchaseBody),
          button: rect(distributionAction),
          copyTextAlign: purchaseCopy ? getComputedStyle(purchaseCopy).textAlign : null,
          titleLineCount: countTextLines(purchaseTitle),
          bodyLineCount: countTextLines(purchaseBody)
        },
        overflow: {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth
        }
      };
    });
  }
}

module.exports = { TypeFetchPage };
