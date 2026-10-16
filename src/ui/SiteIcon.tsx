import {
  siDiscord,
  siFacebook,
  siInstagram,
  siKinopoisk,
  siNetflix,
  siReddit,
  siTelegram,
  siTiktok,
  siTwitch,
  siVk,
  siX,
  siYoutube,
} from 'simple-icons';
import { browser } from 'wxt/browser';

/** Monochrome brand marks (Simple Icons, CC0), drawn in ink per the One Pink Rule. Order = preset order. */
const ICONS: Record<string, { path: string }> = {
  'youtube.com': siYoutube,
  'twitch.tv': siTwitch,
  'tiktok.com': siTiktok,
  'instagram.com': siInstagram,
  'vk.com': siVk,
  'reddit.com': siReddit,
  'x.com': siX,
  'telegram.org': siTelegram,
  'netflix.com': siNetflix,
  'kinopoisk.ru': siKinopoisk,
  'facebook.com': siFacebook,
  'discord.com': siDiscord,
};

export const PRESETS = Object.keys(ICONS);

/** Brand mark for presets; Chrome's local favicon cache (no network) for any other site. */
export function SiteIcon({ domain, size = 20 }: { domain: string; size?: number }) {
  const icon = ICONS[domain];
  if (icon)
    return (
      <svg className="site-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={icon.path} />
      </svg>
    );
  const src = `${browser.runtime.getURL('/_favicon/' as '/popup.html')}?pageUrl=${encodeURIComponent(`https://${domain}/`)}&size=32`;
  return <img className="site-icon favicon" src={src} width={size} height={size} alt="" />;
}
