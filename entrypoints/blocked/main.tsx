import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { nextMidnight } from '../../src/core/day';
import { formatDuration, siteName } from '../../src/core/format';
import { t } from '../../src/core/i18n';
import { Molly } from '../../src/ui/Molly';
import { initLang, useLang } from '../../src/ui/lang';
import '../../src/ui/theme.css';
import './style.css';

const params = new URLSearchParams(location.search);
const domain = params.get('d') ?? '';
/** Set by the content script when it puts the overlay back after the site removed it. */
const again = params.has('again');
// Resolved once: the countdown re-renders every second, and after an extension reload the API is gone.
const HISTORY_URL = browser.runtime.getURL('/options.html#history');
const OPENS_AT = nextMidnight(Date.now()); // fixed at load; at midnight the content script lifts the overlay

function Tape({ tilt, reverse }: { tilt: 'a' | 'b' | 'c'; reverse?: boolean }) {
  const run = Array.from({ length: 6 }, (_, i) => (
    <span className="tape-run" key={i}>
      {t().blocked.tape.map((word) => (
        <span key={word}>
          {word}
          <i aria-hidden="true" />
        </span>
      ))}
    </span>
  ));
  return (
    <div className={`tape tape-${tilt}`} aria-hidden="true">
      <div className={`tape-track${reverse ? ' reverse' : ''}`}>{run}</div>
    </div>
  );
}

function Blocked() {
  const lang = useLang();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const b = t().blocked;
  const name = siteName(domain) || b.thisSite;
  useEffect(() => {
    document.title = b.title(name);
  }, [lang]);

  return (
    // Lives in an iframe over the live site (entrypoints/guard.content.ts); the site shows through, blurred.
    <main className={`blocked${again ? '' : ' enter'}`}>
      <div className="scrim" />
      <Tape tilt="a" />
      <Tape tilt="b" reverse />
      <Tape tilt="c" />

      <Molly size={168} className="ground-molly" />
      <section className="note" aria-live="polite">
        <div className="note-text">
          <h1>{b.headline(name)}</h1>
          <p className="countdown">
            {b.opens}
            <strong>{formatDuration(Math.max(0, OPENS_AT - now))}</strong>
          </p>
          <a className="history-link" href={HISTORY_URL} target="_blank" rel="noreferrer">
            {b.week}
          </a>
        </div>
      </section>
    </main>
  );
}

void initLang().then(() => createRoot(document.getElementById('root')!).render(<Blocked />));
