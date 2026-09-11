(() => {
  function format(value, mode = 'normal') {
    if (!Number.isFinite(value) || value < 0) return null;
    if (mode === 'autistic') return String(value);
    const digits = mode === 'meme' ? 2 : value >= 100 ? 2 : value >= 1 ? 3
      : value >= 0.1 ? 4 : value >= 0.01 ? 5 : 6;
    const floor = 10 ** -digits;
    if (value > 0 && value < floor / 2) return '<' + floor.toFixed(digits);
    return value.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  }
  function convert(usd, rate, mode) {
    return Number.isFinite(rate) && rate > 0 ? format(usd / rate, mode) : null;
  }
  globalThis.SolifyFormatting = {format, convert};
})();
