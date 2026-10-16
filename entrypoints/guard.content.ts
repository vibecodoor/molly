import { dayKey } from '../src/core/day';
import { type LimitConfig, blockedDomains, underLimit } from '../src/core/limits';

/**
 * Block overlay: the site loads, Molly lays a blurred glass with the block page over it and keeps media silent.
 * Read-only: derives "blocked" from storage like the background does, and re-checks on every storage change
 * (the exhaust alarm and the midnight rollover both write storage, so the overlay comes and goes on time).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    if (!/^https?:$/.test(location.protocol)) return;
    const host = location.hostname;
    // Always the live <html>: some sites (SPA hydration) replace it after document_start.
    const root = () => document.documentElement;
    let frame: HTMLIFrameElement | null = null;
    let guard: ReturnType<typeof setInterval> | undefined;
    let overflow = '';

    const silence = (m: HTMLMediaElement) => {
      m.muted = true;
      m.pause();
    };
    const hush = () => document.querySelectorAll<HTMLMediaElement>('video, audio').forEach(silence);
    // Autoplay and "next video" start after the overlay is up: stop each one as it starts.
    document.addEventListener('play', (e) => frame && e.target instanceof HTMLMediaElement && silence(e.target), true);

    // Puts the overlay back the moment the page removes it or rebuilds <html> (SPA hydration does both).
    const hold = () => {
      if (!frame || !alive()) return;
      if (!frame.isConnected) {
        // Re-inserting an iframe reloads it; tell the page to skip the entrance so the overlay doesn't play twice.
        if (!frame.src.includes('&again')) frame.src += '&again';
        root().append(frame);
      }
      // Top layer: above anything the site paints, whatever its z-index or stacking contexts.
      if (!frame.matches(':popover-open')) frame.showPopover();
      root().style.overflow = 'hidden';
      hush();
    };

    const watch = new MutationObserver(() => frame && !frame.isConnected && hold());
    // After the extension is reloaded or updated, this script lives on in already-open tabs with a dead API
    // ("Extension context invalidated"): step aside quietly; the tab gets the new script on its next load.
    const alive = () => {
      if (browser.runtime?.id) return true;
      hide();
      return false;
    };

    function show(domain: string) {
      if (frame) return hold();
      frame = document.createElement('iframe');
      frame.popover = 'manual';
      frame.src = browser.runtime.getURL(`/blocked.html?d=${encodeURIComponent(domain)}` as '/blocked.html');
      frame.setAttribute(
        'style',
        [
          'position: fixed',
          'inset: 0',
          'width: 100vw',
          'height: 100vh',
          'max-width: none',
          'max-height: none',
          'overflow: hidden',
          'margin: 0',
          'padding: 0',
          'border: 0',
          'display: block',
          'z-index: 2147483647',
          'background: transparent',
          // Same scheme inside and out, or Chrome paints the iframe opaque.
          'color-scheme: normal',
          'backdrop-filter: blur(18px) saturate(1.2)',
          'visibility: visible',
          'opacity: 1',
          'pointer-events: auto',
        ]
          .map((rule) => `${rule} !important`)
          .join('; '),
      );
      overflow = root().style.overflow;
      root().append(frame);
      hold();
      frame.addEventListener('load', () => frame?.focus()); // keys go to Molly, not to the page's player
      watch.observe(document, { childList: true, subtree: true });
      guard = setInterval(hold, 500); // media that starts without a DOM change
    }

    function hide() {
      if (!frame) return;
      clearInterval(guard);
      watch.disconnect();
      frame.remove();
      frame = null;
      root().style.overflow = overflow;
    }

    async function check() {
      if (!alive()) return;
      const key = `day:${dayKey(Date.now())}`;
      const s = (await browser.storage.local.get(['limitConfig', key])) as Record<string, never>;
      const limits = (s.limitConfig as LimitConfig | undefined)?.limits ?? {};
      const domain = blockedDomains(s[key] ?? {}, limits).find((d) => underLimit(host, d));
      if (domain) show(domain);
      else hide();
    }

    void check();
    browser.storage.local.onChanged.addListener(() => void check());
  },
});
