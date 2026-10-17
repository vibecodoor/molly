import { dayKey, nextMidnight } from './day';

/** day (`YYYY-MM-DD`) → domain → ms. Storage keeps one `day:<key>` entry per day. */
export type Usage = Record<string, Record<string, number>>;

export interface EngineState {
  /** tabId → domain of each counted tab: the focused window's active tab, plus any tab playing sound (non-http left out). */
  open: Record<string, string>;
  /** Start of the unsettled interval; null while paused (screen locked). */
  since: number | null;
}

/** 2.5 × the 30 s tick. A longer gap means the engine didn't run (sleep, crash): credit nothing. */
export const MAX_GAP_MS = 75_000;

/** Reserved day key: wall-clock time with any site open, counted once however many windows show one. */
export const ANY = '*';

/** A day's per-site entries, without the `ANY` total. */
export const sites = (day: Record<string, number>) => Object.entries(day).filter(([d]) => d !== ANY);

/**
 * Real time in the browser. Days stored before `ANY` existed fall back to the per-site sum; the day `ANY`
 * started mid-way is lifted to its biggest site, since real time is never less than any one site.
 */
export const dayTotal = (day: Record<string, number>) => {
  const ms = sites(day).map(([, v]) => v);
  return day[ANY] === undefined ? ms.reduce((a, b) => a + b, 0) : Math.max(day[ANY], ...ms);
};

/** Adds [from, to) to `domain`, split at local midnight. */
export function credit(usage: Usage, domain: string, from: number, to: number): void {
  while (from < to) {
    const end = Math.min(to, nextMidnight(from));
    const day = (usage[dayKey(from)] ??= {});
    day[domain] = (day[domain] ?? 0) + end - from;
    from = end;
  }
}

/** Credits the time since the last settle to every open domain, once per domain. */
export function settle(state: EngineState, now: number, usage: Usage): EngineState {
  if (state.since === null) return state;
  const gap = now - state.since;
  if (gap > 0 && gap <= MAX_GAP_MS) {
    const domains = new Set(Object.values(state.open));
    for (const domain of domains) credit(usage, domain, state.since, now);
    if (domains.size > 0) credit(usage, ANY, state.since, now);
  }
  return { ...state, since: now };
}
