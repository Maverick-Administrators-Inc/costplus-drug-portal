// Tenant parity: every tenant portal must be structurally identical to the
// alkeme.html reference, differing ONLY in the three tenant-specific lines —
// the <title>, the topbar crumb, and the welcome headline. Each differing line
// must reduce to its alkeme counterpart under the tenant swap, and no tenant
// file may contain another tenant's name (the shared "Alkeme Rx Redirect"
// program brand is not a tenant name).
import { readFile } from 'node:fs/promises';

const REFERENCE = 'alkeme.html';

// slug -> display name. Add a row here when a new employer portal is added,
// and keep index.html's COMPANIES map in sync.
const TENANTS = {
  'alkeme.html': 'Alkeme',
  'acme-corporation.html': 'Acme Corporation',
  'verita-global.html': 'Verita Global',
};

let fail = 0;
const bad = (msg) => { fail++; console.log(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok  ${msg}`);

const refName = TENANTS[REFERENCE];
const refText = await readFile(new URL(`../${REFERENCE}`, import.meta.url), 'utf8');
const ref = refText.split('\n');

const label = (line) =>
  line.includes('<title>') ? 'title' :
  line.includes('class="co"') ? 'topbar crumb' :
  line.includes('class="tname"') ? 'welcome name' : 'UNEXPECTED';

// strip the shared program brand before hunting for stray tenant names
const withoutBrand = (text) => text.split('Alkeme Rx Redirect').join('');

for (const [file, name] of Object.entries(TENANTS)) {
  if (file === REFERENCE) continue;
  console.log(`\n[parity] ${REFERENCE} vs ${file}`);

  const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const lines = text.split('\n');

  if (ref.length !== lines.length) bad(`line counts differ: ${ref.length} vs ${lines.length}`);
  else ok(`same line count (${ref.length})`);

  const diffs = [];
  for (let i = 0; i < Math.min(ref.length, lines.length); i++) if (ref[i] !== lines[i]) diffs.push(i);

  if (diffs.length !== 3) bad(`expected exactly 3 differing lines, found ${diffs.length}${diffs.length ? ' (lines ' + diffs.map(i => i + 1).join(', ') + ')' : ''}`);
  else ok(`exactly 3 differing lines (${diffs.map(i => i + 1).join(', ')})`);

  const seen = new Set();
  for (const i of diffs) {
    const what = label(ref[i] ?? '');
    // the tenant swap: this tenant's name back to the reference tenant's name
    const norm = (lines[i] ?? '').split(name).join(refName);
    if (what === 'UNEXPECTED') bad(`line ${i + 1} differs but is not a tenant line: ${JSON.stringify((ref[i] ?? '').trim().slice(0, 80))}`);
    else if (seen.has(what)) bad(`two differing lines both look like the ${what} line`);
    else if (what === 'title') { seen.add(what); ok(`line ${i + 1}: title — tenant-specific`); }
    else if (norm !== ref[i]) bad(`line ${i + 1} (${what}) differs beyond the tenant swap`);
    else { seen.add(what); ok(`line ${i + 1}: ${what} — differs only by tenant swap`); }
  }
  if (diffs.length === 3) {
    for (const want of ['title', 'topbar crumb', 'welcome name'])
      if (!seen.has(want)) bad(`missing expected tenant line: ${want}`);
  }

  if (!lines[diffs.find((i) => label(ref[i] ?? '') === 'title') ?? -1]?.includes(name))
    bad(`${file} title does not name ${name}`);
  else ok(`title names ${name}`);

  // no file may mention a tenant other than its own
  const body = withoutBrand(text);
  for (const other of Object.values(TENANTS)) {
    if (other === name) continue;
    if (body.includes(other)) bad(`${file} contains a stray "${other}"`);
    else ok(`no stray "${other}" in ${file}`);
  }
}

console.log(`\nparity: ${fail ? fail + ' failure(s)' : 'pass'}`);
process.exit(fail ? 1 : 0);
