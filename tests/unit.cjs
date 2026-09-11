const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../content/detector.js');
require('../utils/formatting.js');
require('../utils/settings.js');
const {detect} = globalThis.SolifyDetector;
const {convert, format} = globalThis.SolifyFormatting;
test('common notations and grouping', () => {
  const cases = {'$5':5, '$5.00':5, '$9.99':9.99, '$100':100, '$1,000':1000, '$1,299.99':1299.99, 'US$49':49, 'US $49':49, 'USD 49':49, 'USD $49':49, '49 USD':49, '49.99 USD':49.99, '$49 USD':49};
  for (const [text, amount] of Object.entries(cases)) {
    assert.deepEqual(detect(text).map(m => m.usd), [amount], text);
    assert.equal(detect(text)[0].original, text);
  }
});
test('surrounding prose and multiple matches remain exact', () => {
  const text = 'The company raised $100 million. Was $199.99, now $149.99.';
  const matches = detect(text);
  assert.deepEqual(matches.map(x => x.usd), [100, 199.99, 149.99]);
  for (const m of matches) assert.equal(text.slice(m.start, m.end), m.original);
});
test('reject partial and unrelated currency matches', () => {
  for (const text of ['CA$100', 'AU$49', 'CAD $100', '$1,23', '$1,234,56', '$1.2.3', 'USD 1,00', '1,00 USD', 'abc49 USD', '$10abc', '-$100', '€100', '1.002 $SOL']) {
    assert.equal(detect(text).length, 0, text);
  }
});
test('precision, invalid rates, tiny positive values', () => {
  assert.equal(convert(100,99.82,'normal'), '1.002');
  assert.equal(convert(100,99.82,'meme'), '1.00');
  assert.equal(convert(100,99.82,'autistic'), String(100/99.82));
  assert.equal(convert(.5,100,'normal'), '0.005000');
  assert.equal(convert(.000001,100,'normal'), '<0.000001');
  assert.equal(convert(.5,100,'meme'), '0.01');
  for (const rate of [0, -1, NaN, Infinity]) assert.equal(convert(100,rate), null);
  assert.equal(format(0), '0.000000');
});
test('protected subdomains and validated preferences', () => {
  assert.equal(SolifySettings.isProtected('secure.chase.com'), true);
  assert.equal(SolifySettings.isProtected('notchase.com'), false);
  assert.equal(SolifySettings.isProtected('chase.com.evil.test'), false);
  assert.equal(SolifySettings.normalize({precisionMode:'wrong'}).precisionMode, 'normal');
});
