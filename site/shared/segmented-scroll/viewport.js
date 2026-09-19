export function createViewportCssSync(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const rootElement = options.rootElement || (win ? win.document.documentElement : null);
  const disposers = [];
  let mounted = false;

  function sync() {
    if (!win || !rootElement) {
      return null;
    }
    const viewport = win.visualViewport;
    const width = Math.round(viewport && viewport.width ? viewport.width : win.innerWidth);
    const height = Math.round(viewport && viewport.height ? viewport.height : win.innerHeight);
    if (options.widthProperty && width > 0) {
      rootElement.style.setProperty(options.widthProperty, `${width}px`);
    }
    if (options.heightProperty && height > 0) {
      rootElement.style.setProperty(options.heightProperty, `${height}px`);
    }
    if (typeof options.onChange === 'function') {
      options.onChange({ width, height });
    }
    return { width, height };
  }

  function listen(target, type) {
    if (!target || typeof target.addEventListener !== 'function') {
      return;
    }
    target.addEventListener(type, sync);
    disposers.push(() => target.removeEventListener(type, sync));
  }

  function mount() {
    if (!win || !rootElement || mounted) {
      return sync();
    }
    mounted = true;
    listen(win, 'resize');
    listen(win, 'orientationchange');
    listen(win.visualViewport, 'resize');
    return sync();
  }

  function destroy() {
    disposers.splice(0).forEach((dispose) => dispose());
    mounted = false;
  }

  return Object.freeze({ mount, sync, destroy });
}
