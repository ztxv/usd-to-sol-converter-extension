(() => {
  // Separate the numeric grammar from currency markers. Never match a partial malformed number.
  const number = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
  const prefix = String.raw`(?:USD\s+\$?\s*|US\s*\$\s*|\$\s*)`;
  const pattern = new RegExp(`${prefix}(${number})(?:\\s+USD\\b)?|(${number})\\s+USD\\b`, 'g');
  function detect(text) {
    if (!text.includes('$') && !text.includes('USD')) return [];
    const matches = [];
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      const before = text[start - 1] || '';
      if (/\b(?:CAD|AUD|NZD|HKD|SGD)\s*$/.test(text.slice(0, start))) continue;
      const after = text[end] || '';
      // Avoid CAD/AUD prefixes, identifiers, negatives, partial decimals and bad grouping.
      if (/[\w$.,+−-]/.test(before) || /[\w$]/.test(after)) continue;
      if ((after === '.' || after === ',') && /\d/.test(text[end + 1] || '')) continue;
      const usd = Number((match[1] || match[2]).replaceAll(',', ''));
      if (!Number.isFinite(usd) || usd < 0 || usd > Number.MAX_SAFE_INTEGER) continue;
      matches.push({start, end, usd, original: match[0]});
    }
    return matches;
  }
  globalThis.SolifyDetector = {detect};
})();
