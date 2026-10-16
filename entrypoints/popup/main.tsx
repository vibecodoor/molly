import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import type { SetLimitMessage } from '../../src/adapter/reconcile';
import { dayKey } from '../../src/core/day';
import { domainOf } from '../../src/core/domain';
import { dayTotal, type EngineState, settle, sites } from '../../src/core/engine';
import { formatDuration, siteName } from '../../src/core/format';
import { t } from '../../src/core/i18n';
import { EMPTY_CONFIG, type LimitConfig, limitFor } from '../../src/core/limits';
import { initLang, useLang } from '../../src/ui/lang';
import { Molly } from '../../src/ui/Molly';
import { SiteIcon } from '../../src/ui/SiteIcon';
import { History, WeekStepper } from '../options/History';
import { Limits, MIN, QUICK } from '../options/Limits';
import { Settings } from '../options/Settings';
import '../options/style.css';
import '../../src/ui/theme.css';
import './style.css';

const LAYERS = 4; // named strata; the rest fold into one "other" layer

/** Today's sites as soil strata under Molly's ground line: thicker and darker = more time. */
function Strata({ top, total, onOpen }: { top: [string, number][]; total: number; onOpen: () => void }) {
  const s = t().popup;
  const named = top.slice(0, LAYERS);
  const rest = top.slice(LAYERS);
  const layers: { key: string; label: string; ms: number; ink: string; domain?: string }[] = [
    ...named.map(([domain, ms], i) => ({
      key: domain,
      label: siteName(domain),
      ms,
      ink: i < 3 ? String(i + 1) : 'x',
      domain,
    })),
    ...(rest.length
      ? [{ key: 'rest', label: s.more(rest.length), ms: rest.reduce((a, [, ms]) => a + ms, 0), ink: 'x' }]
      : []),
  ];
  if (!layers.length) return <p className="strata-empty muted">{s.empty}</p>;
  const max = Math.max(...layers.map((l) => l.ms));
  return (
    <ol className="strata" aria-label={s.sitesToday}>
      {layers.map((l, i) => (
        <li key={l.key} style={{ animationDelay: `${i * 60}ms` }}>
          <button
            type="button"
            className="layer"
            style={{
              height: 28 + Math.round(30 * (l.ms / max)),
              background: `var(--soil-${l.ink})`,
              color: `var(--on-soil-${l.ink})`,
            }}
            onClick={onOpen}
          >
            {l.domain && <SiteIcon domain={l.domain} size={16} />}
            <span className="layer-name">{l.label}</span>
            <span className="layer-time">
              <span className="layer-share">{s.share(Math.round((l.ms / Math.max(total, max)) * 100))}</span>
              {formatDuration(l.ms)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

interface Snapshot {
  engine?: EngineState;
  cfg: LimitConfig;
  used: Record<string, number>;
  /** Domain of the active tab in this window, if it is a site. */
  here: string | null;
}

// Read-only: the popup never writes storage (writes belong to the background queue).
async function load(): Promise<Snapshot> {
  const key = `day:${dayKey(Date.now())}`;
  const [s, [tab]] = await Promise.all([
    browser.storage.local.get(['engine', 'limitConfig', key]) as Promise<Record<string, never>>,
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);
  return {
    engine: s.engine,
    cfg: s.limitConfig ?? EMPTY_CONFIG,
    used: s[key] ?? {},
    here: domainOf(tab?.url),
  };
}

/** Stored usage plus the not-yet-settled interval, so the numbers tick every second. */
function liveUsage(snap: Snapshot, now: number): Record<string, number> {
  const today = dayKey(now);
  const usage = { [today]: { ...snap.used } };
  if (snap.engine) settle(snap.engine, now, usage);
  return usage[today] ?? {};
}

const TABS = ['today', 'limits', 'history', 'settings'] as const;
type Tab = (typeof TABS)[number];

/** The popup holds every view; the expand button opens the same view in a full tab (options.html). */
function Popup() {
  useLang();
  const [tab, setTab] = useState<Tab>('today');
  const [anchor, setAnchor] = useState(() => dayKey(Date.now()));
  const full = () =>
    void browser.tabs.create({
      url: `${browser.runtime.getURL('/options.html')}#${tab === 'today' ? 'history' : tab}`,
    });

  return (
    <div className={`popup popup-${tab}`}>
      <div className="view">
        {tab === 'today' ? (
          <Today onHistory={() => setTab('history')} />
        ) : tab === 'limits' ? (
          <Limits compact />
        ) : tab === 'history' ? (
          <>
            <WeekStepper anchor={anchor} onChange={setAnchor} />
            <History anchor={anchor} />
          </>
        ) : (
          <Settings />
        )}
      </div>
      <nav className="tabbar" aria-label={t().shell.sections}>
        {TABS.map((id) => (
          <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            {id === 'today' ? t().popup.todayTab : t().tabs[id]}
          </button>
        ))}
        <button type="button" className="expand" aria-label={t().popup.full} title={t().popup.full} onClick={full}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M9.5 2.5h4v4M13.5 2.5 8 8M6.5 3.5h-3v9h9v-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </nav>
    </div>
  );
}

function Today({ onHistory }: { onHistory: () => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const reload = () => void load().then(setSnap);
    reload();
    browser.storage.local.onChanged.addListener(reload);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      browser.storage.local.onChanged.removeListener(reload);
      clearInterval(timer);
    };
  }, []);

  if (!snap) return null;
  const s = t().popup;
  const used = liveUsage(snap, now);
  const limits = Object.entries(snap.cfg.limits).sort(([a], [b]) => a.localeCompare(b));
  const top = sites(used).sort(([, a], [, b]) => b - a);
  // No quick limit for a site an existing limit already covers (youtube.de under youtube.com): it would never fill.
  const here =
    snap.here && limitFor(snap.here, snap.cfg.limits) === snap.here && snap.cfg.limits[snap.here] === undefined
      ? snap.here
      : null;

  const limit = (domain: string, minutes: number) =>
    void browser.runtime.sendMessage({ type: 'setLimit', domain, limit: minutes * MIN } satisfies SetLimitMessage);
  return (
    <main className="today-view">
      <div className="dig">
        <header className="head">
          <Molly size={52} />
          <div>
            <h1>{formatDuration(dayTotal(used))}</h1>
            <p className="muted">{s.today}</p>
          </div>
        </header>
        <Strata top={top} total={dayTotal(used)} onOpen={onHistory} />
      </div>
      {here && (
        <section className="quick" aria-label={`${s.quick}: ${siteName(here)}`}>
          <span className="quick-site">
            <SiteIcon domain={here} size={18} />
            <b>{siteName(here)}</b>
          </span>
          <span className="quick-actions">
            <span className="muted">{s.quick}</span>
            {QUICK.map((m) => (
              <button type="button" className="chip" key={m} onClick={() => limit(here, m)}>
                {formatDuration(m * MIN)}
              </button>
            ))}
          </span>
        </section>
      )}
      {limits.length > 0 && (
        <section>
          <h2>{t().tabs.limits}</h2>
          {limits.map(([domain, max]) => {
            const spent = used[domain] ?? 0;
            const over = spent >= max;
            const pending = snap.cfg.pending[domain];
            return (
              <div className="limit" key={domain}>
                <div className="row">
                  <span className="domain">
                    <SiteIcon domain={domain} size={16} />
                    {siteName(domain)}
                  </span>
                  <span className={over ? 'over' : ''}>{over ? s.closed : s.left(formatDuration(max - spent))}</span>
                </div>
                <div
                  className="bar"
                  role="progressbar"
                  aria-label={domain}
                  aria-valuemin={0}
                  aria-valuemax={max}
                  aria-valuenow={Math.min(spent, max)}
                >
                  <div className={over ? 'over' : ''} style={{ width: `${Math.min(100, (spent / max) * 100)}%` }} />
                </div>
                <p className="sub muted">
                  {t().history.limit(formatDuration(max))}
                  {pending && s.fromTomorrow(pending.limit === null ? s.noLimit : formatDuration(pending.limit))}
                </p>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}

void initLang().then(() => createRoot(document.getElementById('root')!).render(<Popup />));
