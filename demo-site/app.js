// SOLify demo site.
// detector.js, formatting.js and converter.js are copies of the extension's own files.
// This script stands in for content.js, popup.js and the service worker.
(() => {
  const $ = id => document.getElementById(id);
  const {detect} = SolifyDetector;
  const {convert} = SolifyFormatting;
  const engine = SolifyConverter;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ mock websites
  const amazonPrice = (whole, fraction) =>
    `<span class="a-price"><span class="a-offscreen">$${whole}.${fraction}</span><span aria-hidden="true"><span class="a-price-symbol">$</span><span class="a-price-whole">${whole}<span class="a-price-decimal">.</span></span><span class="a-price-fraction">${fraction}</span></span></span>`;

  const SITES = {
    shop: {
      host: 'shop.example', path: '/deals',
      adds: ['New arrival: walnut desk lamp, $39.99.', 'Bundle deal: 3 cables for $24.', 'Just restocked: espresso grinder, $189.00.', 'Gift wrap is $4.50 per item.'],
      changes: ['Flash deal: USB-C hub for $19.', 'Flash deal: USB-C hub for $75.', 'Flash deal: USB-C hub for $25.'],
      html: `
        <div class="m-shop">
          <div class="m-topbar"><strong class="m-brand">Nimbus<span>Supply</span></strong><span class="m-ship">Free shipping on orders over $35</span></div>
          <div class="m-banner">Holiday sale: save up to $250 on desks this week.</div>
          <div class="m-grid">
            <article class="m-card">
              <div class="m-img m-img-a" aria-hidden="true"></div>
              <h4>Low-profile mechanical keyboard</h4>
              <div class="m-pricebox">${amazonPrice('129', '99')}</div>
              <small class="m-sub">Split-element price, the way big stores mark it up</small>
              <a class="m-cart-btn" href="#demo">Add to cart</a>
            </article>
            <article class="m-card">
              <div class="m-img m-img-b" aria-hidden="true"></div>
              <h4>Oak standing desk</h4>
              <p class="m-price">Was <s>$549.00</s>, now <b>$299.00</b></p>
              <small class="m-sub">Members save another $20</small>
              <a class="m-cart-btn" href="#demo">Add to cart</a>
            </article>
            <article class="m-card">
              <div class="m-img m-img-c" aria-hidden="true"></div>
              <h4>Noise-cancelling headphones</h4>
              <p class="m-price"><b>$349.99</b></p>
              <small class="m-sub">or 4 payments of $87.50</small>
              <a class="m-cart-btn" href="#demo">Add to cart</a>
            </article>
          </div>
          <p class="m-flash" data-changing>Flash deal: USB-C hub for $25.</p>
          <div class="m-dyn" data-dyn></div>
          <div class="m-checkout">
            <div class="m-row"><span>Subtotal (3 items)</span><b>$778.98</b></div>
            <label class="m-row m-gift">Gift card amount <input value="$50" aria-label="Gift card amount (never converted)"></label>
            <small class="m-sub">The input above is something you type into, so SOLify leaves it alone.</small>
          </div>
        </div>`
    },
    news: {
      host: 'ledger.example', path: '/markets/solify-raise',
      adds: ['Update 2:14 PM: shares jumped to $18.25.', 'Update 3:02 PM: analysts now see a $2 billion market.', 'Correction: the seed round was $3.5 million.'],
      changes: ['Live: SOLify app revenue is $4,800 today.', 'Live: SOLify app revenue is $5,120 today.', 'Live: SOLify app revenue is $5,990 today.'],
      html: `
        <article class="m-news">
          <div class="m-masthead"><span>THE LEDGER</span><small>Markets · Technology</small></div>
          <h3 class="m-headline">Startup raises $100 million to price the whole internet in SOL</h3>
          <p class="m-byline">By a staff reporter · 4 min read</p>
          <p>The round values the company at USD 1,200,000,000. Its flagship plan costs $9.99 a month, or 99 USD a year, and a lifetime license runs US$249.</p>
          <p>Abroad, the same plan costs CA$13.49 in Canada and €9.29 in Europe. SOLify only reads US dollars, so those amounts stay as they are.</p>
          <p class="m-live" data-changing>Live: SOLify app revenue is $4,800 today.</p>
          <div class="m-dyn" data-dyn></div>
          <p>Developers can read the price the usual way:</p>
          <pre class="m-code"><code>const price = "$9.99"; // code is never touched</code></pre>
          <p class="m-small">Rounding error of the year: $0.000001. SOLify shows it as less than the smallest amount it can display, rather than zero.</p>
        </article>`
    },
    bank: {
      host: 'bank.example', path: '/accounts', protected: true,
      adds: ['Pending deposit: $64.20.', 'Pending transfer: $1,500.00.'],
      changes: ['Available credit: $2,400.00', 'Available credit: $2,150.00', 'Available credit: $2,610.00'],
      html: `
        <div class="m-bank">
          <div class="m-bank-top"><strong>Example Bank</strong><span>Accounts</span></div>
          <div class="m-acct"><span>Checking ····4821</span><b>$4,210.55</b></div>
          <div class="m-acct"><span>Savings ····0907</span><b>$12,000.00</b></div>
          <p class="m-acct-sub" data-changing>Available credit: $2,400.00</p>
          <div class="m-dyn" data-dyn></div>
          <div class="m-protect">
            <img src="assets/solana.svg" alt="" width="18" height="14">
            <p><b>Protected site.</b> SOLify has a built-in list of banks, brokers, exchanges, payment apps and tax portals where it never changes anything, so you don't misread a real balance. The list can't be overridden. In this demo, <code>bank.example</code> stands in for it.</p>
          </div>
        </div>`
    }
  };

  // ------------------------------------------------------------------ state
  const FALLBACK_USD = 150;
  const state = {
    enabled: true, displayStyle: 'logo', precisionMode: 'normal', showOriginalOnHover: true,
    disabled: new Set(), site: 'shop', paused: false, rate: null,
    addIndex: 0, changeIndex: 0
  };
  const settings = () => ({
    enabled: state.enabled, displayStyle: state.displayStyle,
    precisionMode: state.precisionMode, showOriginalOnHover: state.showOriginalOnHover
  });
  const site = () => SITES[state.site];
  const siteAllowed = () => !site().protected && !state.disabled.has(site().host);
  const allowed = () => state.enabled && !state.paused && siteAllowed() && Boolean(state.rate);
  const suffix = () => state.displayStyle === 'ticker' ? ' $SOL' : ' SOL';
  const money = usd => usd.toLocaleString('en-US', {style: 'currency', currency: 'USD'});
  function notice(id, text) { $(id).textContent = text || ''; $(id).hidden = !text; }

  // ------------------------------------------------------------------ page driver (a simplified content.js)
  const viewport = $('viewport');
  const observer = new MutationObserver(ingest);
  const roots = new Set();
  const changed = new Set();
  const removed = new Set();
  let running = false;
  let flushTimer = null;

  function observe() {
    if (running) observer.observe(viewport, {subtree: true, childList: true, characterData: true});
  }
  function ingest(mutations) {
    for (const mutation of mutations) {
      const owner = engine.own(mutation.target);
      if (owner) changed.add(owner);
      else if (mutation.type === 'characterData') roots.add(mutation.target);
      else for (const node of mutation.addedNodes) roots.add(node);
      for (const node of mutation.removedNodes) removed.add(node);
    }
    if (running && !flushTimer) flushTimer = setTimeout(flush, 32);
  }
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (!running) return;
    const pending = observer.takeRecords();
    observer.disconnect();
    if (pending.length) ingest(pending);
    try {
      for (const span of changed) {
        const parent = engine.releaseChanged(span);
        if (parent) roots.add(parent);
      }
      changed.clear();
      for (const node of removed) engine.forgetRemoved(node);
      removed.clear();
      const candidates = [...roots].filter(node => node.isConnected);
      roots.clear();
      for (const root of candidates) {
        for (const node of engine.collect(root)) engine.process(node, state.rate.usd, settings());
      }
    } finally {
      observe();
    }
    paintPin();
  }
  function start() {
    running = true;
    roots.add(viewport);
    flush();
  }
  function stop() {
    running = false;
    observer.disconnect();
    clearTimeout(flushTimer);
    flushTimer = null;
    roots.clear(); changed.clear(); removed.clear();
    engine.restore();
    paintPin();
  }
  // Re-evaluate the page after any setting or rate change.
  function apply() {
    if (!allowed()) { if (running) stop(); }
    else if (running) {
      ingest(observer.takeRecords());
      observer.disconnect();
      engine.rerender(state.rate.usd, settings());
      observe();
    } else start();
    paintPopup();
    renderHero();
    renderPlayground();
  }

  function loadSite(key) {
    stop();
    state.site = key;
    state.paused = false; // Switching tabs works like a reload.
    state.addIndex = 0; state.changeIndex = 0;
    viewport.innerHTML = SITES[key].html;
    viewport.scrollTop = 0;
    for (const tab of document.querySelectorAll('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.site === key));
    $('address-host').textContent = SITES[key].host;
    $('address-path').textContent = SITES[key].path;
    notice('status', '');
    apply();
  }

  function paintPin() {
    $('ext-pin').classList.toggle('on', running);
    $('ext-pin').title = running ? 'SOLify is converting this page' : 'SOLify is not converting this page';
  }

  // ------------------------------------------------------------------ popup
  function paintPopup() {
    const s = site();
    $('enabled').checked = state.enabled;
    $('display').value = state.displayStyle;
    $('precision').value = state.precisionMode;
    $('hover').checked = state.showOriginalOnHover;
    $('conversion-note').textContent = state.enabled ? 'SOLify the web.' : 'The world is back in dollars.';
    $('site').textContent = s.host;
    $('site-enabled').checked = siteAllowed();
    $('site-enabled').disabled = Boolean(s.protected);
    $('site-note').textContent = s.protected ? 'Protected financial site · USD stays USD' : 'Allow conversion on this site';
    $('restore').disabled = s.protected || !state.enabled || !siteAllowed() || !state.rate;
    $('restore').querySelector('span').textContent = state.paused ? 'Resume SOL on this page' : 'Restore USD on this page';
    const preview = $('preview');
    preview.replaceChildren();
    if (state.displayStyle === 'logo') preview.append(logo(14), ' ');
    // Same fixed illustration as the real popup, independent of the market quote.
    preview.append(convert(100, 99.82, state.precisionMode) + suffix());
    preview.title = 'Illustration: $100 at $99.82 per SOL';
  }
  function logo(size) {
    const img = document.createElement('img');
    img.src = 'assets/solana.svg'; img.alt = ''; img.width = size; img.height = Math.round(size * 0.8);
    img.className = 'sol-logo';
    return img;
  }

  $('enabled').addEventListener('change', e => { state.enabled = e.target.checked; apply(); });
  $('display').addEventListener('change', e => { state.displayStyle = e.target.value; apply(); });
  $('precision').addEventListener('change', e => { state.precisionMode = e.target.value; apply(); });
  $('hover').addEventListener('change', e => { state.showOriginalOnHover = e.target.checked; apply(); });
  $('site-enabled').addEventListener('change', e => {
    if (e.target.checked) state.disabled.delete(site().host); else state.disabled.add(site().host);
    apply();
  });
  $('restore').addEventListener('click', () => {
    state.paused = !state.paused;
    notice('status', state.paused
      ? 'Original USD restored. This page stays paused until you resume it or reload.'
      : 'SOL conversion resumed on this page.');
    apply();
  });
  for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => loadSite(tab.dataset.site));

  // Website JavaScript: inserts and edits prices so the MutationObserver path is visible.
  $('add-price').addEventListener('click', () => {
    const list = site().adds;
    const p = document.createElement('p');
    p.className = 'm-added';
    p.textContent = list[state.addIndex++ % list.length];
    viewport.querySelector('[data-dyn]').append(p);
  });
  $('change-price').addEventListener('click', () => {
    const list = site().changes;
    viewport.querySelector('[data-changing]').textContent = list[state.changeIndex++ % list.length];
  });

  // ------------------------------------------------------------------ market price (a simplified service worker)
  async function getJSON(url) {
    const response = await fetch(url, {cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Price provider unavailable');
    return response.json();
  }
  async function fetchRate() {
    try {
      const json = await getJSON('https://api.coinbase.com/v2/prices/SOL-USD/spot');
      const usd = Number(json.data?.amount);
      if (json.data?.base !== 'SOL' || !Number.isFinite(usd) || usd <= 0) throw new Error('Invalid price');
      return {usd, provider: 'Coinbase', live: true, updatedAt: Date.now()};
    } catch {
      try {
        const json = await getJSON('https://api.kraken.com/0/public/Ticker?pair=SOLUSD');
        const usd = Number(Object.values(json.result || {})[0]?.c?.[0]);
        if (json.error?.length || !Number.isFinite(usd) || usd <= 0) throw new Error('Invalid price');
        return {usd, provider: 'Kraken', live: true, updatedAt: Date.now()};
      } catch {
        return {usd: FALLBACK_USD, provider: 'Sample rate', live: false, updatedAt: Date.now()};
      }
    }
  }
  let nextRefresh = 0;
  async function loadRate(manual = false) {
    if (manual && Date.now() < nextRefresh) {
      notice('status', 'Please wait a moment before refreshing again.');
      return;
    }
    nextRefresh = Date.now() + 30_000;
    $('refresh').disabled = true;
    const fresh = await fetchRate();
    $('refresh').disabled = false;
    // Keep a real quote rather than swapping it for the sample on a failed refresh.
    if (!fresh.live && state.rate?.live) notice('status', 'Market price unavailable. Keeping the last quote.');
    else {
      state.rate = fresh;
      if (manual) notice('status', 'A successful refresh updates every active page.');
    }
    paintRate();
    apply();
  }
  function paintRate() {
    const rate = state.rate;
    $('price').textContent = rate ? money(rate.usd) : '—';
    $('live-label').textContent = rate?.live ? '● MARKET PRICE' : '● SAMPLE RATE';
    $('live-label').classList.toggle('sample', !rate?.live);
    $('updated').textContent = rate ? `Updated just now · ${rate.provider}` : 'Fetching market price…';
    notice('rate-error', rate && !rate.live
      ? `The live price couldn't be loaded, so this demo is using a sample rate of ${money(FALLBACK_USD)}. The real extension never makes up a rate. It just leaves the page in USD.`
      : '');
    $('rate-chip-text').textContent = rate
      ? `1 SOL = ${money(rate.usd)} · ${rate.live ? rate.provider + ' live' : 'sample rate'}`
      : 'Fetching SOL price…';
    $('rate-chip').classList.toggle('sample', Boolean(rate && !rate.live));
  }
  setInterval(() => {
    if (!state.rate) return;
    const age = Math.floor((Date.now() - state.rate.updatedAt) / 60_000);
    $('updated').textContent = `${age < 1 ? 'Updated just now' : `Updated ${age}m ago`} · ${state.rate.provider}`;
  }, 30_000);
  $('refresh').addEventListener('click', () => loadRate(true));

  // ------------------------------------------------------------------ text rendering shared by hero + playground
  function solLabel(usd) {
    const amount = state.rate ? convert(usd, state.rate.usd, state.precisionMode) : null;
    return amount === null ? null : amount + suffix();
  }
  function renderText(target, text, asSol) {
    target.replaceChildren();
    let cursor = 0;
    const matches = detect(text);
    for (const match of matches) {
      target.append(text.slice(cursor, match.start));
      const label = asSol ? solLabel(match.usd) : null;
      const mark = document.createElement('mark');
      if (label) {
        mark.className = 'amt sol';
        if (state.displayStyle === 'logo') mark.append(logo(16));
        mark.append(label);
        mark.title = `Original: ${match.original}${match.original.includes('USD') ? '' : ' USD'}`;
      } else {
        mark.className = 'amt usd';
        mark.textContent = match.original;
      }
      target.append(mark);
      cursor = match.end;
    }
    target.append(text.slice(cursor));
    return matches;
  }

  // ------------------------------------------------------------------ hero
  const heroLines = [
    'The company raised $100 million.',
    'Was $199.99, now $149.99.',
    'Your oat latte is $6.75.',
    'This laptop normally costs $1,299.99 but is now $999.',
    'Rent is due: $2,450.'
  ];
  let heroIndex = 0;
  let heroSol = false;
  function renderHero() {
    const line = $('hero-line');
    renderText(line, heroLines[heroIndex], heroSol && state.enabled);
    $('hero-state').textContent = heroSol && state.enabled && state.rate ? 'SOL' : 'USD';
    $('hero-state').classList.toggle('sol', heroSol && state.enabled && Boolean(state.rate));
  }
  function tickHero() {
    const line = $('hero-line');
    const swap = () => {
      if (heroSol) heroIndex = (heroIndex + 1) % heroLines.length;
      heroSol = !heroSol;
      renderHero();
      line.classList.remove('out');
    };
    if (reducedMotion) swap();
    else { line.classList.add('out'); setTimeout(swap, 260); }
  }
  setInterval(tickHero, 2400);

  // ------------------------------------------------------------------ playground
  const playInput = $('play-input');
  function renderPlayground() {
    const matches = renderText($('play-output'), playInput.value, true);
    const body = $('play-table');
    body.replaceChildren();
    if (!matches.length) {
      const row = body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 3; cell.className = 'empty';
      cell.textContent = 'No USD amounts found.';
      return;
    }
    for (const match of matches) {
      const row = body.insertRow();
      row.insertCell().textContent = match.original;
      row.insertCell().textContent = match.usd.toLocaleString('en-US', {maximumFractionDigits: 6});
      row.insertCell().textContent = solLabel(match.usd) ?? '—';
    }
  }
  playInput.addEventListener('input', renderPlayground);
  for (const chip of document.querySelectorAll('[data-sample]')) {
    chip.addEventListener('click', () => { playInput.value = chip.dataset.sample; renderPlayground(); });
  }

  // ------------------------------------------------------------------ boot
  loadSite('shop');
  loadRate();
})();
