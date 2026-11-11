/* Tests voor losse functies uit web/body.html die met externe data werken. Draaien: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const body = fs.readFileSync(path.join(__dirname, '..', 'web', 'body.html'), 'utf8');
/* de functies zelf uit de pagina halen, zodat de test altijd de echte code draait */
const grab = name => {
  /* een functie op één regel, of alles tot de sluitaccolade aan het begin van een regel */
  const m = body.match(new RegExp('^function ' + name + '\\(.*\\}\\r?$', 'm')) || body.match(new RegExp('^function ' + name + '\\(.*?^\\}\\r?$', 'ms'));
  assert.ok(m, 'functie ' + name + ' niet gevonden');
  return m[0];
};
const ctx = {NOW: new Date(2026, 10, 5, 12, 0), URL};
vm.createContext(ctx);
vm.runInContext(['mmddToDate', 'promoActive', 'safeHttp', 'shopUrl'].map(grab).join('\n') +
  '\nObject.assign(globalThis, {mmddToDate, promoActive, safeHttp, shopUrl});', ctx);
const {mmddToDate, promoActive, shopUrl} = ctx;

test('datum: geldige waarden', () => {
  const d = mmddToDate('1108');
  assert.deepStrictEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 10, 8, 23]);
  assert.strictEqual(mmddToDate('1108', true).getHours(), 0);
  assert.strictEqual(mmddToDate('0103').getFullYear(), 2027);   /* over de jaarwisseling */
  assert.strictEqual(mmddToDate(1108).getDate(), 8);            /* getal in plaats van tekst */
});

test('datum: kapotte waarde geeft null en geen fout', () => {
  ['xxxx', '1345', '0231', '00', '99', 'NaN', '-1-1', '1'].forEach(v => assert.strictEqual(mmddToDate(v), null, v));
  ['', null, undefined].forEach(v => assert.strictEqual(mmddToDate(v), null));
});

test('een actie met een kapotte datum houdt de app niet tegen', () => {
  const s = {pv: ['xxxx', '1104', ''], pf: ['', 'yy', '1231']};
  assert.strictEqual(promoActive(s, 0), true);    /* einddatum onleesbaar: telt als zonder einddatum */
  assert.strictEqual(promoActive(s, 1), false);   /* verlopen, ondanks de kapotte begindatum */
  assert.strictEqual(promoActive(s, 2), false);   /* begint later */
});

test('winkellink: alleen http en https', () => {
  const st = {b: 'https://www.ah.nl/producten/product/', l: ['wi123/melk', 'https://www.ah.nl/x', 'http://www.ah.nl/y', '', 'javascript:alert(1)']};
  assert.strictEqual(shopUrl(st, 0), 'https://www.ah.nl/producten/product/wi123/melk');
  assert.strictEqual(shopUrl(st, 1), 'https://www.ah.nl/x');
  assert.strictEqual(shopUrl(st, 2), 'http://www.ah.nl/y');
  assert.strictEqual(shopUrl(st, 3), '');
  assert.strictEqual(shopUrl({b: 'javascript:alert(1);//', l: ['abc']}, 0), '');
  assert.strictEqual(shopUrl({b: 'data:text/html,', l: ['abc']}, 0), '');
  assert.strictEqual(shopUrl({b: '', l: ['abc']}, 0), '');
  assert.strictEqual(shopUrl({b: 'geen adres ', l: ['abc']}, 0), '');
});

/* ---------- bewaard lijstje en deellink: alles wat binnenkomt kan kapot zijn ---------- */
const engine = fs.readFileSync(path.join(__dirname, '..', 'web', 'engine.js'), 'utf8');
function app(saved){
  const c = {localStorage: {getItem: () => saved}, atob: s => Buffer.from(s, 'base64').toString('latin1')};
  vm.createContext(c);
  vm.runInContext(engine + "\nconst KEY = 'k';\nconst S = {items:[], off:new Set(), demo:true, nextId:1, oldReg:false, done:new Set(), hist:Object.create(null), tpl:[]};\n" +
    ['load', 'readListHash', 'searchText'].map(grab).join('\n') + '\nObject.assign(globalThis, {S, load, readListHash, searchText});', c);
  return c;
}
const hash = v => 'lijst=' + Buffer.from(JSON.stringify(v), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('kapot bewaard lijstje: geen fout, en wat klopt blijft bewaard', () => {
  for (const raw of ['{', 'null', '5', '"x"', '[]', '{"items":5}']) assert.strictEqual(app(raw).load(), false, raw);
  const c = app(JSON.stringify({items: [null, 5, ['melk', 2], ['', 1], [7, 1], ['constructor', 'x'], ['kaas', 1e9]], off: [1, 'ah', null], done: 'x', hist: {melk: 'x', kaas: 2},
    saved: 'x', persons: 'veel', tpl: [null, {n: 5, i: []}, {n: 'week', i: [null, ['ei', 2]]}, {n: 'x', i: 5}], v: 3}));
  assert.strictEqual(c.load(), true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.S.items.map(i => [i.q, i.qty]))), [['melk', 2], ['constructor', 1], ['kaas', 99]]);
  assert.deepStrictEqual([...c.S.off], ['ah']);
  assert.strictEqual(c.S.done.size, 0);
  assert.strictEqual(c.S.saved, null);
  assert.strictEqual(c.S.persons, 4);
  assert.strictEqual(c.S.hist.kaas, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.S.tpl)), [{n: 'week', i: [['ei', 2]]}]);
});

test('leeg bewaard lijstje is geen eerste keer', () => {
  const c = app(JSON.stringify({items: [], off: ['ah'], demo: false, v: 3}));
  assert.strictEqual(c.load(), true);
  assert.strictEqual(c.S.items.length, 0);
  assert.strictEqual(c.S.off.has('ah'), true);
  assert.ok(/\n\s*if \(fresh\)\{ useDemo\(\)/.test(body), 'voorbeeld alleen bij de eerste keer');
});

test('deellink: lege namen weg, aantal geheel, kapotte link geeft niets', () => {
  const c = app(null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.readListHash('#' + hash([['melk', 2.4], ['', 1], ['  ', 1], ['constructor', 500], ['__proto__', -1]])))), [['melk', 2], ['constructor', 99], ['__proto__', 1]]);
  assert.strictEqual(c.readListHash('#' + 'lijst=%%%'), null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.readListHash('#' + hash([])))), []);
  assert.strictEqual(c.readListHash('#lijst=e30'), null);
  assert.strictEqual(c.readListHash('#lijstje'), null);
});

test('zoeken op alleen een stopwoord of formaat is geen zoekopdracht', () => {
  const c = app(null);
  for (const q of ['de', '500 g', '  ', 'een', '%%%']) assert.strictEqual(c.searchText(q), '', q);
  assert.strictEqual(c.searchText(' kaas 500 g '), 'kaas 500 g');
});

/* ---------- wat er op de bon staat over een schatting ---------- */
test('notitie zegt wat het is en wat er gevraagd is', () => {
  const c = {packsFor: (n, r) => Math.max(1, Math.ceil(n * (r || 1) - 0.05)), money: x => '€ ' + x};
  vm.createContext(c);
  vm.runInContext(engine + '\nconst money = x => String(x);\n' + grab('noteFor') + '\nglobalThis.noteFor = noteFor;', c);
  const a = {kind: 1, amount: 1000, inferred: false};
  const stuks = c.noteFor({mode: 'unknown', u: 3, q: 5, r: 1}, a, 1);
  assert.ok(stuks.includes('dit is 5 st') && stuks.includes('je vroeg 1 kg'), stuks);
  const g = c.noteFor({mode: 'unknown', u: 1, q: 125, r: 1}, {kind: 2, amount: 1000, inferred: true}, 1);
  assert.ok(g.includes('dit is 125 g') && !g.includes('Formaat onbekend'), g);
  assert.ok(c.noteFor({mode: 'unknown', u: 0, q: 0, r: 1}, a, 2).includes('formaat onbekend, je vroeg 2 × 1 kg'));
});

test('bon, totaal, winkelkeuze en per supermarkt laten de schatting zien; groen volgt de bon', () => {
  assert.ok(body.includes("(estimated(cell) ? '~' : '')"), 'bonregel');
  assert.ok(body.includes('dus dit totaal is een benadering'), 'totaal');
  assert.ok(body.includes("(nEst(p) ? ' · ' + estText(nEst(p)) : '')"), 'winkelkeuze');
  assert.ok(body.includes("(estIn(t.store) ? ', ' + estText(estIn(t.store)) : '')"), 'per supermarkt');
  assert.ok(body.includes('row.filter(priced).map(x => x.price)'), 'groen');
});

/* ---------- boodschappenlijst: volgorde per winkel en afgevinkt naar onderen ---------- */
function trip(items, L){
  const c = {S: {items, done: new Set()}, STORES: [{c: 'Jumbo'}, {c: 'Lidl'}],
    afdOf: (it, st, i) => i};   /* afdeling volgt hier het productnummer */
  vm.createContext(c);
  vm.runInContext(['unpriced', 'bonRows', 'storeMark', 'tripGroups'].map(grab).join('\n') + '\nObject.assign(globalThis, {bonRows, storeMark, tripGroups});', c);
  c.L = L; return c;
}
const cell = i => ({price: 100, c: {i}});
test('boodschappenlijst: per winkel op afdeling, producten zonder prijs apart, leeg lijstje geeft niets', () => {
  const items = [{q: 'melk'}, {q: 'brood'}, {q: 'appels'}, {q: 'saffraan'}];
  /* winkel 1 (Lidl) en 0 (Jumbo); saffraan heeft geen prijs */
  const L = {sel: [0, 1], m: [[cell(5), null], [null, cell(2)], [cell(1), null], [null, null]], cur: {combo: [1, 0], assign: [[0, 0], [1, 1], [2, 0]]}};
  const c = trip(items, L), G = JSON.parse(JSON.stringify(c.tripGroups(L)));
  assert.deepStrictEqual(G.map(g => [g.name, g.rows]), [['Lidl', [1]], ['Jumbo', [2, 0]], ['Prijs onbekend', [3]]]);
  /* zonder prijzen staat alles onder prijs onbekend; leeg lijstje: geen opsomming */
  assert.deepStrictEqual(JSON.parse(JSON.stringify(c.tripGroups({sel: [0], none: true}).map(g => [g.name, g.rows]))), [['Prijs onbekend', [0, 1, 2, 3]]]);
  assert.strictEqual(trip([], {empty: true}).tripGroups({empty: true}).length, 0);
});
test('boodschappenlijst: afgevinkt blijft op zijn plek; elke winkel heeft een teken', () => {
  assert.ok(!/doneLast/.test(body), 'geen herordening na afvinken');
  assert.ok(/function renderTrip[\s\S]*?storeLogo\(/.test(body), 'logo of winkelteken in het kopje');
  const c = trip([], null);
  for (const [n, want] of [['AH', 'AH'], ['SPAR', 'SPAR'], ['ALDI', 'ALDI'], ['Jumbo', 'J'], ['DekaMarkt', 'DM'], ["Boon's Markt", 'BM'], ['Lidl', 'LIDL']])
    assert.strictEqual(c.storeMark(n), want, n);
});
test('boodschappenlijst gebruikt dezelfde vinkjes als de bonnen en sluit met de terugknop', () => {
  assert.ok(/function renderTrip[\s\S]*?data-act="tick"/.test(body), 'zelfde tick-actie');
  assert.ok(/window\.slimBack = function\(\)\{[^\n]*closeTrip\(\)/.test(body), 'terugknop sluit de lijst');
  assert.ok(!/<[^>]+\son[a-z]+=/i.test(body.replace(/<script[\s\S]*$/, '')), 'geen inline handlers');
});
test('na toevoegen wordt de knop min, aantal en plus op dezelfde plek; geen apart venster', () => {
  assert.ok(!/openQty|qtyHtml/.test(body), 'geen pop-up voor het aantal');
  const c = {esc: s => String(s), S: {items: [{q: 'Melk', qty: 3}, {q: 'Brood', qty: 99}]}};
  vm.createContext(c);
  vm.runInContext(['findItem', 'addCtl'].map(grab).join('\n') + '\nObject.assign(globalThis, {findItem, addCtl});', c);
  assert.ok(/data-act="adddeal"/.test(c.addCtl('kaas', 'card')) && !/stepin/.test(c.addCtl('kaas', 'card')));
  assert.ok(/data-act="adddetail"/.test(c.addCtl('kaas', 'detail')));
  const m = c.addCtl('melk', 'card');
  assert.ok(/data-d="-1"/.test(m) && /data-d="1"/.test(m) && /class="stepin"[^>]*value="3"/.test(m), 'min, aantal 3 en plus');
  assert.ok(/data-d="1"[^>]*disabled/.test(c.addCtl('brood', 'card')), 'niet boven 99');
});

/* affiliate: centrale link, gewone pagina als terugval, en nooit invloed op de vergelijking */
test('affiliate: zonder programma de gewone productpagina; met programma een sponsored link', () => {
  const c = {URL, esc: s => String(s).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';')};
  vm.createContext(c);
  const aff = body.match(/^const AFFILIATE = .*$/m)[0];
  vm.runInContext(['safeHttp', 'shopUrl', 'outLink', 'outA'].map(grab).join('\n') + '\n' + aff.replace('const AFFILIATE', 'globalThis.AFFILIATE') +
    '\nObject.assign(globalThis, {outLink, outA});', c);
  const st = {k: 'ah', b: 'https://www.ah.nl/producten/product/', l: ['wi1/melk']};
  assert.deepStrictEqual(Object.keys(c.AFFILIATE), [], 'nu staat nog geen enkel programma aan');
  assert.strictEqual(c.outLink(st, 0).href, 'https://www.ah.nl/producten/product/wi1/melk');
  assert.strictEqual(c.outLink(st, 0).ad, false);
  assert.ok(/rel="noopener"/.test(c.outA(c.outLink(st, 0), 'x', 'Bekijk')));
  c.AFFILIATE.ah = {on: true, tpl: 'https://net.example/c?u={url}'};
  const o = c.outLink(st, 0);
  assert.strictEqual(o.href, 'https://net.example/c?u=' + encodeURIComponent('https://www.ah.nl/producten/product/wi1/melk'));
  assert.ok(/rel="sponsored noopener"/.test(c.outA(o, 'x', 'Bekijk')) && /advertentie/.test(c.outA(o, 'x', 'Bekijk')));
  c.AFFILIATE.ah = {on: true, tpl: 'javascript:alert(1)//{url}'};
  assert.strictEqual(c.outLink(st, 0).ad, false, 'onveilige link: terug naar de gewone pagina');
  c.AFFILIATE.ah = {on: false, tpl: 'https://net.example/c?u={url}'};
  assert.strictEqual(c.outLink(st, 0).ad, false, 'uitgezet = gewone pagina');
});
test('affiliate telt nooit mee in zoeken, totalen of volgorde', () => {
  const uses = (body.match(/AFFILIATE/g) || []).length;
  const inOut = (grab('outLink').match(/AFFILIATE/g) || []).length;
  const decl = (body.match(/^const AFFILIATE = .*$/m)[0].match(/AFFILIATE/g) || []).length;
  const comments = (body.match(/\/\*[\s\S]*?\*\//g) || []).join('').match(/AFFILIATE/g) || [];
  assert.strictEqual(uses, inOut + decl + comments.length, 'AFFILIATE alleen in outLink');
  const eng = fs.readFileSync(path.join(__dirname, '..', 'web', 'engine.js'), 'utf8');
  assert.ok(!/AFFILIATE|outLink|sponsored/.test(eng), 'de rekenkern kent geen affiliate');
  assert.strictEqual((body.match(/shopUrl\(/g) || []).length, 2, 'shopUrl alleen gedefinieerd en gebruikt in outLink');
  assert.ok(!/rel="noopener">Bekijk (bij|↗)/.test(body), 'geen productlink buiten outA om');
});
