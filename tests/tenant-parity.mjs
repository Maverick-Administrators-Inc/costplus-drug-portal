// Tenant parity: alkeme.html and acme-corporation.html must be structurally
// identical, differing ONLY in the four tenant-specific lines — the <title>,
// the --accent* CSS variables, the topbar crumb, and the welcome headline.
// Each differing line must reduce to its alkeme counterpart under the tenant
// swap, and neither file may contain stray traces of the other tenant.
import { readFile } from 'node:fs/promises';

const A_PATH = new URL('../alkeme.html', import.meta.url);
const B_PATH = new URL('../acme-corporation.html', import.meta.url);

// acme -> alkeme normalization; applying these to an acme line must reproduce
// the alkeme line exactly.
const SWAPS = [
  ['Acme Corporation', 'Alkeme'],
  ['#6E5BD1', '#487DA9'],
  ['#4A3B99', '#2E5A83'],
  ['rgba(110,91,209', 'rgba(72,125,169'],
];

let fail = 0;
const bad = (msg) => { fail++; console.log(`  FAIL ${msg}`); };
const ok = (msg) => console.log(`  ok  ${msg}`);

const a = (await readFile(A_PATH, 'utf8')).split('\n');
const b = (await readFile(B_PATH, 'utf8')).split('\n');

console.log('\n[parity] alkeme.html vs acme-corporation.html');
if (a.length !== b.length) bad(`line counts differ: ${a.length} vs ${b.length}`);
else ok(`same line count (${a.length})`);

const diffs = [];
for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diffs.push(i);

if (diffs.length !== 4) bad(`expected exactly 4 differing lines, found ${diffs.length}${diffs.length ? ' (lines ' + diffs.map(i => i + 1).join(', ') + ')' : ''}`);
else ok(`exactly 4 differing lines (${diffs.map(i => i + 1).join(', ')})`);

const label = (line) =>
  line.includes('<title>') ? 'title' :
  line.includes('--accent:') ? 'accent vars' :
  line.includes('class="co"') ? 'topbar crumb' :
  line.includes('class="tname"') ? 'welcome name' : 'UNEXPECTED';

const seen = new Set();
for (const i of diffs) {
  const what = label(a[i] ?? '');
  let norm = b[i] ?? '';
  for (const [from, to] of SWAPS) norm = norm.split(from).join(to);
  if (what === 'UNEXPECTED') bad(`line ${i + 1} differs but is not a tenant line: ${JSON.stringify((a[i] ?? '').trim().slice(0, 80))}`);
  else if (seen.has(what)) bad(`two differing lines both look like the ${what} line`);
  else if (norm !== a[i]) bad(`line ${i + 1} (${what}) differs beyond the tenant swap`);
  else { seen.add(what); ok(`line ${i + 1}: ${what} — differs only by tenant swap`); }
}
if (diffs.length === 4) {
  for (const want of ['title', 'accent vars', 'topbar crumb', 'welcome name'])
    if (!seen.has(want)) bad(`missing expected tenant line: ${want}`);
}

const aText = a.join('\n'), bText = b.join('\n');
if (bText.includes('Alkeme')) bad('acme-corporation.html contains a stray "Alkeme"'); else ok('no stray "Alkeme" in acme-corporation.html');
if (aText.includes('Acme')) bad('alkeme.html contains a stray "Acme"'); else ok('no stray "Acme" in alkeme.html');
if (bText.includes('487DA9') || bText.includes('2E5A83')) bad('acme-corporation.html contains an alkeme accent hex'); else ok('no alkeme accent hex in acme-corporation.html');
if (aText.includes('6E5BD1') || aText.includes('4A3B99')) bad('alkeme.html contains an acme accent hex'); else ok('no acme accent hex in alkeme.html');

console.log(`\nparity: ${fail ? fail + ' failure(s)' : 'pass'}`);
process.exit(fail ? 1 : 0);
