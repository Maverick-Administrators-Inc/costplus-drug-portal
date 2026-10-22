// Tenant parity: every tenant portal must be structurally identical to the
// alkeme.html reference, differing ONLY in the four tenant-specific lines —
// the <title>, the employer-legal-name meta, the topbar crumb, and the welcome
// headline. Each differing line must reduce to its alkeme counterpart under
// the tenant swap, and no tenant file may contain another tenant's name (the
// shared "Alkeme Rx Redirect" program brand is not a tenant name).
// Every portal must also carry the Submit chapter's employer copy chips (filled
// only from the meta) and the Cost Plus logo callout.
import { readFile } from 'node:fs/promises';

const REFERENCE = 'alkeme.html';

// slug -> display name (title, crumb, headline) and the legal name the copy
// chips put on the clipboard. Add a row here when a new employer portal is
// added, and keep index.html's COMPANIES map in sync.
const TENANTS = {
  'alkeme.html': { name: 'Alkeme Intermediary Holdings, LLC', legal: 'Alkeme Intermediary Holdings, LLC' },
  'acme-corporation.html': { name: 'Acme Corporation', legal: 'Acme Corporation' },
  'verita-global.html': { name: 'Verita Global', legal: 'Verita Global' },
  'kamco-supply-corp-of-boston.html': { name: 'Kamco Supply Corp of Boston', legal: 'Kamco Supply Corp. of Boston' },
  'sample-company.html': { name: 'Sample Company', legal: 'Sample Company' },
};

let fail = 0;
const bad = (msg) => { fail++; console.log(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok  ${msg}`);

const { name: refName, legal: refLegal } = TENANTS[REFERENCE];
const refText = await readFile(new URL(`../${REFERENCE}`, import.meta.url), 'utf8');
const ref = refText.split('\n');

const LEGAL_META = '<meta name="employer-legal-name"';
const label = (line) =>
  line.includes('<title>') ? 'title' :
  line.startsWith(LEGAL_META) ? 'legal name' :
  line.includes('class="co"') ? 'topbar crumb' :
  line.includes('class="tname"') ? 'welcome name' : 'UNEXPECTED';
const TENANT_LINES = ['title', 'legal name', 'topbar crumb', 'welcome name'];

// strip the shared program brand before hunting for stray tenant names
const withoutBrand = (text) => text.split('Alkeme Rx Redirect').join('');
const count = (text, needle) => text.split(needle).length - 1;

for (const [file, { name, legal }] of Object.entries(TENANTS)) {
  if (file === REFERENCE) continue;
  console.log(`\n[parity] ${REFERENCE} vs ${file}`);

  const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const lines = text.split('\n');

  if (ref.length !== lines.length) bad(`line counts differ: ${ref.length} vs ${lines.length}`);
  else ok(`same line count (${ref.length})`);

  const diffs = [];
  for (let i = 0; i < Math.min(ref.length, lines.length); i++) if (ref[i] !== lines[i]) diffs.push(i);

  if (diffs.length !== TENANT_LINES.length) bad(`expected exactly ${TENANT_LINES.length} differing lines, found ${diffs.length}${diffs.length ? ' (lines ' + diffs.map(i => i + 1).join(', ') + ')' : ''}`);
  else ok(`exactly ${TENANT_LINES.length} differing lines (${diffs.map(i => i + 1).join(', ')})`);

  const seen = new Set();
  for (const i of diffs) {
    const what = label(ref[i] ?? '');
    // the tenant swap: this tenant's name back to the reference tenant's name
    const norm = what === 'legal name'
      ? (lines[i] ?? '').split(legal).join(refLegal)
      : (lines[i] ?? '').split(name).join(refName);
    if (what === 'UNEXPECTED') bad(`line ${i + 1} differs but is not a tenant line: ${JSON.stringify((ref[i] ?? '').trim().slice(0, 80))}`);
    else if (seen.has(what)) bad(`two differing lines both look like the ${what} line`);
    else if (what === 'title') { seen.add(what); ok(`line ${i + 1}: title — tenant-specific`); }
    else if (norm !== ref[i]) bad(`line ${i + 1} (${what}) differs beyond the tenant swap`);
    else { seen.add(what); ok(`line ${i + 1}: ${what} — differs only by tenant swap`); }
  }
  if (diffs.length === TENANT_LINES.length) {
    for (const want of TENANT_LINES)
      if (!seen.has(want)) bad(`missing expected tenant line: ${want}`);
  }

  if (!lines[diffs.find((i) => label(ref[i] ?? '') === 'title') ?? -1]?.includes(name))
    bad(`${file} title does not name ${name}`);
  else ok(`title names ${name}`);

  // no file may mention a tenant other than its own
  const body = withoutBrand(text);
  const others = new Set(Object.values(TENANTS).filter((t) => t.name !== name).flatMap((t) => [t.name, t.legal]));
  for (const other of others) {
    if (other === name || other === legal) continue;
    if (body.includes(other)) bad(`${file} contains a stray "${other}"`);
    else ok(`no stray "${other}" in ${file}`);
  }
}

// Submit chapter: every portal (the reference included) carries the copy
// chips and the logo callout, and the chips' name has exactly one source.
for (const [file, { legal }] of Object.entries(TENANTS)) {
  console.log(`\n[submit] ${file}`);
  const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');

  const metas = text.split('\n').filter((l) => l.startsWith(LEGAL_META));
  if (metas.length !== 1) bad(`expected one employer-legal-name meta, found ${metas.length}`);
  else if (metas[0] !== `${LEGAL_META} content="${legal}" />`) bad(`employer-legal-name meta should read "${legal}": ${metas[0]}`);
  else ok(`employer-legal-name meta reads "${legal}"`);

  const chips = count(text, '<button type="button" class="copy-chip">');
  const empty = count(text, '<span class="cc-name"></span>');
  if (chips !== 2) bad(`expected 2 employer copy chips (step 3 + checklist), found ${chips}`);
  else ok('2 employer copy chips (step 3 + checklist)');
  if (empty !== chips) bad(`copy chips must be filled from the meta, not hardcoded (${empty} of ${chips} empty)`);
  else ok('copy chips are filled from the meta only');
  if (!text.includes('<p class="flow-hint" data-employer-ref hidden>Please type your employer name exactly as shown so we can match your claim quickly.</p>')) bad('step 3 helper line missing');
  else ok('step 3 helper line present');
  if (count(text, 'id="copyLive"') !== 1) bad('copy announcement live region missing');
  else ok('copy announcement live region present');

  if (count(text, '<div class="callout callout--logo">') !== 1 || !text.includes('<strong>Make sure the Cost Plus Drugs logo is visible in your receipt.</strong>'))
    bad('Cost Plus logo callout missing from step 4');
  else ok('Cost Plus logo callout in step 4');
  if (!text.includes('Receipt file (PDF or photo, with the <strong>Cost Plus Drugs logo visible</strong>)')) bad('checklist receipt item missing the logo note');
  else ok('checklist receipt item asks for the logo');
}

console.log(`\nparity: ${fail ? fail + ' failure(s)' : 'pass'}`);
process.exit(fail ? 1 : 0);
