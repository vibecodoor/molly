import { describe, expect, it } from 'vitest';
import { dayKey, nextDay } from './day';
import { domainOf } from './domain';
import { credit, MAX_GAP_MS, settle, type Usage } from './engine';
import { formatDuration } from './format';
import { setLang } from './i18n';
import { blockedDomains, changeLimit, msUntilExhaust, rollover } from './limits';

// Expectations are written in Russian; the shipped default is English.
setLang('ru');

const at = (s: string) => new Date(s).getTime(); // local time (TZ=Europe/Berlin via vitest.config.ts)
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('day', () => {
  it('keys by local date and steps across month ends', () => {
    expect(dayKey(at('2026-10-15T23:59:59'))).toBe('2026-10-15');
    expect(nextDay('2026-10-31')).toBe('2026-11-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('formatDuration', () => {
  it('picks the coarsest readable unit', () => {
    expect(formatDuration(-5)).toBe('0\u00a0с');
    expect(formatDuration(45_999)).toBe('45\u00a0с');
    expect(formatDuration(12 * MIN + 30_000)).toBe('12\u00a0мин');
    expect(formatDuration(HOUR + 5 * MIN)).toBe('1\u00a0ч\u00a05\u00a0мин');
    expect(formatDuration(2 * HOUR)).toBe('2\u00a0ч');
  });
});

describe('domainOf', () => {
  it('folds subdomains into the registrable domain', () => {
    expect(domainOf('https://m.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(domainOf('https://music.youtube.com/')).toBe('youtube.com');
    expect(domainOf('https://www.bbc.co.uk/news')).toBe('bbc.co.uk');
  });
  it('ignores non-web pages and junk, keeps hosts without a registrable domain', () => {
    expect(domainOf('chrome://extensions')).toBeNull();
    expect(domainOf('chrome-extension://abc/blocked.html?d=youtube.com')).toBeNull();
    expect(domainOf('about:blank')).toBeNull();
    expect(domainOf('not a url')).toBeNull();
    expect(domainOf(undefined)).toBeNull();
    expect(domainOf('http://localhost:3000/')).toBe('localhost');
    expect(domainOf('http://192.168.1.1/')).toBe('192.168.1.1');
  });
});

describe('credit', () => {
  it('splits an interval at local midnight', () => {
    const usage: Usage = {};
    credit(usage, 'youtube.com', at('2026-10-15T23:59:30'), at('2026-10-16T00:00:45'));
    expect(usage).toEqual({ '2026-10-15': { 'youtube.com': 30_000 }, '2026-10-16': { 'youtube.com': 45_000 } });
  });
  it('handles a 23-hour DST day (Berlin, 2026-03-29)', () => {
    const usage: Usage = {};
    credit(usage, 'a.com', at('2026-03-29T00:00:00'), at('2026-03-30T01:00:00'));
    expect(usage['2026-03-29']?.['a.com']).toBe(23 * HOUR);
    expect(usage['2026-03-30']?.['a.com']).toBe(HOUR);
  });
});

describe('underLimit', () => {
  it('covers subdomains and the same name on other TLDs, short names only exactly', async () => {
    const { underLimit, limitFor } = await import('./limits');
    expect(underLimit('ru.pinterest.com', 'pinterest.com')).toBe(true);
    expect(underLimit('www.pinterest.co.uk', 'pinterest.com')).toBe(true);
    expect(underLimit('pinterest.de', 'pinterest.com')).toBe(true);
    expect(underLimit('mypinterest.com', 'pinterest.com')).toBe(false);
    expect(underLimit('x.ai', 'x.com')).toBe(false);
    expect(underLimit('mobile.x.com', 'x.com')).toBe(true);
    expect(limitFor('pinterest.de', { 'pinterest.com': 1 })).toBe('pinterest.com');
    expect(limitFor('github.com', { 'pinterest.com': 1 })).toBe('github.com');
  });
  it('matches by registrable domain, so a name in a subdomain is not the site', async () => {
    const { underLimit } = await import('./limits');
    expect(underLimit(domainOf('https://mail.google.com/')!, 'mail.ru')).toBe(false);
    expect(underLimit(domainOf('https://web.telegram.org/')!, 'web.de')).toBe(false);
    expect(underLimit(domainOf('https://www.pinterest.co.uk/')!, 'pinterest.com')).toBe(true);
  });
});

describe('settle', () => {
  const t = at('2026-10-15T12:00:00');

  it('counts a domain open in two windows once, different domains each', () => {
    const usage: Usage = {};
    const next = settle({ open: { 1: 'youtube.com', 2: 'youtube.com', 3: 'twitch.tv' }, since: t }, t + 30_000, usage);
    expect(usage['2026-10-15']).toEqual({ 'youtube.com': 30_000, 'twitch.tv': 30_000, '*': 30_000 });
    expect(next.since).toBe(t + 30_000);
  });
  it('credits nothing for a sleep/crash gap or a clock moved back, but moves on', () => {
    for (const now of [t + MAX_GAP_MS + 1, t - 5_000]) {
      const usage: Usage = {};
      expect(settle({ open: { 1: 'youtube.com' }, since: t }, now, usage).since).toBe(now);
      expect(usage).toEqual({});
    }
  });
  it('stays paused while locked', () => {
    const usage: Usage = {};
    expect(settle({ open: { 1: 'youtube.com' }, since: null }, t, usage).since).toBeNull();
    expect(usage).toEqual({});
  });
});

describe('limits', () => {
  const today = '2026-10-15';
  const base = { limits: { 'youtube.com': 60 * MIN }, pending: {} };

  it('applies a new or lower limit now', () => {
    expect(changeLimit(base, 'twitch.tv', 30 * MIN, today).limits['twitch.tv']).toBe(30 * MIN);
    expect(changeLimit(base, 'youtube.com', 30 * MIN, today).limits['youtube.com']).toBe(30 * MIN);
  });
  it('defers a raise or a removal to tomorrow', () => {
    const raised = changeLimit(base, 'youtube.com', 90 * MIN, today);
    expect(raised.limits['youtube.com']).toBe(60 * MIN);
    expect(raised.pending['youtube.com']).toEqual({ limit: 90 * MIN, effectiveFrom: '2026-10-16' });
    expect(changeLimit(base, 'youtube.com', null, today).pending['youtube.com']?.limit).toBeNull();
  });
  it('treats removing a limit that does not exist as a no-op', () => {
    expect(changeLimit(base, 'twitch.tv', null, today)).toEqual(base);
  });
  it('lets tightening cancel a pending raise', () => {
    const raised = changeLimit(base, 'youtube.com', 90 * MIN, today);
    const tightened = changeLimit(raised, 'youtube.com', 45 * MIN, today);
    expect(tightened).toEqual({ limits: { 'youtube.com': 45 * MIN }, pending: {} });
  });
  it('rollover applies due changes only, and is idempotent', () => {
    const cfg = {
      limits: { 'youtube.com': 60 * MIN, 'twitch.tv': 30 * MIN },
      pending: {
        'youtube.com': { limit: 90 * MIN, effectiveFrom: '2026-10-16' },
        'twitch.tv': { limit: null, effectiveFrom: '2026-10-16' },
      },
    };
    expect(rollover(cfg, today)).toEqual(cfg);
    const next = rollover(cfg, '2026-10-16');
    expect(next).toEqual({ limits: { 'youtube.com': 90 * MIN }, pending: {} });
    expect(rollover(next, '2026-10-16')).toEqual(next);
  });
  it('finds blocked domains and time to the next exhaustion', () => {
    const used = { 'youtube.com': 60 * MIN, 'twitch.tv': 20 * MIN };
    const limits = { 'youtube.com': 60 * MIN, 'twitch.tv': 30 * MIN };
    expect(blockedDomains(used, limits)).toEqual(['youtube.com']);
    expect(msUntilExhaust(used, limits, ['twitch.tv', 'github.com'])).toBe(10 * MIN);
    expect(msUntilExhaust(used, limits, ['github.com'])).toBeNull();
  });
});
