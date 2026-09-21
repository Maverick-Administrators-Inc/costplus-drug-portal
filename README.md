# Cost Plus Drugs Member Portal

Static site — plain HTML/CSS/JS, no build step — for the Cost Plus Drugs
reimbursement program administered by Maverick Administrators. Every page also
works opened directly via `file://`.

- `index.html` — employer lookup landing page
- `alkeme.html` / `acme-corporation.html` / `verita-global.html` — tenant
  portals. Structurally identical: only the `<title>`, the topbar company name,
  and the welcome headline differ. `alkeme.html` is the reference — edit it,
  then mirror those three strings into every other tenant file and confirm with
  a diff.

### Adding an employer

1. Copy an existing tenant file to `<slug>.html` (slug = lowercased name with
   spaces as hyphens, e.g. `verita-global.html`) and swap the three tenant
   strings: `<title>`, the topbar crumb, the welcome headline.
2. In `index.html`, add the employer to the `COMPANIES` map (full name plus any
   short alias), add a suggestion button with `data-slug="<slug>"`, and extend
   the lookup placeholder.
3. Register the file in `TENANTS` in `tests/tenant-parity.mjs` and in the
   default page list in `tests/receipt-check.mjs`, then run `npm test`.
- `data/drug-prices.json` — weekly price catalog, refreshed by
  `.github/workflows/update-drug-prices.yml` (scraper lives in `scraper/`)

## Tests

`npm test` runs two suites:

**Tenant parity** — asserts every portal file is structurally identical to
`alkeme.html`, differing by exactly the three tenant lines above (each must
reduce to its reference counterpart under the tenant swap, with no other
tenant's name appearing in the file).

**Lookup / receipt end-to-end** — 29 assertions per portal file, run in
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
