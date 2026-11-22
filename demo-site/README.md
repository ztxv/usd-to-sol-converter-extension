# SOLify demo site

A static, dependency-free page that shows how SOLify works. Live at **[solify-two.vercel.app](https://solify-two.vercel.app/)**. It runs the extension's real
`detector.js`, `formatting.js` and `converter.js` (copied into `engine/`) against a simulated
browser window, next to a working copy of the popup.

## Deploy to Vercel

**Drag and drop:** go to [vercel.com/drop](https://vercel.com/drop) and drop this whole `demo-site` folder.
There's no build step, and `index.html` is at the top level.

**From Git:** import the repository in Vercel, set **Root Directory** to `demo-site`, and keep
Framework Preset set to **Other** with no build command. Every push then redeploys it.

## Run it locally

```sh
python3 -m http.server 8080 --directory demo-site
```

## Keep it in sync

`engine/` holds copies of the extension source. After you change the extension, copy them again:

```sh
cp content/detector.js utils/formatting.js content/converter.js demo-site/engine/
```

`node --test tests/unit.cjs` fails if the copies are stale.

## Notes

- The SOL price comes from Coinbase in the visitor's browser, with Kraken as a fallback. If both
  are unreachable, the demo uses a clearly labeled $150 sample rate. The real extension
  never does that: it leaves the page in USD.
- The "Bank" tab uses `bank.example` to stand in for the extension's built-in list of protected financial sites.
