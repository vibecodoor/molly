import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { ImportBackupMessage, SetLangMessage, SetThemeMessage } from '../../src/adapter/reconcile';
import { dayKey } from '../../src/core/day';
import { makeBackup, toCsv } from '../../src/core/history';
import { type Lang, type Theme, getLang, t } from '../../src/core/i18n';
import { useHistoryData } from './History';

const THEMES: Theme[] = ['system', 'light', 'dark'];
const LANGS: [Lang, string][] = [
  ['ru', 'Русский'],
  ['en', 'English'],
];

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Settings() {
  const s = t().settings;
  const [incognito, setIncognito] = useState<boolean | null>(null);
  useEffect(() => void browser.extension.isAllowedIncognitoAccess().then(setIncognito), []);

  return (
    <div className="settings">
      <h1 className="lead">{s.lead}</h1>

      <section className="setting" aria-labelledby="lang-title">
        <h2 id="lang-title">{s.language}</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="lang-title">
          {LANGS.map(([lang, label]) => (
            <button
              type="button"
              role="radio"
              key={lang}
              lang={lang}
              aria-checked={getLang() === lang}
              onClick={() => void browser.runtime.sendMessage({ type: 'setLang', lang } satisfies SetLangMessage)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="setting" aria-labelledby="theme-title">
        <h2 id="theme-title">{s.theme}</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="theme-title">
          {THEMES.map((theme) => (
            <button
              type="button"
              role="radio"
              key={theme}
              aria-checked={(document.documentElement.dataset.theme ?? 'system') === theme}
              onClick={() => void browser.runtime.sendMessage({ type: 'setTheme', theme } satisfies SetThemeMessage)}
            >
              {s.themes[theme]}
            </button>
          ))}
        </div>
      </section>

      {incognito !== null && (
        <section className="setting" aria-labelledby="incognito-title">
          <h2 id="incognito-title">{s.incognito}</h2>
          <p className="muted">{incognito ? s.incognitoOn : s.incognitoOff}</p>
          {!incognito && (
            <button
              type="button"
              className="btn"
              onClick={() => void browser.tabs.create({ url: `chrome://extensions/?id=${browser.runtime.id}` })}
            >
              {s.openExtension}
            </button>
          )}
        </section>
      )}

      <DataActions />
    </div>
  );
}

function DataActions() {
  const s = t().settings;
  const data = useHistoryData();
  const file = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>({ text: '' });
  const stamp = dayKey(Date.now());

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const res = (await browser.runtime.sendMessage({ type: 'importBackup', text: await f.text() } satisfies ImportBackupMessage)) as {
      ok: boolean;
      error?: string;
      result?: { days: number };
    };
    setStatus(
      res?.ok
        ? { text: s.restored(res.result?.days ?? 0) }
        : { text: s.failed(res?.error ?? t().noAnswer), error: true },
    );
  }

  return (
    <section className="setting" aria-labelledby="data-title">
      <h2 id="data-title">{s.data}</h2>
      <p className="muted">{s.dataSub}</p>
      <div className="data-actions">
        <button
          type="button"
          className="btn"
          disabled={!data}
          onClick={() => data && download(`molly-${stamp}.csv`, 'text/csv', `﻿${toCsv(data.days)}`)}
        >
          {s.csv}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!data}
          onClick={() =>
            data &&
            download(`molly-backup-${stamp}.json`, 'application/json', JSON.stringify(makeBackup(data.days, data.cfg.limits, Date.now())))
          }
        >
          {s.backup}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => file.current?.click()}>
          {s.restore}
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={onFile} aria-label={s.file} />
      </div>
      <p className={`status ${status.error ? 'over' : 'muted'}`} role="status" aria-live="polite">
        {status.text}
      </p>
    </section>
  );
}
