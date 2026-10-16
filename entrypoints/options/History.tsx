import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { dayKey } from '../../src/core/day';
import { sites } from '../../src/core/engine';
import { dayShort, formatDuration, siteName, weekdayShort, weekRange } from '../../src/core/format';
import { type Days, shiftWeek, summarize, weekOf } from '../../src/core/history';
import { t } from '../../src/core/i18n';
import { EMPTY_CONFIG, type LimitConfig, type Limits } from '../../src/core/limits';
import { Molly } from '../../src/ui/Molly';

const HOUR = 3_600_000;
const INKS = ['var(--soil-1)', 'var(--soil-2)', 'var(--soil-3)'];
const OTHER_INK = 'var(--soil-x)';
const LIST_SIZE = 8;

export function useHistoryData() {
  const [data, setData] = useState<{ days: Days; dayLimits: Record<string, Limits>; cfg: LimitConfig } | null>(null);
  useEffect(() => {
    const reload = () =>
      void browser.storage.local.get(null).then((all) => {
        const days: Days = {};
        const dayLimits: Record<string, Limits> = {};
        for (const [k, v] of Object.entries(all)) {
          if (k.startsWith('day:')) days[k.slice(4)] = v as Days[string];
          else if (k.startsWith('limits:')) dayLimits[k.slice(7)] = v as Limits;
        }
        setData({ days, dayLimits, cfg: (all.limitConfig as LimitConfig) ?? EMPTY_CONFIG });
      });
    reload();
    browser.storage.local.onChanged.addListener(reload);
    return () => browser.storage.local.onChanged.removeListener(reload);
  }, []);
  return data;
}

export function History({ anchor }: { anchor: string }) {
  const data = useHistoryData();
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [anchor]);
  if (!data) return null;

  const today = dayKey(Date.now());
  const week = weekOf(anchor);
  const isThisWeek = week.includes(today);
  const s = summarize(data.days, week);
  const ink = (domain: string) => {
    const i = s.ranking.findIndex(([d]) => d === domain);
    return i >= 0 && i < INKS.length ? INKS[i]! : OTHER_INK;
  };

  const h = t().history;
  if (s.total === 0) {
    return (
      <section className="empty">
        <Molly pose="sleep" size={140} />
        <h1>{isThisWeek ? h.emptyThis : h.empty(weekRange(week[0]!, week[6]!))}</h1>
        <p className="muted">{isThisWeek ? h.emptyThisSub : h.emptySub}</p>
      </section>
    );
  }

  const [top, topMs] = s.ranking[0]!;
  const maxDay = Math.max(...s.perDay.map((d) => d.total));
  const scale = Math.max(8 * HOUR, Math.ceil(maxDay / (2 * HOUR)) * 2 * HOUR);
  const ticks = Array.from({ length: scale / (2 * HOUR) }, (_, i) => (i + 1) * 2);

  const listDays = selected ? [selected] : week;
  const list = selected ? summarize(data.days, [selected]).ranking : s.ranking;
  const shown = list.slice(0, LIST_SIZE);
  const rest = list.slice(LIST_SIZE);
  const listMax = shown[0]?.[1] ?? 1;

  return (
    <div className="history">
      <div className="history-main">
        <h1 className="lead">
          {isThisWeek
            ? h.leadThis(formatDuration(s.total))
            : h.lead(weekRange(week[0]!, week[6]!), formatDuration(s.total))}{' '}
          <span className="muted">{h.top(siteName(top), formatDuration(topMs))}</span>
        </h1>

        <figure className="chart" aria-label={h.chart}>
          <div className="chart-plot">
            {ticks.map((n) => (
              <div className="tick" key={n} style={{ bottom: `${((n * HOUR) / scale) * 100}%` }}>
                <span>
                  {n} {t().unit.h}
                </span>
              </div>
            ))}
            <div className="bars" key={week[0]}>
              {s.perDay.map(({ day, total }, i) => {
                const usage = sites(data.days[day] ?? {}).sort(([, a], [, b]) => b - a);
                const named = usage.filter(([d]) => ink(d) !== OTHER_INK);
                const other = usage.filter(([d]) => ink(d) === OTHER_INK).reduce((a, [, ms]) => a + ms, 0);
                const segs = [
                  ...named.sort(([a], [b]) => INKS.indexOf(ink(a)) - INKS.indexOf(ink(b))),
                  ['', other] as const,
                ];
                return (
                  <button
                    type="button"
                    key={day}
                    className={`day${day === selected ? ' selected' : ''}${day === today ? ' today' : ''}`}
                    aria-pressed={day === selected}
                    aria-label={`${weekdayShort(day)}, ${dayShort(day)}: ${formatDuration(total)}`}
                    disabled={day > today}
                    onClick={() => setSelected(day === selected ? null : day)}
                  >
                    <span
                      className="stack"
                      style={{ height: `${(total / scale) * 100}%`, animationDelay: `${i * 45}ms` }}
                    >
                      {segs.map(([d, ms]) =>
                        ms > 0 ? (
                          <span key={d || 'other'} style={{ flexGrow: ms, background: d ? ink(d) : OTHER_INK }} />
                        ) : null,
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <Molly pose="peek" size={80} className="chart-molly" />
          </div>
          <div className="day-labels" aria-hidden="true">
            {week.map((day) => (
              <span key={day} className={day === today ? 'today' : day === selected ? 'selected' : ''}>
                <b>{weekdayShort(day)}</b>
                <i>{day === today ? h.today : dayShort(day)}</i>
              </span>
            ))}
          </div>
        </figure>
      </div>

      <section className="sites" aria-labelledby="sites-title">
        <div className="sites-head">
          <h2 id="sites-title">{selected ? `${weekdayShort(selected)}, ${dayShort(selected)}` : h.sitesWeek}</h2>
          {selected && (
            <button type="button" className="btn btn-quiet" onClick={() => setSelected(null)}>
              {h.wholeWeek}
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="muted">{h.emptyDay}</p>
        ) : (
          <ol>
            {shown.map(([domain, ms], i) => {
              const limit = data.cfg.limits[domain];
              // Days stored before per-day limits existed fall back to today's limits.
              const hit = (d: string) => {
                const max = (data.dayLimits[d] ?? data.cfg.limits)[domain];
                return max !== undefined && (data.days[d]?.[domain] ?? 0) >= max;
              };
              const hits = limit ? listDays.filter(hit).length : 0;
              return (
                <li key={domain}>
                  <span className="rank">{i + 1}</span>
                  <span className="site">
                    <span className="site-name">{siteName(domain)}</span>
                    {limit !== undefined && (
                      <span className={`site-limit${hits ? ' over' : ''}`}>
                        {h.limit(formatDuration(limit))}
                        {hits > 0 && (selected ? h.hit : h.hits(hits))}
                      </span>
                    )}
                  </span>
                  <span className="site-time">{formatDuration(ms)}</span>
                  <span className="site-bar" style={{ width: `${(ms / listMax) * 100}%`, background: ink(domain) }} />
                </li>
              );
            })}
          </ol>
        )}
        {rest.length > 0 && (
          <p className="muted rest">{h.rest(rest.length, formatDuration(rest.reduce((a, [, ms]) => a + ms, 0)))}</p>
        )}
      </section>
    </div>
  );
}

/** Week switcher shared by the options strip and the popup's History tab. */
export function WeekStepper({ anchor, onChange }: { anchor: string; onChange: (day: string) => void }) {
  const s = t().shell;
  const week = weekOf(anchor);
  const isThisWeek = week.includes(dayKey(Date.now()));
  return (
    <div className="stepper" role="group" aria-label={s.week}>
      <button
        type="button"
        className="btn btn-quiet"
        aria-label={s.prev}
        onClick={() => onChange(shiftWeek(anchor, -1))}
      >
        <Chevron dir="left" />
      </button>
      <span>{isThisWeek ? s.thisWeek : weekRange(week[0]!, week[6]!)}</span>
      <button
        type="button"
        className="btn btn-quiet"
        aria-label={s.next}
        disabled={isThisWeek}
        onClick={() => onChange(shiftWeek(anchor, 1))}
      >
        <Chevron dir="right" />
      </button>
    </div>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M11 4 6 9l5 5' : 'M7 4l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
