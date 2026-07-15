# Cost Plus Drugs Member Portal

Static site — plain HTML/CSS/JS, no build step — for the Cost Plus Drugs
reimbursement program administered by Maverick Administrators. Every page also
works opened directly via `file://`.

- `index.html` — employer lookup landing page
- `alkeme.html` / `acme-corporation.html` — tenant portals. Structurally
  identical: only the `<title>`, the `--accent*` CSS variables, the topbar
  company name, and the welcome headline differ. Edit `alkeme.html`, then
  mirror those four strings into `acme-corporation.html` and confirm with a diff.
- `data/drug-prices.json` — weekly price catalog, refreshed by
  `.github/workflows/update-drug-prices.yml` (scraper lives in `scraper/`)

## Tests

`npm test` runs two suites:

**Tenant parity** — asserts the two portal files are structurally identical,
differing by exactly the four tenant lines above (each must reduce to its
counterpart under the tenant swap, with no stray tenant strings elsewhere).

**Lookup / receipt end-to-end** — 24 assertions per portal file, run in
headless Chromium against both a local HTTP server and `file://`:

- searching a real drug prints the receipt with a real price line from the catalog
- strength chips switch selection and update the prefilled amount
- the try-it calculator recalculates the reward live (10% of savings)
- the $50 reward cap note appears/hides at the right threshold
- unknown drugs fall back to the formula-only no-match copy
- over `file://` (data fetch blocked) the receipt still prints, with no page errors

One-time setup:

```sh
npm install
npx playwright install chromium   # only if Chromium isn't already in Playwright's cache
```

Run:

```sh
npm test                    # both portal files
npm test -- alkeme.html     # a single file
```
