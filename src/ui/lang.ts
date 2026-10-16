import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { DEFAULT_LANG, getLang, isLang, isTheme, setLang } from '../core/i18n';

/** Reads the stored language (or English) and theme into the page. Call before the first render. */
export async function initLang(): Promise<void> {
  const { lang, theme } = await browser.storage.local.get(['lang', 'theme']);
  const next = isLang(lang) ? lang : DEFAULT_LANG;
  setLang(next);
  document.documentElement.lang = next;
  // `system` (or nothing stored) leaves the attribute off, so CSS follows prefers-color-scheme.
  if (isTheme(theme) && theme !== 'system') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

/** Re-renders the calling component when the language or theme changes in any page. */
export function useLang() {
  const [, set] = useState('');
  useEffect(() => {
    const onChange = (changes: Record<string, unknown>) => {
      if ('lang' in changes || 'theme' in changes)
        void initLang().then(() => set(`${getLang()}:${document.documentElement.dataset.theme ?? ''}`));
    };
    browser.storage.local.onChanged.addListener(onChange);
    return () => browser.storage.local.onChanged.removeListener(onChange);
  }, []);
  return getLang();
}
