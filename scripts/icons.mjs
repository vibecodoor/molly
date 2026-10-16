// Renders scripts/icon.svg to public/icon/{16,32,48,128}.png (WXT picks them up as the manifest icons).
// Each size is rasterized from the vector, not downscaled. Uses the installed Chrome, headless.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const svg = readFileSync(resolve('scripts/icon.svg'), 'utf8');
mkdirSync(resolve('public/icon'), { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const page = join(tmpdir(), `molly-icon-${size}.html`);
  writeFileSync(page, `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  execFileSync(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${resolve(`public/icon/${size}.png`)}`,
    `file:///${page.replace(/\\/g, '/')}`,
  ]);
}
console.log('icons written to public/icon/');
