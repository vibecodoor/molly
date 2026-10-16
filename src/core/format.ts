import { dateOf } from './day';
import { getLang, t } from './i18n';

/** Human duration: `45 с`, `12 мин`, `1 ч 5 мин`, `2 ч` (or `45 s`, `12 min`, `1 h 5 min`). */
export function formatDuration(ms: number): string {
  const u = t().unit;
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} ${u.s}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${u.min}`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} ${u.h} ${m % 60} ${u.min}` : `${h} ${u.h}`;
}

const NAMES: Record<string, string> = {
  'youtube.com': 'YouTube',
  'twitch.tv': 'Twitch',
  'vk.com': 'ВКонтакте',
  'reddit.com': 'Reddit',
  'x.com': 'X',
  'twitter.com': 'X',
  'instagram.com': 'Instagram',
  'tiktok.com': 'TikTok',
  'github.com': 'GitHub',
  'google.com': 'Google',
  'yandex.ru': 'Яндекс',
  'telegram.org': 'Telegram',
  'netflix.com': 'Netflix',
  'kinopoisk.ru': 'Кинопоиск',
  'chatgpt.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'yahoo.com': 'Yahoo',
  'facebook.com': 'Facebook',
  'discord.com': 'Discord',
  'pinterest.com': 'Pinterest',
  'linkedin.com': 'LinkedIn',
  'wikipedia.org': 'Википедия',
  'rutube.ru': 'Rutube',
  'dzen.ru': 'Дзен',
  'pikabu.ru': 'Пикабу',
  'habr.com': 'Хабр',
  'avito.ru': 'Авито',
  'ozon.ru': 'Ozon',
  'wildberries.ru': 'Wildberries',
  'ok.ru': 'Одноклассники',
  'ivi.ru': 'Иви',
  'steampowered.com': 'Steam',
  'aliexpress.ru': 'AliExpress',
};

/** English names where the Russian one is in Cyrillic. */
const EN_NAMES: Record<string, string> = {
  'vk.com': 'VK',
  'yandex.ru': 'Yandex',
  'kinopoisk.ru': 'Kinopoisk',
  'wikipedia.org': 'Wikipedia',
  'dzen.ru': 'Dzen',
  'pikabu.ru': 'Pikabu',
  'habr.com': 'Habr',
  'avito.ru': 'Avito',
  'ok.ru': 'OK',
  'ivi.ru': 'Ivi',
};

/** Friendly name for well-known sites, the domain itself otherwise. */
export const siteName = (domain: string) => (getLang() === 'en' && EN_NAMES[domain]) || NAMES[domain] || domain;

const parts = (day: string) => {
  const date = dateOf(day);
  return { date, m: date.getMonth() + 1, d: date.getDate() };
};

export const weekdayShort = (day: string) => t().weekdays[parts(day).date.getDay()]!;
/** «13 окт» */
export const dayShort = (day: string) => `${parts(day).d} ${t().months[parts(day).m - 1]}`;
/** «13–19 окт», «29 сен – 5 окт» */
export function weekRange(first: string, last: string): string {
  const a = parts(first);
  const b = parts(last);
  return a.m === b.m ? `${a.d}–${b.d} ${t().months[b.m - 1]}` : `${dayShort(first)} – ${dayShort(last)}`;
}
