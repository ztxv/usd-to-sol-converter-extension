// Optional integration checks: npm install --no-save playwright, then node tests/browser.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const extension = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    const name = req.url === '/demo.js' ? 'demo.js' : 'demo.html';
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(fs.readFileSync(path.join(__dirname, name)));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'solify-test-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, executablePath: process.env.CHROMIUM_PATH,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    await worker.evaluate(async () => chrome.storage.local.set({rate: {usd:99.82, updatedAt:Date.now(), provider:'Test fixture'}}));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const wait = fn => page.waitForFunction(fn);
    await wait(() => document.querySelector('#basic [data-solified]'));
    assert.equal(await page.locator('#basic [data-solified]').count(), 6);
    assert.equal(await page.locator('#notations [data-solified]').count(), 7);
    assert.equal(await page.locator('#multiple [data-solified]').count(), 2);
    assert.equal(await page.locator('#million').textContent(), 'The company raised 1.002 SOL million.');
    assert.equal(await page.locator('#safe-input').inputValue(), '$100');
    assert.equal(await page.locator('#safe-code').textContent(), 'const price = "$100";');
    assert.equal(await page.locator('#editable').textContent(), 'Editable text: $100');
    assert.equal(await page.locator('#nested').innerHTML(), '<span>$</span><span>99</span><sup>99</sup>');
    assert.equal(await page.locator('#non-usd [data-solified]').count(), 0);
    assert.match(await page.locator('#basic [data-solified]').first().getAttribute('title'), /Original: \$5 USD/);
    await page.getByRole('button', {name:'Add a price', exact:true}).click();
    await wait(() => document.querySelector('#dynamic [data-solified]'));
    await page.getByRole('button', {name:'Update price', exact:true}).click();
    await wait(() => document.querySelector('#changing')?.textContent.includes('0.7514 SOL'));
    await page.locator('#price-link').click();
    assert.equal(await page.locator('#link-result').textContent(), 'Original link listener still works.');
    await page.evaluate(() => document.getElementById('changing').setAttribute('contenteditable','true'));
    await wait(() => !document.querySelector('#changing [data-solified]'));
    assert.equal(await page.locator('#changing').textContent(), 'Current price: $75.');
    await page.evaluate(() => document.getElementById('changing').removeAttribute('contenteditable'));
    await wait(() => document.querySelector('#changing [data-solified]'));
    const count = await page.locator('[data-solified]').count();
    await page.evaluate(() => { const noise = document.createElement('div'); noise.id = 'noise'; for (let i=0;i<50;i++) noise.append(document.createTextNode(' ordinary text ')); document.body.append(noise); });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('[data-solified]').count(), count, 'idempotence under unrelated mutations');
    assert.equal(await page.locator('[data-solified] [data-solified]').count(), 0);
    await page.evaluate(() => document.getElementById('noise').remove());
    // Framework writes into a rendered text node must be treated as new site content.
    await page.evaluate(() => { document.querySelector('#changing [data-solified]').lastChild.data = '$200'; });
    await wait(() => document.querySelector('#changing')?.textContent.includes('2.004 SOL'));
    await worker.evaluate(async () => chrome.storage.local.set({settings:{displayStyle:'ticker', precisionMode:'meme', showOriginalOnHover:false}}));
    await wait(() => document.querySelector('#million')?.textContent.includes('1.00 $SOL'));
    assert.equal(await page.locator('#million img').count(), 0);
    assert.equal(await page.locator('#million [data-solified]').getAttribute('title'), null);
    await worker.evaluate(async () => chrome.storage.local.set({settings:{precisionMode:'autistic'}}));
    await wait(() => document.querySelector('#million')?.textContent.includes(String(100/99.82)));
    const tabId = await worker.evaluate(async () => {
      for (const tab of await chrome.tabs.query({})) {
        try { if (await chrome.tabs.sendMessage(tab.id, {type:'PAGE_STATUS'})) return tab.id; } catch {}
      }
      throw new Error('No content-script tab found');
    });
    const command = type => worker.evaluate(async ({tabId,type}) => chrome.tabs.sendMessage(tabId,{type}), {tabId,type});
    await command('RESTORE_PAGE');
    await wait(() => !document.querySelector('[data-solified]'));
    assert.equal(await page.locator('#basic').textContent(), '$5 · $5.00 · $9.99 · $100 · $1,000 · $1,299.99');
    assert.equal(await page.locator('#changing').textContent(), 'Current price: $200.');
    await page.getByRole('button', {name:'Add a price', exact:true}).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-solified]').count(), 0, 'restore stays paused');
    await command('RESUME_PAGE');
    await wait(() => document.querySelector('#basic [data-solified]'));
    await worker.evaluate(async () => chrome.storage.local.set({settings:{disabledDomains:['127.0.0.1']}}));
    await wait(() => !document.querySelector('[data-solified]'));
    await worker.evaluate(async () => chrome.storage.local.set({settings:{enabled:false}}));
    assert.equal(await page.locator('[data-solified]').count(), 0);
    await worker.evaluate(async () => chrome.storage.local.set({settings:{enabled:true}}));
    await wait(() => document.querySelector('#basic [data-solified]'));
    await worker.evaluate(async () => chrome.storage.local.set({manualRate:{usd:100,updatedAt:Date.now(),provider:'Test fixture'}}));
    await wait(() => document.querySelector('#million')?.textContent.includes('1.000 SOL'));
    await page.evaluate(() => {
      const list = document.createElement('div'); list.id = 'bulk';
      for(let i=0;i<2000;i++) { const p = document.createElement('p'); p.textContent = '$10'; list.append(p); }
      document.body.append(list);
    });
    await page.waitForFunction(() => document.querySelectorAll('#bulk [data-solified]').length === 2000);
    await page.evaluate(() => document.getElementById('bulk').remove());
    // Render the actual popup in a tab; emulate only the browser's active-tab selection.
    const popup = await context.newPage();
    await popup.addInitScript(({tabId, url}) => { chrome.tabs.query = async () => [{id:tabId,url}]; }, {tabId,url:page.url()});
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);
    await popup.waitForFunction(() => document.getElementById('price').textContent.includes('$'));
    await popup.selectOption('#display','clean');
    await page.waitForFunction(() => !document.querySelector('#basic img'));
    await popup.selectOption('#precision','meme');
    await wait(() => document.querySelector('#million')?.textContent.includes('1.00 SOL'));
    await popup.locator('#restore').click();
    await wait(() => !document.querySelector('[data-solified]'));
    await popup.locator('#restore').click();
    await wait(() => document.querySelector('#basic [data-solified]'));
    await popup.locator('#site-enabled').uncheck();
    await wait(() => !document.querySelector('[data-solified]'));
    await popup.locator('#site-enabled').check();
    await wait(() => document.querySelector('#basic [data-solified]'));
    await popup.locator('#enabled').uncheck();
    await wait(() => !document.querySelector('[data-solified]'));
    await popup.locator('#enabled').check();
    await wait(() => document.querySelector('#basic [data-solified]'));
    await popup.selectOption('#display','logo');
    await popup.selectOption('#precision','normal');
    if (process.env.SOLIFY_SCREENSHOTS) {
      fs.mkdirSync(process.env.SOLIFY_SCREENSHOTS, {recursive:true});
      await popup.setViewportSize({width:352,height:600});
      assert.ok(await popup.locator('main').evaluate(el => el.getBoundingClientRect().height) <= 600, 'compact popup fits without scrolling');
      await popup.locator('main').screenshot({path:path.join(process.env.SOLIFY_SCREENSHOTS,'popup.png')});
      await page.setViewportSize({width:1150,height:1020});
      await page.screenshot({path:path.join(process.env.SOLIFY_SCREENSHOTS,'demo.png'), fullPage:true});
    }
    // Both network providers failing, with no usable cache, leaves a new page alone.
    await worker.evaluate(async () => {
      globalThis.fetch = async () => { throw new Error('Simulated offline'); };
      await chrome.storage.local.remove(['rate','nextAttempt']);
    });
    const offline = await context.newPage();
    await offline.goto(page.url());
    await offline.waitForTimeout(500);
    assert.equal(await offline.locator('[data-solified]').count(), 0);
    assert.ok((await worker.evaluate(() => chrome.storage.local.get('rateError'))).rateError);
    // Built-in financial protection also applies to subdomains.
    const protectedPage = await context.newPage();
    await protectedPage.route('https://secure.chase.com/**', route => route.fulfill({contentType:'text/html',body:'<p>$100</p>'}));
    await protectedPage.goto('https://secure.chase.com/solify-test');
    await protectedPage.waitForTimeout(100);
    assert.equal(await protectedPage.locator('p').textContent(), '$100');
    assert.deepEqual(errors, []);
    console.log('PASS: real MV3 loading, parsing, dynamic DOM, idempotence, site updates, restoration, settings, popup controls, manual rate propagation, 2,000-node batch, offline behavior, financial protection.');
  } finally {
    await context?.close();
    await new Promise(r => server.close(r));
    fs.rmSync(profile, {recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode=1; });
