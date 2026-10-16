import { type FormEvent, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { SetLimitMessage } from '../../src/adapter/reconcile';
import { domainOf } from '../../src/core/domain';
import { formatDuration, siteName } from '../../src/core/format';
import { t } from '../../src/core/i18n';
import type { LimitConfig } from '../../src/core/limits';
import { PRESETS, SiteIcon } from '../../src/ui/SiteIcon';

const MIN = 60_000;
const QUICK = [15, 30, 60];
const TOP_PRESETS = 4; // in the popup the rest fold under a toggle so the view reads at a glance

/** Accepts `youtube.com`, `m.youtube.com` or a full URL; returns the registrable domain. */
function parseDomain(input: string): string | null {
  const s = input.trim();
  return domainOf(/^https?:\/\//i.test(s) ? s : `https://${s}/`);
}

function parseMinutes(input: FormDataEntryValue | null): number | null {
  const m = Number(input);
  return Number.isInteger(m) && m >= 1 && m <= 24 * 60 ? m : null;
}

/** `compact` (the popup) folds presets past the first four; the full page shows them all. */
export function Limits({ compact = false }: { compact?: boolean }) {
  const [cfg, setCfg] = useState<LimitConfig | null>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>({
    text: '',
  });
  const [picking, setPicking] = useState<string | null>(null);
  const [allPresets, setAllPresets] = useState(!compact);
  const addForm = useRef<HTMLFormElement>(null);

  // Read-only view of storage; every write goes to the background as a message.
  useEffect(() => {
    const reload = () =>
      void browser.storage.local
        .get('limitConfig')
        .then((s) => setCfg((s.limitConfig as LimitConfig) ?? { limits: {}, pending: {} }));
    reload();
    browser.storage.local.onChanged.addListener(reload);
    return () => browser.storage.local.onChanged.removeListener(reload);
  }, []);

  if (!cfg) return null;
  const s = t().limits;

  async function send(domain: string, limit: number | null) {
    const current = cfg?.limits[domain];
    const res = (await browser.runtime.sendMessage({
      type: 'setLimit',
      domain,
      limit,
    } satisfies SetLimitMessage)) as {
      ok: boolean;
      error?: string;
    };
    if (!res?.ok)
      return setStatus({
        text: s.notSaved(res?.error ?? t().noAnswer),
        error: true,
      });
    const now = limit !== null && (current === undefined || limit <= current);
    setStatus({ text: s.status(siteName(domain), now ? s.now : s.tomorrow) });
  }

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget; // currentTarget is null once the handler returns
    const form = new FormData(el);
    const domain = parseDomain(String(form.get('domain') ?? ''));
    const minutes = parseMinutes(form.get('minutes'));
    if (!domain) return setStatus({ text: s.badDomain, error: true });
    if (minutes === null) return setStatus({ text: s.badMinutes, error: true });
    void send(domain, minutes * MIN).then(() => el.reset());
  }

  function onEdit(e: FormEvent<HTMLFormElement>, domain: string) {
    e.preventDefault();
    const minutes = parseMinutes(new FormData(e.currentTarget).get('minutes'));
    if (minutes === null) return setStatus({ text: s.badMinutes, error: true });
    void send(domain, minutes * MIN);
  }

  /** "Custom" on a preset: prefill the add form and hand focus to the minutes field. */
  function custom(domain: string) {
    const form = addForm.current;
    if (!form) return;
    (form.elements.namedItem('domain') as HTMLInputElement).value = domain;
    (form.elements.namedItem('minutes') as HTMLInputElement).focus();
    setPicking(null);
  }

  const limits = Object.entries(cfg.limits).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="limits">
      <h1 className="lead">
        {s.lead} <span className="muted">{s.leadSub}</span>
      </h1>

      <section className="presets" aria-labelledby="presets-title">
        <div className="presets-head">
          <h2 id="presets-title">{s.presets}</h2>
          <p className="muted">{s.presetsSub}</p>
        </div>
        <ul>
          {(allPresets ? PRESETS : PRESETS.slice(0, TOP_PRESETS)).map((domain) => {
            const max = cfg.limits[domain];
            const open = picking === domain;
            return (
              <li key={domain} className={`preset${open ? ' open' : ''}${max !== undefined ? ' set' : ''}`}>
                <button
                  type="button"
                  className="preset-face"
                  aria-expanded={open}
                  disabled={max !== undefined}
                  onClick={() => setPicking(open ? null : domain)}
                >
                  <SiteIcon domain={domain} size={22} />
                  <span className="preset-name">{siteName(domain)}</span>
                  {max !== undefined && <span className="preset-limit">{s.limited(formatDuration(max))}</span>}
                </button>
                {open && (
                  <div className="preset-pick">
                    {QUICK.map((m) => (
                      <button
                        type="button"
                        className="chip"
                        key={m}
                        onClick={() => {
                          setPicking(null);
                          void send(domain, m * MIN);
                        }}
                      >
                        {formatDuration(m * MIN)}
                      </button>
                    ))}
                    <button type="button" className="chip chip-quiet" onClick={() => custom(domain)}>
                      {s.custom}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {compact && (
          <button
            type="button"
            className="btn btn-quiet presets-more"
            aria-expanded={allPresets}
            onClick={() => setAllPresets(!allPresets)}
          >
            {allPresets ? s.fewer : s.more(PRESETS.length - TOP_PRESETS)}
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d={allPresets ? 'M3 9l4-4 4 4' : 'M3 5l4 4 4-4'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </section>

      <form ref={addForm} className="add" onSubmit={onAdd} aria-label={s.newLimit}>
        <label className="field grow">
          <span>{s.site}</span>
          <input className="input" name="domain" placeholder={s.placeholder} required />
        </label>
        <label className="field">
          <span>{s.perDay}</span>
          <input className="input minutes" name="minutes" type="number" min={1} max={1440} step={1} required />
        </label>
        <button className="btn btn-primary" type="submit">
          {s.add}
        </button>
      </form>

      <p className={`status ${status.error ? 'over' : 'muted'}`} role="status" aria-live="polite">
        {status.text}
      </p>

      {limits.length === 0 ? (
        <p className="muted">{s.none}</p>
      ) : (
        <ul className="limit-list">
          {limits.map(([domain, max]) => {
            const pending = cfg.pending[domain];
            return (
              // Remount when the limit or its pending change moves, so the input shows today's limit again.
              <li key={`${domain}:${max}:${pending?.limit}`}>
                <form
                  onSubmit={(e) => onEdit(e, domain)}
                  onInput={(e) => e.currentTarget.setAttribute('data-dirty', '')}
                  aria-label={domain}
                >
                  <span className="limit-site">
                    <SiteIcon domain={domain} size={20} />
                    <b>{siteName(domain)}</b>
                    {siteName(domain) !== domain && <span className="muted">{domain}</span>}
                  </span>
                  <label className="limit-minutes">
                    <input
                      className="input minutes"
                      name="minutes"
                      type="number"
                      min={1}
                      max={1440}
                      step={1}
                      defaultValue={max / MIN}
                      aria-label={s.minutesFor(domain)}
                    />
                    <span className="muted">{s.minPerDay}</span>
                  </label>
                  <button className="btn" type="submit">
                    {s.save}
                  </button>
                  <button className="btn btn-quiet" type="button" onClick={() => void send(domain, null)}>
                    {s.remove}
                  </button>
                </form>
                {pending && (
                  <p className="pending">
                    {s.fromTomorrow(pending.limit === null ? t().popup.noLimit : formatDuration(pending.limit))}{' '}
                    <button type="button" className="btn btn-quiet" onClick={() => void send(domain, max)}>
                      {s.cancel}
                    </button>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
