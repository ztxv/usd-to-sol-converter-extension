(() => {
  const marker = '[data-solified="true"]';
  const unsafe = 'script,style,noscript,template,textarea,input,select,option,code,pre,kbd,samp,' +
    'svg,math,canvas,iframe,object,embed,title,head,button,[role="textbox"],[role="spinbutton"],' +
    '[contenteditable]:not([contenteditable="false"]),[hidden],[inert],[aria-hidden="true"]';
  const records = new Map();
  const own = node => (node.nodeType === 1 ? node : node.parentElement)?.closest(marker);
  // One delegated handler keeps blocked images from leaving broken icons on the page.
  document.addEventListener('error', event => {
    const img = event.target;
    if (img instanceof HTMLImageElement && records.has(img.parentElement)) img.remove();
  }, true);
  function safe(node) {
    const parent = node.parentElement;
    if (!parent || parent.namespaceURI !== 'http://www.w3.org/1999/xhtml' || parent.closest(unsafe) || own(node)) return false;
    if (parent.isContentEditable) return false;
    // Only measure text that actually contains a recognizable amount.
    const style = getComputedStyle(parent);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && parent.getClientRects().length > 0;
  }
  function render(span, record, rate, settings) {
    const amount = SolifyFormatting.convert(record.usd, rate, settings.precisionMode);
    if (amount === null) return false;
    const label = amount + (settings.displayStyle === 'ticker' ? ' $SOL' : ' SOL');
    span.replaceChildren();
    span.style.setProperty('display', 'inline', 'important');
    span.style.setProperty('white-space', 'nowrap', 'important');
    span.style.setProperty('font', 'inherit', 'important');
    span.style.setProperty('color', 'inherit', 'important');
    if (settings.displayStyle === 'logo') {
      const img = document.createElement('img');
      img.src = chrome.runtime.getURL('assets/solana.svg');
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.style.cssText = 'display:inline-block!important;width:1em!important;height:.8em!important;max-width:none!important;margin:0 .28em 0 0!important;vertical-align:baseline!important;border:0!important;box-shadow:none!important;';
      span.append(img);
    }
    span.append(document.createTextNode(label));
    if (settings.showOriginalOnHover) span.title = `Original: ${record.original}${record.original.includes('USD') ? '' : ' USD'}`;
    else span.removeAttribute('title');
    record.rendered = span.textContent;
    return true;
  }
  function process(node, rate, settings) {
    if (!node.isConnected || node.nodeType !== 3) return;
    const matches = SolifyDetector.detect(node.data);
    if (!matches.length || !safe(node)) return;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(node.data.slice(cursor, match.start)));
      const span = document.createElement('span');
      span.dataset.solified = 'true';
      span.dataset.originalUsd = match.original;
      const record = {...match};
      if (!render(span, record, rate, settings)) return;
      records.set(span, record);
      fragment.append(span);
      cursor = match.end;
    }
    fragment.append(document.createTextNode(node.data.slice(cursor)));
    node.replaceWith(fragment);
  }
  function collect(root) {
    if (!root.isConnected || own(root)) return [];
    if (root.nodeType === 3) return [root];
    if (![1, 9, 11].includes(root.nodeType)) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === 1) return node.matches(unsafe + ',' + marker) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    if (root.nodeType === 1 && root.matches(unsafe)) return [];
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  function restore() {
    for (const [span, record] of records) {
      if (span.isConnected) {
        // Do not overwrite a site's newer update with our older USD snapshot.
        if (span.textContent === record.rendered) span.replaceWith(document.createTextNode(record.original));
        else span.replaceWith(...span.childNodes);
      }
    }
    records.clear();
  }
  function rerender(rate, settings) {
    for (const [span, record] of records) {
      if (!span.isConnected) records.delete(span);
      else if (span.textContent === record.rendered) render(span, record, rate, settings);
    }
  }
  function releaseChanged(span) {
    const record = records.get(span);
    if (!record || span.textContent === record.rendered) return null;
    records.delete(span);
    const parent = span.parentElement;
    // Keep only the site's updated content; discard our decorative logo.
    for (const img of span.querySelectorAll('img')) img.remove();
    span.replaceWith(...span.childNodes);
    return parent;
  }
  function restoreUnsafe(root) {
    if (root.nodeType !== 1) return;
    for (const span of root.querySelectorAll(marker)) {
      const record = records.get(span);
      if (record && (span.closest(unsafe) || span.isContentEditable)) {
        records.delete(span);
        if (span.textContent === record.rendered) span.replaceWith(document.createTextNode(record.original));
        else span.replaceWith(...span.childNodes);
      }
    }
  }
  function forgetRemoved(root) {
    if (root.isConnected || root.nodeType !== 1) return;
    records.delete(root);
    for (const span of root.querySelectorAll(marker)) records.delete(span);
  }
  globalThis.SolifyConverter = {process, collect, restore, rerender, own, releaseChanged, forgetRemoved, restoreUnsafe};
})();
