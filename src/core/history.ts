import { dateOf, dayKey, nextDay } from './day';
import { domainOf } from './domain';
import { ANY, dayTotal, sites } from './engine';
import { t } from './i18n';
import { changeLimit, type LimitConfig } from './limits';

/** day → domain → ms */
export type Days = Record<string, Record<string, number>>;

/** The Monday-to-Sunday week containing `day`. */
export function weekOf(day: string): string[] {
  const first = dayKey(dateOf(day, -((dateOf(day).getDay() + 6) % 7)).getTime());
  const week = [first];
  while (week.length < 7) week.push(nextDay(week[week.length - 1]!));
  return week;
}

export function shiftWeek(day: string, weeks: number): string {
  return dayKey(dateOf(day, 7 * weeks).getTime());
}

export interface Summary {
  total: number;
  /** Sites by time, biggest first. */
  ranking: [string, number][];
  perDay: { day: string; total: number }[];
}

export function summarize(days: Days, keys: string[]): Summary {
  const sums: Record<string, number> = {};
  const perDay = keys.map((day) => {
    const usage = days[day] ?? {};
    for (const [domain, ms] of sites(usage)) sums[domain] = (sums[domain] ?? 0) + ms;
    return { day, total: dayTotal(usage) };
  });
  const ranking = Object.entries(sums).sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  return { total: perDay.reduce((a, d) => a + d.total, 0), ranking, perDay };
}

/** `date,domain,seconds`, CRLF, oldest first. */
export function toCsv(days: Days): string {
  const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = Object.keys(days)
    .sort()
    .flatMap((day) =>
      sites(days[day] ?? {})
        .sort(([, a], [, b]) => b - a)
        .map(([domain, ms]) => `${day},${quote(domain)},${Math.round(ms / 1000)}`),
    );
  return ['date,domain,seconds', ...rows].join('\r\n') + '\r\n';
}

export interface Backup {
  app: 'molly';
  schemaVersion: 1;
  exportedAt: string;
  days: Days;
  limits: LimitConfig['limits'];
}

export function makeBackup(days: Days, limits: LimitConfig['limits'], now: number): Backup {
  return { app: 'molly', schemaVersion: 1, exportedAt: new Date(now).toISOString(), days, limits };
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isDomain = (s: string) => domainOf(`https://${s}/`) === s;
const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Validates an untrusted backup file. Throws with a message fit for the user. */
export function parseBackup(text: string): Pick<Backup, 'days' | 'limits'> {
  let data: Partial<Backup>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t().backup.notJson);
  }
  if (data?.app !== 'molly' || data.schemaVersion !== 1) throw new Error(t().backup.notMolly);
  const days: Days = {};
  for (const [day, usage] of Object.entries(data.days ?? {})) {
    if (!isDay(day) || typeof usage !== 'object' || usage === null) throw new Error(t().backup.badDay(day));
    days[day] = {};
    for (const [domain, ms] of Object.entries(usage)) {
      if ((domain !== ANY && !isDomain(domain)) || !isMs(ms)) throw new Error(t().backup.badEntry(day, domain));
      days[day][domain] = ms;
    }
  }
  const limits: Backup['limits'] = {};
  for (const [domain, ms] of Object.entries(data.limits ?? {})) {
    if (!isDomain(domain) || !isMs(ms) || ms === 0) throw new Error(t().backup.badLimit(domain));
    limits[domain] = ms;
  }
  return { days, limits };
}

/** Restoring never loses time: per day and domain, the larger value wins. */
export function mergeDays(current: Days, incoming: Days): Days {
  const out: Days = { ...current };
  for (const [day, usage] of Object.entries(incoming)) {
    const merged = { ...(out[day] ?? {}) };
    for (const [domain, ms] of Object.entries(usage)) merged[domain] = Math.max(merged[domain] ?? 0, ms);
    out[day] = merged;
  }
  return out;
}

/** Restored limits obey the same rule as edits: tighter now, looser tomorrow. */
export function restoreLimits(cfg: LimitConfig, limits: Backup['limits'], today: string): LimitConfig {
  return Object.entries(limits).reduce((acc, [domain, ms]) => changeLimit(acc, domain, ms, today), cfg);
}
