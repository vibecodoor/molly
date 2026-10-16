import { describe, expect, it } from 'vitest';
import { dayShort, siteName, weekRange, weekdayShort } from './format';
import { makeBackup, mergeDays, parseBackup, restoreLimits, shiftWeek, summarize, toCsv, weekOf } from './history';
import { setLang } from './i18n';

// Expectations are written in Russian; the shipped default is English.
setLang('ru');

const MIN = 60_000;

describe('weeks', () => {
  it('runs Monday to Sunday and crosses month ends', () => {
    expect(weekOf('2026-10-15')).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
    ]);
    expect(weekOf('2026-10-18')[0]).toBe('2026-10-12'); // Sunday belongs to the week that started Monday
    expect(weekOf('2026-11-01')[0]).toBe('2026-10-26');
    expect(shiftWeek('2026-10-15', -1)).toBe('2026-10-08');
  });
  it('formats Russian day and range labels', () => {
    expect(weekdayShort('2026-10-14')).toBe('Ср');
    expect(dayShort('2026-10-14')).toBe('14 окт');
    expect(weekRange('2026-10-12', '2026-10-18')).toBe('12–18 окт');
    expect(weekRange('2026-09-28', '2026-10-04')).toBe('28 сен – 4 окт');
    expect(siteName('youtube.com')).toBe('YouTube');
    expect(siteName('chatgpt.com')).toBe('ChatGPT');
    expect(siteName('example.org')).toBe('example.org');
  });
});

describe('summarize', () => {
  it('totals the week, ranks sites, keeps empty days', () => {
    const s = summarize(
      { '2026-10-12': { 'youtube.com': 30 * MIN, 'github.com': 10 * MIN }, '2026-10-14': { 'youtube.com': 5 * MIN } },
      weekOf('2026-10-12'),
    );
    expect(s.total).toBe(45 * MIN);
    expect(s.ranking).toEqual([['youtube.com', 35 * MIN], ['github.com', 10 * MIN]]);
    expect(s.perDay.map((d) => d.total)).toEqual([40 * MIN, 0, 5 * MIN, 0, 0, 0, 0]);
  });
  it('takes the real time from the * key, not the sum of overlapping sites', () => {
    const s = summarize({ '2026-10-12': { 'chatgpt.com': 5 * MIN, 'yahoo.com': 5 * MIN, '*': 5 * MIN } }, ['2026-10-12']);
    expect(s.total).toBe(5 * MIN);
    expect(s.ranking).toEqual([['chatgpt.com', 5 * MIN], ['yahoo.com', 5 * MIN]]);
    // the day * appeared mid-way: never below the biggest site
    expect(summarize({ d: { 'chatgpt.com': 13 * MIN, '*': 6_000 } }, ['d']).total).toBe(13 * MIN);
  });
});

describe('csv', () => {
  it('writes date,domain,seconds oldest first with CRLF', () => {
    expect(toCsv({ '2026-10-13': { 'b.com': 1500, '*': 1500 }, '2026-10-12': { 'a.com': 61_400, 'c.com': 120_000 } })).toBe(
      'date,domain,seconds\r\n2026-10-12,c.com,120\r\n2026-10-12,a.com,61\r\n2026-10-13,b.com,2\r\n',
    );
  });
});

describe('backup', () => {
  const days = { '2026-10-12': { 'youtube.com': 30 * MIN } };
  const limits = { 'youtube.com': 60 * MIN };

  it('round-trips', () => {
    expect(parseBackup(JSON.stringify(makeBackup(days, limits, 0)))).toEqual({ days, limits });
    const real = { '2026-10-12': { 'youtube.com': 30 * MIN, '*': 30 * MIN } };
    expect(parseBackup(JSON.stringify(makeBackup(real, limits, 0))).days).toEqual(real);
  });
  it('rejects junk with an user-readable message', () => {
    expect(() => parseBackup('nope')).toThrow('Это не JSON-файл.');
    expect(() => parseBackup('{"app":"other"}')).toThrow('Это не копия Molly.');
    const bad = (patch: object) => JSON.stringify({ ...makeBackup(days, limits, 0), ...patch });
    expect(() => parseBackup(bad({ days: { yesterday: {} } }))).toThrow('Испорчен день');
    expect(() => parseBackup(bad({ days: { '2026-10-12': { 'youtube.com': -1 } } }))).toThrow('Испорчена запись');
    expect(() => parseBackup(bad({ days: { '2026-10-12': { 'm.youtube.com': 5 } } }))).toThrow('Испорчена запись');
    expect(() => parseBackup(bad({ limits: { 'youtube.com': 0 } }))).toThrow('Испорчен лимит');
  });
  it('merges without losing time and restores limits by the tighten-now rule', () => {
    expect(mergeDays({ '2026-10-12': { 'youtube.com': 40 * MIN, 'a.com': 1 } }, days)).toEqual({
      '2026-10-12': { 'youtube.com': 40 * MIN, 'a.com': 1 },
    });
    const cfg = restoreLimits({ limits: { 'youtube.com': 30 * MIN }, pending: {} }, { 'youtube.com': 60 * MIN, 'twitch.tv': 20 * MIN }, '2026-10-15');
    expect(cfg.limits).toEqual({ 'youtube.com': 30 * MIN, 'twitch.tv': 20 * MIN });
    expect(cfg.pending['youtube.com']).toEqual({ limit: 60 * MIN, effectiveFrom: '2026-10-16' });
  });
});

describe('i18n', () => {
  it('formats durations, days and names in English, then back', async () => {
    const { DEFAULT_LANG } = await import('./i18n');
    const { formatDuration } = await import('./format');
    expect(DEFAULT_LANG).toBe('en');
    setLang('en');
    expect(formatDuration(65 * MIN)).toBe('1 h 5 min');
    expect(dayShort('2026-10-13')).toBe('13 Oct');
    expect(siteName('kinopoisk.ru')).toBe('Kinopoisk');
    expect(() => parseBackup('nope')).toThrow('This is not a JSON file.');
    setLang('ru');
    expect(siteName('kinopoisk.ru')).toBe('Кинопоиск');
  });
});
