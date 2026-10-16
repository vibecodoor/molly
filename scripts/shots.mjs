// README screenshots. Run after `npm run build`:  npm run shots
// Fresh Chrome profile, English UI, a synthetic week on real sites (no real history is read), Twitch over its
// limit so the live blurred overlay shows on the real page (needs network). Raw captures are framed
// (window chrome, rounded corners, shadow on transparent padding) and saved as WebP to docs/images/.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const EXT = resolve('.output/chrome-mv3');
const OUT = resolve('docs/images');
mkdirSync(OUT, { recursive: true });
const { cdp, attach, evaluate, shot, close } = launch(['--lang=en']);
const M = 60_000;

// Synthetic week, Monday first. Today always gets the last entry (Twitch at its limit); later days are dropped.
const WEEK = [
  { 'youtube.com': 96 * M, 'discord.com': 44 * M, 'twitch.tv': 34 * M, 'reddit.com': 27 * M, 'x.com': 14 * M, 'telegram.org': 11 * M },
  { 'youtube.com': 58 * M, 'discord.com': 52 * M, 'reddit.com': 19 * M, 'x.com': 22 * M, 'netflix.com': 47 * M },
  { 'youtube.com': 60 * M, 'twitch.tv': 30 * M, 'discord.com': 31 * M, 'reddit.com': 20 * M, 'instagram.com': 18 * M },
  { 'youtube.com': 41 * M, 'discord.com': 38 * M, 'twitch.tv': 12 * M, 'telegram.org': 23 * M, 'x.com': 9 * M },
  { 'youtube.com': 60 * M, 'discord.com': 29 * M, 'twitch.tv': 30 * M, 'reddit.com': 14 * M, 'netflix.com': 38 * M },
  { 'youtube.com': 52 * M, 'twitch.tv': 25 * M, 'netflix.com': 84 * M, 'reddit.com': 20 * M },
  { 'twitch.tv': 30 * M, 'youtube.com': 41 * M, 'discord.com': 16 * M, 'reddit.com': 9 * M, 'telegram.org': 6 * M },
];
const LIMITS = { 'youtube.com': 60 * M, 'twitch.tv': 30 * M, 'reddit.com': 20 * M, 'x.com': 30 * M };

let ext;
const raw = {}; // name -> PNG base64
async function capture(sessionId, name, { url, w, h, dark, wait = 2200 }) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false }, sessionId);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }, sessionId);
  if (url) await cdp('Page.navigate', { url }, sessionId);
  await sleep(wait);
  raw[name] = (await cdp('Page.captureScreenshot', { format: 'png' }, sessionId)).data;
}

const FRAME_CSS = (dark) => `
  * { box-sizing: border-box; margin: 0 }
  body { background: transparent; font: 13px system-ui, sans-serif; }
  .pad { display: inline-block; padding: 36px 48px 64px }
  .win { border-radius: 12px; overflow: hidden; background: ${dark ? '#1b1f1d' : '#fbfbfa'};
    box-shadow: 0 0 0 1px ${dark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)'}, 0 24px 48px -12px rgba(0,0,0,${dark ? 0.55 : 0.28}); }
  .bar { height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 14px;
    background: ${dark ? '#262b29' : '#e9ebe8'}; border-bottom: 1px solid ${dark ? '#2c312f' : '#d9dcd8'} }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: ${dark ? '#4a4f4d' : '#c9ccc8'} }
  .url { margin-left: 14px; flex: 0 1 420px; height: 26px; border-radius: 13px; padding: 0 14px; display: flex; align-items: center;
    background: ${dark ? '#1b1f1d' : '#fbfbfa'}; color: ${dark ? '#aeb4b1' : '#5b625f'} }
  img { display: block }`;

/** Puts a raw capture in a window frame (or a bare card for the popup) and saves it as WebP. */
async function frame(page, name, rawName, { w, h, url, dark, popup }) {
  const bar = popup ? '' : `<div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><div class="url">${url}</div></div>`;
  const html = `<style>${FRAME_CSS(dark)}</style><div class="pad"><div class="win">${bar}
    <img src="data:image/png;base64,${raw[rawName]}" width="${w}" height="${h}"></div></div>`;
  await cdp('Page.setDocumentContent', { frameId: (await cdp('Page.getFrameTree', {}, page)).frameTree.frame.id, html }, page);
  await sleep(400);
  const box = await evaluate(page, `(() => { const r = document.querySelector('.pad').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  await shot(page, resolve(OUT, `${name}.webp`), { format: 'webp', quality: 92, clip: { ...box, scale: 1 } });
}

try {
  const { id } = await cdp('Extensions.loadUnpacked', { path: EXT });
  ext = `chrome-extension://${id}`;
  const sw = await attach((t) => t.type === 'service_worker' && t.url.startsWith(`${ext}/`));
  await evaluate(sw, `(async () => {
    const key = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    const now = new Date();
    const week = ${JSON.stringify(WEEK)};
    const today = (now.getDay() + 6) % 7;
    const data = { lang: 'en', limitConfig: { limits: ${JSON.stringify(LIMITS)}, pending: {} } };
    for (let i = 0; i <= today; i++) {
      const usage = i === today ? week[6] : week[i];
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - today + i);
      // Real-time total ('*') = the sites plus some unlimited browsing, like a real day.
      data['day:' + key(d)] = { ...usage, '*': Object.values(usage).reduce((a, b) => a + b, 0) + 17 * 60000 };
    }
    await chrome.storage.local.set(data);
    await chrome.windows.create({ url: 'https://www.twitch.tv/', state: 'normal', width: 1280, height: 800 });
  })()`);
  await cdp('Target.detachFromTarget', { sessionId: sw });

  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', newWindow: true });
  const page = (await cdp('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  await cdp('Emulation.setScrollbarsHidden', { hidden: true }, page);
  const opt = `${ext}/options.html`;
  for (const dark of [false, true]) {
    const s = dark ? '-dark' : '';
    await capture(page, `popup${s}`, { url: `${ext}/popup.html`, w: 380, h: 560, dark });
    await capture(page, `history${s}`, { url: `${opt}#history`, w: 1280, h: 800, dark });
    await capture(page, `limits${s}`, { url: `${opt}#limits`, w: 1280, h: 800, dark });
  }
  const site = await attach((t) => t.type === 'page' && t.url.includes('twitch.tv'));
  await cdp('Emulation.setScrollbarsHidden', { hidden: true }, site);
  await cdp('Page.bringToFront', {}, site); // hidden tabs don't play the tape / Molly entrance
  await capture(site, 'blocked', { w: 1280, h: 800, dark: false, wait: 9000 });
  await capture(site, 'blocked-dark', { w: 1280, h: 800, dark: true, wait: 2500 });

  await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, page);
  await cdp('Page.navigate', { url: 'about:blank' }, page);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 2, mobile: false }, page);
  for (const dark of [false, true]) {
    const s = dark ? '-dark' : '';
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }, page);
    await frame(page, `popup${s}`, `popup${s}`, { w: 380, h: 560, dark, popup: true });
    await frame(page, `history${s}`, `history${s}`, { w: 1280, h: 800, url: 'Molly · History', dark });
    await frame(page, `limits${s}`, `limits${s}`, { w: 1280, h: 800, url: 'Molly · Limits', dark });
    await frame(page, `blocked${s}`, `blocked${s}`, { w: 1280, h: 800, url: 'twitch.tv', dark });
  }
  console.log(`saved to ${OUT}`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await close();
}
