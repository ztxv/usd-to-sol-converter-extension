(() => {
  const $ = id => document.getElementById(id);
  let settings;
  let tab;
  let host = '';
  let paused = false;
  let pageAvailable = false;
  let currentRate;
  let saveQueue = Promise.resolve();
  function notice(id, text) { $(id).textContent = text || ''; $(id).hidden = !text; }
  function paintSettings() {
    $('enabled').checked = settings.enabled;
    $('display').value = settings.displayStyle;
    $('precision').value = settings.precisionMode;
    $('hover').checked = settings.showOriginalOnHover;
    $('conversion-note').textContent = settings.enabled ? 'SOLify the web.' : 'The world is back in dollars.';
    const protectedSite = SolifySettings.isProtected(host);
    $('site').textContent = host || 'No website open';
    $('site-enabled').checked = Boolean(host) && !protectedSite && !settings.disabledDomains.includes(host);
    $('site-enabled').disabled = !host || protectedSite;
    $('site-note').textContent = protectedSite ? 'Protected financial site · USD stays USD' : 'Allow conversion on this site';
    $('restore').disabled = !pageAvailable || protectedSite || !settings.enabled || settings.disabledDomains.includes(host);
    $('restore').querySelector('span').textContent = paused ? 'Resume SOL on this page' : 'Restore USD on this page';
    const preview = $('preview');
    preview.replaceChildren();
    if (settings.displayStyle === 'logo') {
      const img = document.createElement('img');
      img.src = '../assets/solana.svg'; img.alt = ''; img.width = 14; img.height = 11;
      preview.append(img, ' ');
    }
    // A fixed illustration, independent of the live market quote.
    preview.append(SolifyFormatting.convert(100, 99.82, settings.precisionMode) + (settings.displayStyle === 'ticker' ? ' $SOL' : ' SOL'));
    preview.title = 'Illustration: $100 at $99.82 per SOL';
  }
  function paintRate(result) {
    currentRate = result?.rate;
    $('price').textContent = currentRate ? currentRate.usd.toLocaleString('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2}) : '—';
    const age = currentRate ? Math.max(0, Math.floor((Date.now() - currentRate.updatedAt) / 60_000)) : 0;
    $('updated').textContent = currentRate ? `${age < 1 ? 'Updated just now' : `Updated ${age}m ago`} · ${currentRate.provider}` : 'USD stays unchanged';
    notice('rate-error', result?.error ? result.error + (currentRate ? ' Using a recent cached quote.' : '') : '');
  }
  async function requestRate(force = false) {
    $('refresh').disabled = true;
    try { paintRate(await chrome.runtime.sendMessage({type: force ? 'REFRESH_RATE' : 'GET_RATE'})); }
    catch { paintRate({error: 'Could not reach the price service. Reopen SOLify to retry.'}); }
    finally { $('refresh').disabled = false; }
  }
  function save(patch) {
    // Merge each change against storage to avoid dropping preferences saved by another popup.
    saveQueue = saveQueue.then(async () => {
      const stored = await chrome.storage.local.get('settings');
      settings = SolifySettings.normalize({...SolifySettings.normalize(stored.settings), ...patch});
      await chrome.storage.local.set({settings});
      paintSettings();
    }).catch(() => notice('status', 'Could not save this change. Reopen SOLify and try again.'));
  }
  async function init() {
    const [stored, tabs] = await Promise.all([
      chrome.storage.local.get('settings'), chrome.tabs.query({active: true, currentWindow: true})
    ]);
    settings = SolifySettings.normalize(stored.settings);
    tab = tabs[0];
    try {
      const url = new URL(tab?.url);
      if (['http:', 'https:'].includes(url.protocol)) host = url.hostname;
    } catch { /* Internal Chrome tabs have no supported website. */ }
    if (host) {
      try {
        const state = await chrome.tabs.sendMessage(tab.id, {type: 'PAGE_STATUS'});
        paused = Boolean(state?.paused); pageAvailable = Boolean(state);
        if (state?.rate) {
          const pagePrice = state.rate.usd.toLocaleString('en-US', {style: 'currency', currency: 'USD'});
          notice('status', `Page quote: ${pagePrice} / SOL. Refresh to update.`);
        }
      } catch { notice('status', 'Reload this page to activate SOLify. Some browser pages cannot be changed.'); }
    } else notice('status', 'Open a normal website to use page controls.');
    paintSettings();
    $('github-link')?.addEventListener('click', e => {
      e.preventDefault();
      if (chrome?.tabs?.create) chrome.tabs.create({url: e.currentTarget.href});
      else window.open(e.currentTarget.href, '_blank', 'noopener,noreferrer');
    });
    $('enabled').addEventListener('change', () => save({enabled: $('enabled').checked}));
    $('display').addEventListener('change', () => save({displayStyle: $('display').value}));
    $('precision').addEventListener('change', () => save({precisionMode: $('precision').value}));
    $('hover').addEventListener('change', () => save({showOriginalOnHover: $('hover').checked}));
    $('site-enabled').addEventListener('change', () => {
      const domains = new Set(settings.disabledDomains);
      if ($('site-enabled').checked) domains.delete(host); else domains.add(host);
      save({disabledDomains: [...domains]});
    });
    $('refresh').addEventListener('click', async () => {
      await requestRate(true);
      if (currentRate) notice('status', 'Pages keep a consistent quote. A successful refresh updates all active pages.');
    });
    $('restore').addEventListener('click', async () => {
      $('restore').disabled = true;
      try {
        const result = await chrome.tabs.sendMessage(tab.id, {type: paused ? 'RESUME_PAGE' : 'RESTORE_PAGE'});
        if (!result?.ok) throw new Error();
        paused = result.paused;
        notice('status', paused ? 'Original USD restored. This page stays paused until resumed or reloaded.' : 'SOL conversion resumed on this page.');
      } catch { notice('status', 'Could not reach this page. Reload it and try again.'); }
      paintSettings();
    });
    await requestRate();
  }
  init().catch(() => notice('status', 'SOLify could not initialize. Close and reopen the popup.'));
})();
