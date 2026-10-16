// Throwaway Chrome profile driven over a CDP pipe (branded Chrome 137+ ignores --load-extension,
// so the extension is loaded with Extensions.loadUnpacked). Shared by smoke.mjs and shots.mjs.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function launch(args = []) {
  const profile = mkdtempSync(join(tmpdir(), 'molly-cdp-'));
  const chrome = spawn(
    CHROME,
    [
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...args,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  const [, , , toChrome, fromChrome] = chrome.stdio;

  let nextId = 1;
  const pending = new Map();
  let buf = '';
  fromChrome.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      const p = pending.get(msg.id);
      if (!p) continue;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message}`)) : p.resolve(msg.result);
    }
  });
  function cdp(method, params = {}, sessionId) {
    const id = nextId++;
    toChrome.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
  }
  async function attach(match) {
    for (let t = 0; t < 50; t++) {
      const { targetInfos } = await cdp('Target.getTargets');
      const target = targetInfos.find(match);
      if (target) return (await cdp('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
      await sleep(200);
    }
    throw new Error('target not found');
  }
  async function evaluate(sessionId, expression) {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async function shot(sessionId, file, params = {}) {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', ...params }, sessionId);
    writeFileSync(file, Buffer.from(data, 'base64'));
  }
  async function close() {
    chrome.kill();
    await sleep(1000);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  }
  return { cdp, attach, evaluate, shot, close };
}
