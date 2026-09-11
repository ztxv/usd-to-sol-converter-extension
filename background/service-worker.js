const TTL = 5 * 60_000;
const MAX_AGE = 15 * 60_000;
const COOLDOWN = 60_000;
let pending;
const usable = (rate, age) => rate && Number.isFinite(rate.usd) && rate.usd > 0 &&
  Number.isFinite(rate.updatedAt) && Date.now() >= rate.updatedAt && Date.now() - rate.updatedAt < age;

async function getJSON(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw new Error('Price provider unavailable');
  return response.json();
}
async function fetchRate() {
  try {
    const json = await getJSON('https://api.coinbase.com/v2/prices/SOL-USD/spot');
    const usd = Number(json.data?.amount);
    if (json.data?.base !== 'SOL' || json.data?.currency !== 'USD' || !Number.isFinite(usd) || usd <= 0) throw new Error('Invalid price');
    return {usd, updatedAt: Date.now(), provider: 'Coinbase'};
  } catch {
    const json = await getJSON('https://api.kraken.com/0/public/Ticker?pair=SOLUSD');
    const usd = Number(Object.values(json.result || {})[0]?.c?.[0]);
    if (json.error?.length || !Number.isFinite(usd) || usd <= 0) throw new Error('Price unavailable');
    return {usd, updatedAt: Date.now(), provider: 'Kraken'};
  }
}
async function resolveRate(force) {
  const {rate, nextAttempt = 0, rateError = null} = await chrome.storage.local.get(['rate', 'nextAttempt', 'rateError']);
  if (!force && usable(rate, TTL)) return {rate, error: rateError};
  if (Date.now() < nextAttempt) return {rate: usable(rate, MAX_AGE) ? rate : null, error: rateError || 'Please wait a moment before refreshing again.'};
  // Persist cooldown so worker restarts and many tabs cannot hammer the API.
  await chrome.storage.local.set({nextAttempt: Date.now() + COOLDOWN});
  try {
    const fresh = await fetchRate();
    await chrome.storage.local.set({rate: fresh, rateError: null});
    return {rate: fresh, error: null};
  } catch {
    const error = 'Market price unavailable. Try again in a minute.';
    await chrome.storage.local.set({rateError: error});
    return {rate: usable(rate, MAX_AGE) ? rate : null, error};
  }
}
function getRate(force = false) {
  if (!pending) pending = resolveRate(force).finally(() => { pending = null; });
  return pending;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !['GET_RATE', 'REFRESH_RATE'].includes(message?.type)) return;
  (async () => {
    const result = await getRate(message.type === 'REFRESH_RATE');
    if (message.type === 'REFRESH_RATE' && result.rate && !result.error) {
      await chrome.storage.local.set({manualRate: result.rate});
    }
    return result;
  })().then(reply, () => reply({rate: null, error: 'Could not access the price cache.'}));
  return true;
});
