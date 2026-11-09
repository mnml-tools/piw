/**
 * jsdom gaps used by the component tests (Radix, Tabs, TextArea). Call `installDomPolyfills()`
 * at the top of a test file. Test-only: never import this from app code.
 */

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

export function installDomPolyfills(): void {
  const proto = Element.prototype as Element & {
    scrollIntoView?: Element['scrollIntoView'];
    hasPointerCapture?: Element['hasPointerCapture'];
    setPointerCapture?: Element['setPointerCapture'];
    releasePointerCapture?: Element['releasePointerCapture'];
  };
  if (!('ResizeObserver' in globalThis)) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub,
    });
  }
  if (typeof proto.scrollIntoView !== 'function') proto.scrollIntoView = () => {};
  // CodeMirror measures text ranges.
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () =>
      ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as DOMRectList;
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
  if (typeof proto.hasPointerCapture !== 'function') proto.hasPointerCapture = () => false;
  if (typeof proto.setPointerCapture !== 'function') proto.setPointerCapture = () => {};
  if (typeof proto.releasePointerCapture !== 'function') proto.releasePointerCapture = () => {};
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    });
  }
}

/** Sets `data-platform` on <html> (what the app does at startup); `null` removes it. */
export function setPlatform(platform: 'macos' | 'windows' | 'linux' | null): void {
  if (platform) document.documentElement.dataset.platform = platform;
  else delete document.documentElement.dataset.platform;
}
