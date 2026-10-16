import { browser } from 'wxt/browser';
import { dayKey, nextMidnight } from '../core/day';
import { domainOf } from '../core/domain';
import { type EngineState, type Usage, settle } from '../core/engine';
import { mergeDays, parseBackup, restoreLimits } from '../core/history';
import { type Lang, type Theme, DEFAULT_LANG, isLang, isTheme, setLang } from '../core/i18n';
import { type LimitConfig, blockedDomains, changeLimit, limitFor, msUntilExhaust, rollover } from '../core/limits';

const TICK_MIN = 0.5; // MAX_GAP_MS in core/engine.ts assumes this 30 s tick
export const IDLE_INTERVAL_S = 15;

/**
 * The single entry point for every background event: settle time, roll the day over,
 * re-read which tabs are active, then bring block rules and alarms in line. The overlay itself is drawn by
 * entrypoints/guard.content.ts from the same stored state.
 * Must not run concurrently (see the queue in entrypoints/background.ts).
 */
export async function reconcile(now = Date.now()): Promise<void> {
  const { engine, limitConfig } = (await browser.storage.local.get(['engine', 'limitConfig'])) as {
    engine?: EngineState;
    limitConfig?: LimitConfig;
  };
  const prev = engine ?? { open: {}, since: null };
  const today = dayKey(now);
  const dayKeys = [...new Set([dayKey(prev.since ?? now), today])].map((d) => `day:${d}`);
  const stored = (await browser.storage.local.get(dayKeys)) as Record<string, Record<string, number>>;
  const usage: Usage = Object.fromEntries(dayKeys.map((k) => [k.slice(4), stored[k] ?? {}]));

  const settled = settle(prev, now, usage);
  const cfg = rollover(limitConfig ?? { limits: {}, pending: {} }, today);
  const used = usage[today] ?? {};
  const blocked = blockedDomains(used, cfg.limits);
  const locked = (await browser.idle.queryState(IDLE_INTERVAL_S)) === 'locked';
  const open: EngineState['open'] = {};
  for (const tab of await browser.tabs.query({ active: true })) {
    const site = domainOf(tab.url);
    const domain = site && limitFor(site, cfg.limits); // pinterest.de counts toward a pinterest.com limit
    // A blocked site still loads under the overlay; time behind the overlay isn't time on the site.
    if (domain && !blocked.includes(domain)) open[tab.windowId] = domain;
  }

  await browser.storage.local.set({
    engine: { open, since: locked ? null : (settled.since ?? now) } satisfies EngineState,
    ...Object.fromEntries(Object.entries(usage).map(([d, v]) => [`day:${d}`, v])),
    ...(JSON.stringify(cfg) !== JSON.stringify(limitConfig) && { limitConfig: cfg }),
  });

  await syncBlockRules(blocked);
  await scheduleAlarms(now, locked ? null : msUntilExhaust(used, cfg.limits, [...new Set(Object.values(open))]));
}

/** Message from an extension page. Validated here: this is where UI input enters stored state. */
export interface SetLimitMessage {
  type: 'setLimit';
  domain: string;
  /** ms per day; null removes the limit. */
  limit: number | null;
}

/** Applies a limit change (tighten now / raise or remove tomorrow). Run inside the background queue. */
export async function setLimit({ domain, limit }: SetLimitMessage, now = Date.now()): Promise<void> {
  if (typeof domain !== 'string' || domainOf(`https://${domain}/`) !== domain) throw new Error(`bad domain: ${domain}`);
  if (limit !== null && !(Number.isFinite(limit) && limit > 0)) throw new Error(`bad limit: ${limit}`);
  const { limitConfig } = (await browser.storage.local.get('limitConfig')) as { limitConfig?: LimitConfig };
  const cfg = changeLimit(limitConfig ?? { limits: {}, pending: {} }, domain, limit, dayKey(now));
  await browser.storage.local.set({ limitConfig: cfg });
}

/** Embeds of a blocked site on other pages (sub_frame) are dropped; the site itself gets the overlay. Rebuilt only when the set changes. */
async function syncBlockRules(blocked: string[]): Promise<void> {
  const current = await browser.declarativeNetRequest.getDynamicRules();
  // Old installs also hold main_frame redirect rules: any rule that isn't exactly the wanted set gets rebuilt.
  const have = current
    .map((r) => `${r.action.type}:${r.condition.requestDomains?.join()}`)
    .sort()
    .join();
  if (have === blocked.map((d) => `block:${d}`).sort().join()) return;
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: current.map((r) => r.id),
    addRules: blocked.map((domain, i) => ({
      id: i + 1,
      priority: 1,
      action: { type: 'block' as const },
      condition: { requestDomains: [domain], resourceTypes: ['sub_frame' as const] },
    })),
  });
}

export interface SetLangMessage {
  type: 'setLang';
  lang: Lang;
}

/** UI language preference; pages re-render on the storage change. */
export async function saveLang({ lang }: SetLangMessage): Promise<void> {
  if (!isLang(lang)) throw new Error(`bad lang: ${lang}`);
  await browser.storage.local.set({ lang });
}

export interface SetThemeMessage {
  type: 'setTheme';
  theme: Theme;
}

/** Colour theme preference; pages apply it on the storage change. */
export async function saveTheme({ theme }: SetThemeMessage): Promise<void> {
  if (!isTheme(theme)) throw new Error(`bad theme: ${theme}`);
  await browser.storage.local.set({ theme });
}

export interface ImportBackupMessage {
  type: 'importBackup';
  text: string;
}

/** Restores a JSON backup: days merge without losing time, limits obey tighten-now / raise-tomorrow. */
export async function importBackup({ text }: ImportBackupMessage, now = Date.now()): Promise<{ days: number }> {
  const { lang } = await browser.storage.local.get('lang');
  setLang(isLang(lang) ? lang : DEFAULT_LANG); // parse errors are shown to the user
  const backup = parseBackup(text);
  const keys = Object.keys(backup.days).map((d) => `day:${d}`);
  const stored = (await browser.storage.local.get([...keys, 'limitConfig'])) as Record<string, never>;
  const current = Object.fromEntries(Object.keys(backup.days).map((d) => [d, stored[`day:${d}`] ?? {}]));
  const merged = mergeDays(current, backup.days);
  const cfg = restoreLimits(stored.limitConfig ?? { limits: {}, pending: {} }, backup.limits, dayKey(now));
  await browser.storage.local.set({
    ...Object.fromEntries(Object.entries(merged).map(([d, v]) => [`day:${d}`, v])),
    limitConfig: cfg,
  });
  return { days: keys.length };
}

async function scheduleAlarms(now: number, untilExhaust: number | null): Promise<void> {
  if (!(await browser.alarms.get('tick'))) await browser.alarms.create('tick', { periodInMinutes: TICK_MIN });
  await browser.alarms.create('midnight', { when: nextMidnight(now) });
  if (untilExhaust === null) await browser.alarms.clear('exhaust');
  else await browser.alarms.create('exhaust', { when: now + untilExhaust + 250 }); // +250 ms: land past the limit
}
