(() => {
  const engine = SolifyConverter;
  let settings = SolifySettings.normalize();
  let rate = null;
  let paused = false;
  let running = false;
  let retryTimer;
  let flushTimer;
  let queue = [];
  const roots = new Set();
  const changed = new Set();
  const removed = new Set();
  const host = location.hostname;
  const allowed = () => settings.enabled && !paused && !SolifySettings.isProtected(host) && !settings.disabledDomains.includes(host);
  const observer = new MutationObserver(ingest);
  function observe() {
    if (running) observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'contenteditable', 'inert']
    });
  }
  function ingest(mutations) {
    for (const mutation of mutations) {
      const owner = engine.own(mutation.target);
      if (owner) changed.add(owner);
      else if (mutation.type === 'characterData' || mutation.type === 'attributes') roots.add(mutation.target);
      else for (const node of mutation.addedNodes) roots.add(node);
      for (const node of mutation.removedNodes || []) removed.add(node);
    }
    schedule();
  }
  function schedule() {
    if (running && !flushTimer) flushTimer = setTimeout(flush, 32);
  }
  function flush() {
    flushTimer = null;
    if (!running) return;
    // Drain external changes before suppressing notifications from our own edits.
    const pending = observer.takeRecords();
    if (pending.length) ingest(pending);
    observer.disconnect();
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
      const candidateSet = new Set(candidates);
      for (const root of candidates) {
        engine.restoreUnsafe(root);
        let ancestor = root.parentNode;
        while (ancestor && !candidateSet.has(ancestor)) ancestor = ancestor.parentNode;
        if (!ancestor) queue = queue.concat(engine.collect(root));
      }
      const batch = queue.splice(0, 250);
      for (const node of batch) engine.process(node, rate.usd, settings);
    } finally {
      observe();
    }
    if (queue.length || roots.size) schedule();
  }
  function stop() {
    running = false;
    observer.disconnect();
    clearTimeout(flushTimer);
    clearTimeout(retryTimer);
    flushTimer = null;
    queue = [];
    roots.clear(); changed.clear(); removed.clear();
    engine.restore();
  }
  function start() {
    if (!allowed() || !rate) return;
    running = true;
    observe();
    roots.add(document.body);
    schedule();
  }
  async function ensureRate() {
    clearTimeout(retryTimer);
    if (!allowed()) return;
    if (!rate) {
      try {
        const result = await chrome.runtime.sendMessage({type: 'GET_RATE'});
        if (result?.rate && Number.isFinite(result.rate.usd) && result.rate.usd > 0) rate = result.rate;
      } catch { /* Extension reload or worker unavailable: keep USD. */ }
    }
    if (!allowed()) return;
    if (rate) { if (!running) start(); }
    else retryTimer = setTimeout(ensureRate, 60_000);
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'PAGE_STATUS') reply({paused, protected: SolifySettings.isProtected(host), rate});
    if (message?.type === 'RESTORE_PAGE') {
      paused = true; stop(); reply({ok: true, paused});
    }
    if (message?.type === 'RESUME_PAGE') {
      paused = false; ensureRate(); reply({ok: true, paused});
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      settings = SolifySettings.normalize(changes.settings.newValue);
      if (!allowed()) stop();
      else if (running) {
        ingest(observer.takeRecords());
        observer.disconnect();
        engine.rerender(rate.usd, settings);
        observe();
      } else ensureRate();
    }
    if (changes.manualRate?.newValue) {
      const fresh = changes.manualRate.newValue;
      if (!Number.isFinite(fresh.usd) || fresh.usd <= 0) return;
      rate = fresh;
      if (running) {
        ingest(observer.takeRecords()); observer.disconnect();
        engine.rerender(rate.usd, settings); observe();
      } else ensureRate();
    }
  });
  chrome.storage.local.get('settings').then(result => {
    settings = SolifySettings.normalize(result.settings);
    ensureRate();
  }).catch(() => {});
})();
