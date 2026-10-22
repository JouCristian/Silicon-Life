import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '..', 'validation');
const baseUrl = process.env.CHIP_URL || 'http://127.0.0.1:4174';

const browserCandidates = [
  process.env.CHIP_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});

await mkdir(outputDir, { recursive: true });

const views = [
  ['01-assembled-iso', 'iso', 'assembled'],
  ['02-assembled-top', 'top', 'assembled'],
  ['03-assembled-side', 'side', 'assembled'],
  ['04-exploded-iso', 'iso', 'exploded'],
  ['05-exploded-side', 'side', 'exploded'],
];

for (const [name, view, state] of views) {
  const url = `${baseUrl}/?capture=1&view=${view}&state=${state}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__CAPTURE__?.ready === true, null, { timeout: 20000 });
  await page.screenshot({ path: resolve(outputDir, `${name}.png`) });
  console.log(`saved validation/${name}.png`);
}

// Auxiliary audit image: axes, bounds, centers and the live alignment panel.
await page.goto(`${baseUrl}/?debug=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__CHIP_DEBUG__), null, { timeout: 20000 });
await page.addStyleTag({
  content:
    '.masthead,.prototype-tag,.info-panel,.bottom-ui,.scene-vignette,.scene-grain{display:none!important} body{background:#05080b!important}',
});
await page.waitForTimeout(2600);
await page.evaluate(() => window.__CHIP_DEBUG__.setView('iso'));
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(outputDir, '06-debug-audit.png') });
console.log('saved validation/06-debug-audit.png');

await browser.close();
