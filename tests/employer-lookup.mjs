// Employer lookup on index.html. The landing page must not reveal which
// employers take part, and a portal opens only for an employer's full name or
// an approved alias:
//   1. the field opts out of autofill, autocorrect and suggestion lists
//   2. no employer name appears in the page's text, placeholder, attributes
//      or meta tags — before or after a miss (the program brand aside; see
//      exposedNames)
//   3. typing reveals nothing: a partial name, a full name and gibberish leave
//      the card identical (markup, computed styles, accessibility tree)
//   4. every name and alias opens its portal whatever the case, spacing,
//      punctuation, accents or trailing corporate suffix — by Enter or button
//   5. prefixes, near-misses and object-prototype keys open nothing
//   6. every miss renders identical markup: one neutral message, announced as
//      an alert and described on the field; editing clears it
//   7. an empty submission opens nothing and shows no message
//   8. leaving the page clears the field and its undo history, and a
//      back/forward-cache restore puts the stub back — checked with a real
//      restore, not only simulated events
//   9. a match still tears the stub and runs the wipe before navigating
//
// Names are read from the page's own COMPANIES registry, so a new employer is
// covered without editing this file. The suite checks what the page shows and
// how it behaves, not the script source.
//
// Usage: node tests/employer-lookup.mjs
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';

const { server, port } = await serve();
const BASE = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ok  ${msg}`); } else { fail++; console.log(`  FAIL ${msg}`); } };

// A portal navigation is answered 204 No Content, which leaves the browser on
// index.html, so one page can run every case; `navs` records where each went.
async function open(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  await ctx.route((url) => url.hostname !== '127.0.0.1', (r) => r.abort()); // web fonts aren't needed here
  const page = await ctx.newPage();
  const navs = [], errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route((url) => url.pathname.endsWith('.html') && url.pathname !== '/index.html', (r) => {
    navs.push(new URL(r.request().url()).pathname.slice(1));
    r.fulfill({ status: 204 });
  });
  await page.goto(`${BASE}/index.html`);
  return { ctx, page, navs, errors };
}

// reduced motion: a match navigates at once instead of after the 560 ms wipe
const { page, navs, errors } = await open({ reducedMotion: 'reduce' });
const registry = await page.evaluate(() => COMPANIES); // slug -> [full name, ...aliases]
const names = Object.values(registry).flat();
const [firstSlug, [firstName]] = Object.entries(registry)[0];

// The matching rule, written out here independently of the page so the page's
// own normalize() can't vouch for itself: case, accents, punctuation and
// spacing are ignored, trailing corporate suffixes typed as separate words are
// dropped, and what's left must equal a registered name or alias exactly.
const SUFFIXES = new Set(['inc', 'incorporated', 'llc', 'llp', 'lp', 'pllc', 'plc', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'group']);
function key(s) {
  const words = s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.'’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words.at(-1))) words.pop();
  return words.join('');
}
const portalFor = new Map(Object.entries(registry).flatMap(([slug, list]) => list.map((n) => [key(n), `${slug}.html`])));
const expectedPortal = (s) => portalFor.get(key(s)) ?? null;
const message = () => page.evaluate(() => document.getElementById('noMatch').textContent);
const cardMarkup = () => page.evaluate(() => document.querySelector('.card').outerHTML); // an input's value is not markup

async function submit(text, via = 'Enter') {
  const before = navs.length;
  await page.fill('#lookup', text);
  if (via === 'Enter') await page.press('#lookup', 'Enter'); else await page.click('#ctaBtn');
  if (await message()) return null; // a miss answers synchronously
  for (let i = 0; i < 100 && navs.length === before; i++) await page.waitForTimeout(10);
  return navs.length > before ? navs.at(-1) : null;
}

// Everything a visitor can reach without reading the script: title, attributes
// (placeholder, aria-*, meta content…), all body text including hidden and
// templated text. The program brand "Alkeme Rx Redirect" (and its logo file)
// has to appear, so it is set aside — but it shares its first word with one
// employer, so for that one name this check proves nothing.
async function exposedNames() {
  const text = await page.evaluate(() => {
    const body = document.body.cloneNode(true);
    body.querySelectorAll('script').forEach((s) => s.remove());
    const attrs = [...document.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.value));
    const templates = [...document.querySelectorAll('template')].map((t) => t.content.textContent);
    return [document.title, body.textContent, ...attrs, ...templates].join('\n');
  });
  const scrubbed = text.toLowerCase().replaceAll('alkeme rx redirect', '').replaceAll('alkeme-rx-redirect', '');
  return names.filter((n) => scrubbed.includes(n.toLowerCase()));
}

console.log('\n[field] browser suggestions off');
const field = await page.evaluate(() => {
  const i = document.getElementById('lookup');
  return {
    off: ['autocomplete', 'autocorrect', 'autocapitalize'].every((a) => i.getAttribute(a) === 'off') && i.getAttribute('spellcheck') === 'false',
    lists: i.hasAttribute('list') || document.querySelectorAll('datalist').length > 0,
    filed: i.hasAttribute('name') || !!i.closest('form'),
  };
});
ok(field.off, 'autocomplete, autocorrect, autocapitalize and spellcheck are off');
ok(!field.lists, 'no datalist or list= suggestions');
ok(!field.filed, 'no form or field name for the browser to file typed history under');

console.log('\n[exposure] no employer named in the page text, attributes or meta tags (program brand aside)');
const atRest = await exposedNames();
ok(atRest.length === 0, `page at rest names no employer outside the program brand${atRest.length ? ' — found: ' + atRest.join(', ') : ''}`);

console.log('\n[typing] nothing on the page reacts to what is typed');
async function cardState() {
  await page.waitForTimeout(300); // let any transition settle
  const styles = await page.evaluate(() => {
    const card = document.querySelector('.card');
    const props = ['display', 'visibility', 'opacity', 'color', 'background-color', 'background-image', 'border-color', 'box-shadow', 'outline-style', 'transform', 'content'];
    return [card, ...card.querySelectorAll('*')].flatMap((el) => [null, '::before', '::after'].map((pseudo) => {
      const cs = getComputedStyle(el, pseudo);
      return props.map((p) => cs.getPropertyValue(p)).join('|');
    })).join('\n');
  });
  const tree = (await page.locator('.card').ariaSnapshot()).replace(/^.*- textbox.*$/m, ''); // the textbox line carries the typed value
  return [await cardMarkup(), styles, tree].join('\n');
}
const typed = [...new Set([...names.map((n) => n.slice(0, 3)), ...names, 'Qzxv', 'Zylophant Industries'])];
let reference = null;
const reacted = [];
for (const t of typed) {
  await page.fill('#lookup', t);
  const state = await cardState();
  if (reference === null) reference = state;
  else if (state !== reference) reacted.push(t);
}
ok(reacted.length === 0, `partial names, full names and gibberish leave the card identical (${typed.length} strings)${reacted.length ? ' — differs for: ' + reacted.join(', ') : ''}`);
ok(!(await message()) && navs.length === 0, 'typing alone shows no message and opens nothing');

console.log('\n[routing] full names and aliases open their portal');
const SUFFIX_FORMS = [' Inc', ' Inc.', ', Inc.', ' Incorporated', ' LLC', ' L.L.C.', ' LLP', ' L.L.P.', ' LP', ' L.P.', ' PLLC', ' PLC', ' Corp', ' Corp.', ' Corporation', ' Co', ' Co.', ' Company', ' Ltd', ' Ltd.', ' Limited', ' Group'];
const spellings = (n) => [n, n.toUpperCase(), n.toLowerCase(), `  ${n.replaceAll(' ', '   ')}  `, n.replaceAll(' ', '-'), n.replace('e', 'é'), ...SUFFIX_FORMS.map((s) => n + s)];
let tried = 0;
const misrouted = [];
for (const [slug, list] of Object.entries(registry)) {
  for (const n of list) for (const s of spellings(n)) {
    tried++;
    const to = await submit(s);
    if (to !== `${slug}.html`) misrouted.push(`${JSON.stringify(s)} -> ${to}`);
  }
}
ok(misrouted.length === 0, `${tried} spellings of ${names.length} names and aliases each open the right portal${misrouted.length ? ' — wrong: ' + misrouted.join('; ') : ''}`);
ok(await submit(firstName, 'button') === `${firstSlug}.html`, 'the button routes a match the same as Enter');

console.log('\n[routing] partial and near-miss guesses open nothing');
const guesses = new Set(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'Inc', 'LLC', 'Group', 'Co', 'Limited', 'LP', 'PLC', 'Alkeme Rx Redirect', 'Rx Redirect', 'Zylophant Industries', '...', '-']);
for (const n of names) {
  for (let i = 1; i < n.length; i++) guesses.add(n.slice(0, i)); // every prefix
  guesses.add(n.slice(1));                                        // first letter dropped
  guesses.add(n.slice(0, -1) + (n.endsWith('x') ? 'y' : 'x'));   // last letter changed
  guesses.add(n + 's');                                           // a letter added
  guesses.add(`${n} Holdings`);                                   // a word added
}
// a prefix that is itself a name plus a tolerated suffix (name + " Co") is a real match, not a guess
const misses = [...guesses].filter((s) => expectedPortal(s) === null);
const navsBefore = navs.length;
const opened = [];
const markups = new Set();
for (const [i, m] of misses.entries()) {
  if (await submit(m, i % 2 ? 'button' : 'Enter')) opened.push(m);
  markups.add(await cardMarkup());
}
await page.waitForTimeout(300);
ok(misses.length > 50 && opened.length === 0 && navs.length === navsBefore, `${misses.length} prefixes, near-misses and prototype keys open nothing${opened.length ? ' — opened: ' + opened.join(', ') : ''}`);
ok(markups.size === 1, `every miss leaves byte-identical markup (${markups.size} variant${markups.size === 1 ? '' : 's'})`);

console.log('\n[not found] one neutral message');
await submit('Zylophant Industries');
const text = await message();
ok(/couldn.t find/i.test(text) && /HR/.test(text), 'a miss explains the next step (check the name, ask HR)');
const duringMiss = await exposedNames();
ok(duringMiss.length === 0, `with the message showing, the page names no employer outside the program brand${duringMiss.length ? ' — found: ' + duringMiss.join(', ') : ''}`);
const wired = await page.evaluate(() => {
  const i = document.getElementById('lookup');
  return document.getElementById('noMatch').getAttribute('role') === 'alert' && i.getAttribute('aria-invalid') === 'true'
    && (i.getAttribute('aria-describedby') || '').split(/\s+/).includes('noMatch');
});
ok(wired, 'message is an alert, and the field is marked invalid and described by it');
await page.type('#lookup', 'x');
ok(!(await message()) && await page.evaluate(() => !document.getElementById('lookup').hasAttribute('aria-invalid')), 'editing the field clears the message and the invalid state');

console.log('\n[empty] an empty submission');
const navsBeforeEmpty = navs.length;
await page.fill('#lookup', '   ');
await page.press('#lookup', 'Enter');
await page.waitForTimeout(200);
ok(navs.length === navsBeforeEmpty && !(await message()), 'opens nothing and shows no message');

console.log('\n[shared computer] leaving and coming back');
await page.fill('#lookup', firstName);
await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
ok(await page.inputValue('#lookup') === '', 'leaving the page clears what was typed');
const restored = await page.evaluate(() => {
  document.querySelector('.card').classList.add('torn');
  document.getElementById('wipe').classList.add('active');
  dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  return !document.querySelector('.card').classList.contains('torn') && !document.getElementById('wipe').classList.contains('active');
});
ok(restored, 'a back/forward-cache restore stands the stub back up');

console.log('\n[shared computer] a real Back-button restore');
// Playwright turns Chrome's back/forward cache off by default, so Back would
// just reload the page and hide what a real restore keeps — like the field's
// undo history. This browser turns it back on (full Chromium build; request
// interception would disable the cache, so the web-font hosts are pointed at
// a dead port instead).
const bfBrowser = await chromium.launch({
  channel: 'chromium',
  ignoreDefaultArgs: ['--disable-back-forward-cache'],
  args: ['--host-resolver-rules=MAP fonts.googleapis.com 127.0.0.1:9, MAP fonts.gstatic.com 127.0.0.1:9'],
});
const bf = await bfBrowser.newPage();
const bfErrors = [];
bf.on('pageerror', (e) => bfErrors.push(String(e)));
// leave index.html, press Back, then try undo and redo in the field
async function afterBack(leave) {
  await bf.goto(`${BASE}/index.html`);
  await bf.evaluate(() => { window.__before = true; addEventListener('pageshow', (e) => { window.__persisted = e.persisted; }); });
  await leave();
  await bf.goBack({ waitUntil: 'commit' }); // a restore fires no load event
  await bf.waitForFunction(() => window.__persisted !== undefined, null, { timeout: 5000 }).catch(() => {});
  const state = await bf.evaluate(() => ({
    restored: window.__before === true && window.__persisted === true, // same document, not a reload
    value: document.getElementById('lookup').value,
    stubBack: !document.querySelector('.card').classList.contains('torn') && !document.getElementById('wipe').classList.contains('active'),
  })).catch(() => ({ restored: false }));
  await bf.click('#lookup');
  const seen = [];
  for (const keys of ['ControlOrMeta+Z', 'ControlOrMeta+Z', 'ControlOrMeta+Z', 'ControlOrMeta+Shift+Z', 'ControlOrMeta+Shift+Z', 'ControlOrMeta+Shift+Z']) {
    await bf.keyboard.press(keys);
    seen.push(await bf.inputValue('#lookup'));
  }
  return { ...state, recovered: seen.filter(Boolean) };
}
const afterMatch = await afterBack(async () => {
  await bf.click('#lookup');
  await bf.keyboard.type(firstName.slice(0, -1)); // a misspelled attempt first
  await bf.keyboard.press('Enter');
  await bf.keyboard.press('ControlOrMeta+A');
  await bf.keyboard.press('Backspace');
  await bf.keyboard.type(firstName);
  await Promise.all([bf.waitForURL(`**/${firstSlug}.html`), bf.keyboard.press('Enter')]);
});
ok(afterMatch.restored, 'Back from a portal restores the page from the back/forward cache (a real restore, not a reload)');
ok(afterMatch.value === '' && afterMatch.stubBack, 'after the restore the field is empty and the stub is back');
ok(afterMatch.restored && afterMatch.recovered.length === 0, `undo and redo bring back nothing typed before the match${afterMatch.recovered.length ? ' — recovered: ' + afterMatch.recovered.join(' | ') : ''}`);
const afterLeaving = await afterBack(async () => {
  await bf.click('#lookup');
  await bf.keyboard.type(firstName); // typed but never submitted
  await bf.goto(`${BASE}/${firstSlug}.html`);
});
ok(afterLeaving.restored && afterLeaving.value === '' && afterLeaving.recovered.length === 0, `text typed but never submitted can't be brought back either${afterLeaving.recovered.length ? ' — recovered: ' + afterLeaving.recovered.join(' | ') : ''}`);
ok(bfErrors.length === 0, `no page errors around the restore${bfErrors.length ? ': ' + bfErrors.join('; ') : ''}`);
await bfBrowser.close();

console.log('\n[registry]');
const claimed = Object.entries(registry).flatMap(([slug, list]) => list.filter((n) => expectedPortal(n) !== `${slug}.html`));
ok(claimed.length === 0, `no name or alias is claimed by two employers${claimed.length ? ' — ' + claimed.join(', ') : ''}`);
const missingFiles = [];
for (const slug of Object.keys(registry)) if (!(await fetch(`${BASE}/${slug}.html`)).ok) missingFiles.push(`${slug}.html`);
ok(missingFiles.length === 0, `every registered employer has a portal file${missingFiles.length ? ' — missing: ' + missingFiles.join(', ') : ''}`);

console.log('\n[motion] a match tears the stub, then navigates');
const m = await open();
await m.page.fill('#lookup', firstName);
const t0 = Date.now();
await m.page.press('#lookup', 'Enter');
ok(await m.page.evaluate(() => document.querySelector('.card').classList.contains('torn') && document.getElementById('wipe').classList.contains('active')), 'the stub tears and the wipe starts');
while (!m.navs.length && Date.now() - t0 < 3000) await m.page.waitForTimeout(20);
const elapsed = Date.now() - t0;
ok(m.navs[0] === `${firstSlug}.html` && elapsed >= 500, `then the portal opens once the wipe has run (${elapsed} ms)`);

ok(errors.length === 0 && m.errors.length === 0, `no page errors${errors.length + m.errors.length ? ': ' + [...errors, ...m.errors].join('; ') : ''}`);

await browser.close();
server.close();
console.log(`\nemployer lookup: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
