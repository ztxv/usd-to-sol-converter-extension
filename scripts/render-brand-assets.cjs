// Renders the demo site's link-preview card and app icons with the preinstalled Playwright.
// No dependencies are added to this repo. Run from the repository root:
//   node scripts/render-brand-assets.cjs
// Sources:  scripts/og-image.html (1200x630 card), scripts/app-icon.svg (opaque square icon)
// Outputs:  demo-site/og-image.png, demo-site/apple-touch-icon.png, demo-site/icon-192.png, demo-site/icon-512.png
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = name => path.join(root, 'demo-site', name);

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  try {
    const card = await browser.newPage({viewport: {width: 1200, height: 630}, deviceScaleFactor: 1});
    await card.goto(pathToFileURL(path.join(__dirname, 'og-image.html')).href);
    await card.evaluate(() => document.fonts.ready);
    if (!(await card.evaluate(() => document.fonts.check('800 78px Inter')))) throw new Error('Inter did not load from scripts/fonts/');
    await card.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    await card.screenshot({path: out('og-image.png')});

    const iconUrl = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(__dirname, 'app-icon.svg')).toString('base64');
    for (const [size, name] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
      const page = await browser.newPage({viewport: {width: size, height: size}, deviceScaleFactor: 1});
      await page.setContent(`<style>html,body{margin:0;background:#101115}img{display:block;width:${size}px;height:${size}px}</style><img src="${iconUrl}">`);
      await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
      await page.screenshot({path: out(name)});
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log('Rendered og-image.png, apple-touch-icon.png, icon-192.png and icon-512.png into demo-site/');
})().catch(error => { console.error(error); process.exit(1); });
