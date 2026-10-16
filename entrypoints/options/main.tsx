import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { dayKey } from '../../src/core/day';
import { t } from '../../src/core/i18n';
import { Molly } from '../../src/ui/Molly';
import { initLang, useLang } from '../../src/ui/lang';
import '../../src/ui/theme.css';
import { History, WeekStepper } from './History';
import { Limits } from './Limits';
import { Settings } from './Settings';
import './style.css';

const TABS = ['history', 'limits', 'settings'] as const;
type Tab = (typeof TABS)[number];
const tabFromHash = (): Tab => TABS.find((tab) => `#${tab}` === location.hash) ?? 'history';

function Options() {
  const lang = useLang();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [anchor, setAnchor] = useState(() => dayKey(Date.now()));

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.title = t().shell.title(t().tabs[tab]);
  }, [tab, lang]);

  const s = t().shell;

  return (
    <>
      <header className="strip">
        <a className="brand" href="#history" aria-label={s.brand}>
          <Molly size={34} />
          <span>Molly</span>
        </a>
        <nav aria-label={s.sections}>
          {TABS.map((id) => (
            <a key={id} href={`#${id}`} aria-current={tab === id ? 'page' : undefined}>
              {t().tabs[id]}
            </a>
          ))}
        </nav>
        {tab === 'history' && <WeekStepper anchor={anchor} onChange={setAnchor} />}
      </header>
      <main className="page">
        {tab === 'history' ? <History anchor={anchor} /> : tab === 'limits' ? <Limits /> : <Settings />}
      </main>
    </>
  );
}

void initLang().then(() => createRoot(document.getElementById('root')!).render(<Options />));
