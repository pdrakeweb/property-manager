import { chromium } from 'playwright';

const BASE = 'http://localhost:5174';
const OUT  = 'C:/sessions/charming-wonderful-pascal/mnt/outputs';

const routes = [
  ['dashboard',     '#/'],
  ['maintenance',   '#/maintenance'],
  ['budget',        '#/budget'],
  ['inventory',     '#/inventory'],
  ['property-tax',  '#/property-tax'],
  ['mortgage',      '#/mortgage'],
  ['utilities',     '#/utilities'],
  ['settings',      '#/settings'],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });

  // Seed auth state so the auth gate passes
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('google_access_token',     'SCREENSHOT_FAKE_TOKEN');
    localStorage.setItem('google_token_expires_at', String(Date.now() + 3600_000));
    localStorage.setItem('google_user_email',       'pete@example.com');
    localStorage.setItem('google_user_name',        'Pete Drake');
    localStorage.setItem('active_property_id',      'tannerville');
  });
  // Reload so React re-initializes with the token in localStorage
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  for (const [name, hash] of routes) {
    const url = `${BASE}/${hash}`;
    console.log(`-> ${name}  ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: `${OUT}/design-b-${name}.png`,
      fullPage: true,
    });
    console.log(`   saved design-b-${name}.png`);
  }

  await browser.close();
  console.log('Done.');
})();
