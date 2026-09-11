(() => {
  const defaults = {
    enabled: true, displayStyle: 'logo', precisionMode: 'normal',
    showOriginalOnHover: true, disabledDomains: []
  };
  const protectedDomains = [
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'capitalone.com',
    'usbank.com', 'hsbc.com', 'barclays.co.uk', 'schwab.com', 'fidelity.com',
    'vanguard.com', 'robinhood.com', 'interactivebrokers.com', 'etrade.com',
    'coinbase.com', 'kraken.com', 'binance.com', 'binance.us', 'crypto.com',
    'gemini.com', 'paypal.com', 'venmo.com', 'stripe.com', 'squareup.com',
    'cash.app', 'wise.com', 'revolut.com', 'irs.gov', 'intuit.com', 'hrblock.com'
  ];
  function normalize(raw = {}) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
      displayStyle: ['logo', 'clean', 'ticker'].includes(raw.displayStyle) ? raw.displayStyle : 'logo',
      precisionMode: ['meme', 'normal', 'autistic'].includes(raw.precisionMode) ? raw.precisionMode : 'normal',
      showOriginalOnHover: typeof raw.showOriginalOnHover === 'boolean' ? raw.showOriginalOnHover : true,
      disabledDomains: Array.isArray(raw.disabledDomains) ? raw.disabledDomains.filter(x => typeof x === 'string') : []
    };
  }
  const isProtected = host => protectedDomains.some(domain => host === domain || host.endsWith('.' + domain));
  globalThis.SolifySettings = {defaults, normalize, isProtected};
})();
