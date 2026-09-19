// Initial scope: the window document, not an element scroll container.
export function createWindowScrollAdapter(win, doc) {
  function getViewportHeight() {
    const viewport = win.visualViewport;
    return Math.round(viewport && viewport.height ? viewport.height : (win.innerHeight || doc.documentElement.clientHeight));
  }

  function getScrollY() {
    return Number.isFinite(win.scrollY) ? win.scrollY : (doc.documentElement.scrollTop || 0);
  }

  function getDocumentBottom() {
    const documentHeight = Math.max(doc.body ? doc.body.scrollHeight : 0, doc.documentElement.scrollHeight);
    return Math.max(0, Math.round(documentHeight - getViewportHeight()));
  }

  function readStopTop(stop) {
    if (!stop) {
      return null;
    }
    const context = {
      window: win,
      document: doc,
      stop,
      viewportHeight: getViewportHeight(),
      scrollY: getScrollY(),
      documentBottom: getDocumentBottom()
    };
    if (typeof stop.getTop === 'function') {
      const value = stop.getTop(context);
      const customTop = value === null ? NaN : Number(value);
      return Number.isFinite(customTop) ? customTop : null;
    }
    if (stop.align === 'document-end') {
      return context.documentBottom;
    }
    if (!stop.element || typeof stop.element.getBoundingClientRect !== 'function') {
      return null;
    }
    const rect = stop.element.getBoundingClientRect();
    if (stop.align === 'end') {
      return Math.max(0, Math.round(rect.bottom + context.scrollY - context.viewportHeight));
    }
    return Math.max(0, Math.round(rect.top + context.scrollY));
  }

  return { getViewportHeight, getScrollY, getDocumentBottom, readStopTop,
    scrollTo: (top, behavior = 'auto') => win.scrollTo({ top, behavior }) };
}
