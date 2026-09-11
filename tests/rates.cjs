const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require('node:path').join(__dirname, '../background/service-worker.js'), 'utf8');
function setup(initial = {}, responses = []) {
  const data = {...initial};
  let listener, calls = 0;
  const context = {
    Date, Number, Object, AbortSignal,
    fetch: async () => {
      calls++;
      const response = responses.shift();
      if (response instanceof Error || !response) throw new Error('Offline');
      return {ok:response.ok !== false, json:async () => response};
    },
    chrome: {
      storage: {local: {get:async () => ({...data}), set:async patch => Object.assign(data,patch)}},
      runtime: {id:'test', onMessage:{addListener:fn => {listener=fn;}}}
    }
  };
  vm.runInNewContext(code,context);
  return {data, calls:() => calls, request:(type='GET_RATE') => new Promise(resolve => listener({type},{id:'test'},resolve))};
}
const coinbase = usd => ({data:{amount:String(usd),base:'SOL',currency:'USD'}});
test('deduplicates concurrent requests, persists and reuses cache', async () => {
  const app = setup({}, [coinbase(99.82)]);
  const results = await Promise.all(Array.from({length:20}, () => app.request()));
  assert.equal(app.calls(),1);
  assert.ok(results.every(r => r.rate.usd===99.82));
  await app.request(); assert.equal(app.calls(),1);
  assert.equal(app.data.rate.provider,'Coinbase');
});
test('stale cache fetches again and manual refresh broadcasts', async () => {
  const app = setup({rate:{usd:90,updatedAt:Date.now()-360_000}}, [coinbase(100)]);
  const result = await app.request('REFRESH_RATE');
  assert.equal(result.rate.usd,100);
  assert.equal(app.data.manualRate.usd,100);
  await app.request('REFRESH_RATE'); assert.equal(app.calls(),1,'manual cooldown');
});
test('one fallback provider after invalid primary data', async () => {
  const app = setup({}, [coinbase('NaN'), {error:[],result:{SOLUSD:{c:['101.25','2']}}}]);
  const result = await app.request();
  assert.equal(result.rate.usd,101.25);
  assert.equal(result.rate.provider,'Kraken');
  assert.equal(app.calls(),2);
});
test('both APIs failing keeps recent cache, expires old cache, retries later', async () => {
  for (const [age, expected] of [[6*60_000,true],[16*60_000,false]]) {
    const app = setup({rate:{usd:100,updatedAt:Date.now()-age}}, []);
    const result = await app.request();
    assert.equal(Boolean(result.rate),expected);
    assert.ok(result.error);
    await app.request(); assert.equal(app.calls(),2,'cooldown prevents fetch storm');
    app.data.nextAttempt = 0;
    await app.request(); assert.equal(app.calls(),4,'later request retries');
  }
});
test('failure without cache never fabricates a price', async () => {
  const app = setup();
  const result = await app.request();
  assert.equal(result.rate,null);
  assert.ok(result.error);
  assert.equal(app.data.rate,undefined);
});
