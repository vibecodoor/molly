// End-to-end smoke test. Run after `npm run build`:  npm run smoke
// Launches a throwaway Chrome profile, loads .output/chrome-mv3 over a CDP pipe
// (branded Chrome 137+ ignores --load-extension), sets a 20 s limit on example.com and checks
// that every example.com tab gets blocked on time, that two windows aren't double-counted,
// that new navigations get the overlay too, that other sites keep working and get counted, and that
// the popup shows all of it, and that the limits editor follows tighten-now / raise-tomorrow
// (screenshots saved to .output/smoke-popup.png and .output/smoke-options.png).
// Since 2026-10-16 a block is a live overlay (content script iframe over the loaded site), not a redirect.
// Since 2026-10-17 only the focused window's tab (while the user is at it) or a tab playing sound counts. OS focus and
// input are outside the test's control, so the counted tabs play a near-silent tone (Web Audio marks them audible).
// Step 1 findings (2026-10-15, Chrome 155): a minimized window's tab stays `active`,
// alarms with `when` < 30 s fire on time when unpacked.
import { resolve } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const EXT = resolve('.output/chrome-mv3');
const {
  cdp,
  attach,
  evaluate,
  shot: save,
  close,
} = launch(['--lang=ru', '--autoplay-policy=no-user-gesture-required']);
const shot = (sessionId, name) => save(sessionId, resolve(`.output/smoke-${name}.png`));

/** Every https page tab: [url, has the Molly overlay, page scroll locked]. */
async function overlays() {
  const { targetInfos } = await cdp('Target.getTargets');
  const out = [];
  for (const t of targetInfos.filter((t) => t.type === 'page' && t.url.startsWith('https://'))) {
    const { sessionId } = await cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const v = await evaluate(
      sessionId,
      `[!!document.querySelector('iframe[src*="blocked.html"]'), document.documentElement.style.overflow === 'hidden']`,
    );
    await cdp('Target.detachFromTarget', { sessionId });
    out.push([t.url, ...v]);
  }
  return out;
}
const covered = (list, host) => list.filter(([u, on]) => on && new URL(u).hostname.endsWith(host));

const results = [];
const report = (name, pass, detail) => results.push({ name, pass, detail });

try {
  const { id } = await cdp('Extensions.loadUnpacked', { path: EXT });
  const sw = await attach((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${id}/`));

  // Limit example.com to 20 s, then show it in two windows (active) plus one background tab.
  const LIMIT = 20_000;
  await evaluate(
    sw,
    `(async () => {
    await chrome.storage.local.set({ lang: 'ru', limitConfig: { limits: { 'example.com': ${LIMIT} }, pending: {} } });
    const w1 = await chrome.windows.create({ url: 'https://example.com/' });
    await chrome.tabs.create({ windowId: w1.id, url: 'https://www.example.com/background', active: false });
    await chrome.windows.create({ url: 'https://www.example.com/' });
    await chrome.windows.create({ url: 'https://iana.org/' });
  })()`,
  );
  // Sound makes a tab count wherever it is: both example.com windows and iana.org, not the background tab.
  await sleep(3000);
  for (const url of ['https://example.com/', 'https://www.example.com/', 'https://www.iana.org/']) {
    const { targetInfos } = await cdp('Target.getTargets');
    const t = targetInfos.find((t) => t.type === 'page' && t.url === url);
    const { sessionId } = await cdp('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    await evaluate(
      sessionId,
      `(() => { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); g.gain.value = 0.001; o.connect(g).connect(c.destination); o.start(); })()`,
    );
  }
  const t0 = Date.now();
  // Detach so the worker can sleep like in real use; observe from an extension page in its own window.
  await cdp('Target.detachFromTarget', { sessionId: sw });
  const { targetId } = await cdp('Target.createTarget', {
    url: `chrome-extension://${id}/options.html`,
    newWindow: true,
  });
  const page = await cdp('Target.attachToTarget', { targetId, flatten: true }).then((r) => r.sessionId);

  let snap;
  let blockedAt = null;
  for (let i = 0; i < 120 && blockedAt === null; i++) {
    await sleep(500);
    snap = await overlays();
    if (covered(snap, 'example.com').length === 3) blockedAt = Date.now() - t0;
  }
  report('all 3 example.com tabs overlaid (2 windows + background tab)', blockedAt !== null, JSON.stringify(snap));
  report(
    'blocked at ~limit, not ~limit/2 (no double count across windows)',
    blockedAt !== null && blockedAt >= LIMIT - 1000 && blockedAt <= LIMIT + 5000,
    `${blockedAt} ms`,
  );
  // The iframe element alone isn't enough: a wrong blocked.html URL (use_dynamic_url) leaves it empty.
  const frames = (await cdp('Target.getTargets')).targetInfos.filter(
    (t) => t.type === 'iframe' && t.url.includes('/blocked.html'),
  );
  report('overlay frames actually load blocked.html', frames.length >= 3, frames.map((t) => t.url).join(' '));
  report(
    'blocked page stays loaded, scroll locked',
    snap.some(([u, on, locked]) => on && locked && u === 'https://example.com/'),
    '',
  );
  report('other site untouched', covered(snap, 'iana.org').length === 0, '');

  const after = await evaluate(
    page,
    `(async () => {
    await chrome.tabs.create({ url: 'https://example.com/new', active: false });
    await new Promise((r) => setTimeout(r, 2000));
    const all = await chrome.storage.local.get(null);
    const day = Object.keys(all).filter((k) => k.startsWith('day:')).sort().at(-1);
    return { used: all[day], rules: (await chrome.declarativeNetRequest.getDynamicRules()).length };
  })()`,
  );
  const fresh = (await overlays()).find(([u]) => u === 'https://example.com/new');
  report(
    'new navigation gets the overlay',
    fresh?.[1] === true,
    `${JSON.stringify(fresh)}, embed rules=${after.rules}`,
  );
  const used = after.used ?? {};
  report(
    'usage recorded once per second, none behind the overlay',
    used['example.com'] >= LIMIT && used['example.com'] < LIMIT + 5000,
    JSON.stringify(used),
  );
  report('unrelated site counted', (used['iana.org'] ?? 0) > 0, '');

  // Popup, opened as a page: shows the blocked limit and today's sites. Screenshot for a visual check.
  await cdp(
    'Emulation.setDeviceMetricsOverride',
    { width: 380, height: 560, deviceScaleFactor: 1, mobile: false },
    page,
  );
  await cdp('Page.navigate', { url: `chrome-extension://${id}/popup.html` }, page);
  await sleep(1500);
  const text = await evaluate(page, 'document.body.innerText');
  report(
    "popup shows the blocked limit and today's sites",
    ['example.com', 'закрыт до полуночи', 'iana.org'].every((s) => text.includes(s)),
    text.replace(/\n/g, ' | '),
  );
  await shot(page, 'popup');

  // Limits editor, driven through its forms.
  await cdp(
    'Emulation.setDeviceMetricsOverride',
    { width: 720, height: 460, deviceScaleFactor: 1, mobile: false },
    page,
  );
  await cdp('Page.navigate', { url: `chrome-extension://${id}/options.html#limits` }, page);
  await sleep(1500);
  const cfg = () => evaluate(page, `chrome.storage.local.get('limitConfig').then((s) => s.limitConfig)`);
  const submit = (formSelector, values) =>
    evaluate(
      page,
      `(async () => {
    const form = document.querySelector(${JSON.stringify(formSelector)});
    for (const [name, value] of Object.entries(${JSON.stringify(values)})) form.elements[name].value = value;
    form.requestSubmit();
    await new Promise((r) => setTimeout(r, 1500));
    return document.querySelector('[role=status]').textContent;
  })()`,
    );

  await submit('form[aria-label="Новый лимит"]', { domain: 'https://m.twitch.tv/somechannel', minutes: '30' });
  report('editor: new limit from a URL applies now, normalized', (await cfg()).limits['twitch.tv'] === 30 * 60_000, '');

  const raised = await submit('form[aria-label="example.com"]', { minutes: '60' });
  const c = await cfg();
  report(
    'editor: raise waits for tomorrow, block stays',
    c.limits['example.com'] === LIMIT && c.pending['example.com']?.limit === 60 * 60_000 && raised.includes('завтра'),
    `${raised} ${JSON.stringify(c.pending)}`,
  );
  await shot(page, 'options');

  const tighten = await evaluate(
    page,
    `(async () => {
    const res = await chrome.runtime.sendMessage({ type: 'setLimit', domain: 'iana.org', limit: 10000 });
    await new Promise((r) => setTimeout(r, 1500));
    return { res };
  })()`,
  );
  const org = covered(await overlays(), 'iana.org').length;
  report(
    "tightening below today's usage blocks at once",
    tighten.res?.ok && org === 1,
    `${JSON.stringify(tighten)} org overlays=${org}`,
  );

  const bad = await evaluate(
    page,
    `Promise.all([
    chrome.runtime.sendMessage({ type: 'setLimit', domain: 'm.youtube.com', limit: 60000 }),
    chrome.runtime.sendMessage({ type: 'setLimit', domain: 'youtube.com', limit: -1 }),
    chrome.runtime.sendMessage({ type: 'setLimit', domain: 'example.de', limit: 60000 }),
  ])`,
  );
  report(
    'background rejects a non-normalized domain, a bad limit and a site an existing limit covers',
    bad.every((r) => r.ok === false),
    JSON.stringify(bad),
  );

  // Restore a backup: SYNTHETIC days earlier this week (screenshots only) plus a raised limit that must wait.
  const restored = await evaluate(
    page,
    `(async () => {
    const key = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const M = 60000;
    const plan = [
      { 'youtube.com': 132 * M, 'github.com': 47 * M, 'twitch.tv': 38 * M, 'vk.com': 14 * M, 'habr.com': 9 * M },
      { 'youtube.com': 71 * M, 'github.com': 96 * M, 'twitch.tv': 12 * M, 'reddit.com': 22 * M },
      { 'youtube.com': 188 * M, 'twitch.tv': 64 * M, 'github.com': 31 * M, 'vk.com': 26 * M, 'kinopoisk.ru': 41 * M },
      { 'youtube.com': 64 * M, 'github.com': 118 * M, 'twitch.tv': 5 * M, 'habr.com': 17 * M },
      { 'youtube.com': 103 * M, 'twitch.tv': 87 * M, 'github.com': 23 * M, 'reddit.com': 11 * M, 'vk.com': 8 * M },
      { 'youtube.com': 215 * M, 'twitch.tv': 49 * M, 'kinopoisk.ru': 96 * M },
    ];
    const days = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      if (key(d) < key(now)) days[key(d)] = plan[i];
    }
    const text = JSON.stringify({ app: 'molly', schemaVersion: 1, exportedAt: now.toISOString(), days, limits: { 'youtube.com': 90 * M, 'example.com': 99 * M } });
    const res = await chrome.runtime.sendMessage({ type: 'importBackup', text });
    const junk = await chrome.runtime.sendMessage({ type: 'importBackup', text: '{"app":"other"}' });
    const { limitConfig } = await chrome.storage.local.get('limitConfig');
    return { res, junk, expected: Object.keys(days).length, limitConfig };
  })()`,
  );
  report(
    'backup import restores days, keeps raised limits pending, rejects junk',
    restored.res?.ok &&
      restored.res.result.days === restored.expected &&
      restored.junk?.ok === false &&
      restored.limitConfig.limits['youtube.com'] === 90 * 60_000 &&
      restored.limitConfig.limits['example.com'] === LIMIT,
    JSON.stringify({ res: restored.res, junk: restored.junk?.error }),
  );

  // Screenshots for the visual review: every surface, light + dark, plus phone width for history.
  async function capture(sessionId, url, name, w, h, dark) {
    await cdp(
      'Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    await cdp(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] },
      sessionId,
    );
    if (url) await cdp('Page.navigate', { url }, sessionId);
    await sleep(2200);
    await shot(sessionId, name);
  }
  const opt = `chrome-extension://${id}/options.html`;
  await capture(page, `${opt}#history`, 'history', 1280, 800, false);
  await capture(page, `${opt}#history`, 'history-dark', 1280, 800, true);
  await capture(page, `${opt}#history`, 'history-mobile', 390, 844, false);
  await capture(page, `${opt}#limits`, 'limits', 1280, 800, false);
  await capture(page, `${opt}#settings`, 'settings', 1280, 800, false);
  await capture(page, `chrome-extension://${id}/popup.html`, 'popup', 380, 560, false);
  await capture(page, null, 'popup-dark', 380, 560, true);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, page);
  const seen = [];
  for (const [i, name, probe] of [
    [1, 'limits', '.presets .preset'],
    [2, 'history', '.stepper'],
    [3, 'settings', '.segmented'],
  ]) {
    await evaluate(page, `document.querySelectorAll('.tabbar button')[${i}].click()`);
    await sleep(900);
    seen.push(await evaluate(page, `!!document.querySelector(${JSON.stringify(probe)})`));
    await shot(page, `popup-${name}`);
  }
  report('popup tabs show limits, history and settings in place', seen.every(Boolean), JSON.stringify(seen));
  const blockedTab = await attach((t) => t.type === 'page' && t.url === 'https://example.com/');
  await cdp('Page.bringToFront', {}, blockedTab); // hidden tabs don't run the tape/Molly entrance animations
  await capture(blockedTab, null, 'blocked', 1280, 800, false);
  await capture(blockedTab, null, 'blocked-dark', 1280, 800, true);
  await capture(blockedTab, null, 'blocked-mobile', 390, 844, false);

  // English: the language switch reaches every page through storage.
  await evaluate(page, `chrome.runtime.sendMessage({ type: 'setLang', lang: 'en' })`);
  await capture(page, `chrome-extension://${id}/popup.html`, 'popup-en', 380, 560, false);
  const en = await evaluate(page, 'document.body.innerText');
  report(
    'language switch: popup in English',
    en.includes('in the browser today') && en.includes('closed until midnight'),
    en.replace(/\n/g, ' | '),
  );
  await capture(page, `${opt}#limits`, 'limits-en', 1280, 800, true);
  await capture(blockedTab, null, 'blocked-en', 1280, 800, true);
  await evaluate(page, `chrome.runtime.sendMessage({ type: 'setLang', lang: 'ru' })`);

  // Theme: a forced dark theme wins over a light system setting.
  await evaluate(page, `chrome.runtime.sendMessage({ type: 'setTheme', theme: 'dark' })`);
  await capture(page, `${opt}#settings`, 'settings-forced-dark', 1280, 800, false);
  const bg = await evaluate(page, 'getComputedStyle(document.body).backgroundColor');
  report('theme switch: forced dark over a light system', bg === 'rgb(20, 23, 22)', bg);
  await evaluate(page, `chrome.runtime.sendMessage({ type: 'setTheme', theme: 'system' })`);
} catch (e) {
  report('runner', false, e.message);
} finally {
  await close();
}

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  — ${r.detail}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
