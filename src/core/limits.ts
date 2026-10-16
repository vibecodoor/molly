import { nextDay } from './day';

/** domain → daily limit in ms. */
export type Limits = Record<string, number>;

export interface LimitConfig {
  limits: Limits;
  /** Raises and removals wait for the next day; `limit: null` removes the limit. */
  pending: Record<string, { limit: number | null; effectiveFrom: string }>;
}

/** Tightening (incl. a brand-new limit) applies now; raising or removing applies from tomorrow. */
export function changeLimit(cfg: LimitConfig, domain: string, limit: number | null, today: string): LimitConfig {
  const { [domain]: _, ...pending } = cfg.pending;
  const current = cfg.limits[domain];
  if (limit === null && current === undefined) return { limits: cfg.limits, pending }; // nothing to remove
  if (limit !== null && (current === undefined || limit <= current)) {
    return { limits: { ...cfg.limits, [domain]: limit }, pending };
  }
  return { limits: cfg.limits, pending: { ...pending, [domain]: { limit, effectiveFrom: nextDay(today) } } };
}

/** Applies pending changes that are due. Idempotent, so it can run on every wake. */
export function rollover(cfg: LimitConfig, today: string): LimitConfig {
  const limits = { ...cfg.limits };
  const pending: LimitConfig['pending'] = {};
  for (const [domain, change] of Object.entries(cfg.pending)) {
    if (change.effectiveFrom > today) pending[domain] = change;
    else if (change.limit === null) delete limits[domain];
    else limits[domain] = change.limit;
  }
  return { limits, pending };
}

/**
 * Whether a host falls under a limit set on `limit`: the domain, its subdomains (ru.pinterest.com), or the same
 * name on another TLD (pinterest.de, pinterest.co.uk). Names under 3 letters (x, vk, ok) match only exactly.
 * ponytail: name match ignores the TLD entirely, so youtube.github.io counts as YouTube; a per-limit alias list if that bites.
 */
export function underLimit(host: string, limit: string): boolean {
  if (host === limit || host.endsWith(`.${limit}`)) return true;
  const name = limit.split('.')[0]!;
  return name.length >= 3 && host.split('.').slice(0, -1).includes(name);
}

/** The limited domain a site's time belongs to (itself when no limit covers it). */
export const limitFor = (domain: string, limits: Limits) => Object.keys(limits).find((l) => underLimit(domain, l)) ?? domain;

export function blockedDomains(today: Record<string, number>, limits: Limits): string[] {
  return Object.entries(limits)
    .filter(([d, max]) => (today[d] ?? 0) >= max)
    .map(([d]) => d);
}

/** ms until the first open, limited domain runs out; null if none is ticking toward a limit. */
export function msUntilExhaust(today: Record<string, number>, limits: Limits, open: string[]): number | null {
  const left = open.flatMap((d) => {
    const max = limits[d];
    return max === undefined ? [] : [max - (today[d] ?? 0)];
  });
  return left.length ? Math.max(0, Math.min(...left)) : null;
}
