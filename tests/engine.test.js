/* Tests voor de rekenmodule (web/engine.js). Draaien: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'engine.js'), 'utf8') +
  '\nObject.assign(globalThis, {Engine, priceMatrix, plan, advise, lineCost, packsFor, perUnit, betterValue, muchCheaperElsewhere, fairSaving});', ctx);
const {Engine, priceMatrix, plan, advise, lineCost, betterValue, muchCheaperElsewhere, fairSaving} = ctx;
/* objecten uit de vm hebben een ander prototype; via JSON vergelijken we alleen de inhoud */
const plain = x => JSON.parse(JSON.stringify(x));
const perUnit = c => plain(ctx.perUnit(c));

/* een winkel in hetzelfde formaat als data.b64: eerst gewone prijzen, dan acties.
   regel: [naam, prijs in centen, soort (1 g, 2 ml, 3 st, 0 onbekend), hoeveelheid] */
function store(k, reg, promos = []){
  const rows = reg.concat(promos.map(p => p.row));
  return {k, c: k, f: '2026-11-01', r: reg.length,
    n: rows.map(x => x[0]), p: rows.map(x => x[1]), u: rows.map(x => x[2]), q: rows.map(x => x[3]), l: rows.map(() => ''),
    po: promos.map(p => p.usual || 0), pm: promos.map(p => p.mbq || 0), pp: promos.map(p => p.mbp || 0),
    pl: promos.map(p => p.label || ''), pf: promos.map(() => ''), pv: promos.map(() => ''), pc: promos.map(() => 0),
    pt: promos.map(() => 0), pi: promos.map(() => -1), im: []};
}
function basket(stores, items, kmax = 3){
  const eng = new Engine(stores);
  const an = {};
  items.forEach(it => { an[it.id] = eng.analyze(it.q, 15); });
  const sel = stores.map((_, s) => s);
  const m = priceMatrix(items, an, {}, sel);
  return {m, pl: plan(m, sel, kmax)};
}

test('1+1 gratis: de actie geldt alleen per twee stuks', () => {
  const c = {price: 49, usual: 99, mbq: 2, mbp: 99, r: 1};
  assert.strictEqual(lineCost(c, 1), 99);
  assert.strictEqual(lineCost(c, 2), 99);
  assert.strictEqual(lineCost(c, 3), 198);
});

test('2e halve prijs: één stuk kost de gewone prijs', () => {
  const c = {price: 127, usual: 169, mbq: 2, mbp: 254, r: 1};
  assert.strictEqual(lineCost(c, 1), 169);
  assert.strictEqual(lineCost(c, 2), 254);
  assert.strictEqual(lineCost(c, 4), 508);
});

test('2 voor 5,00 zonder bekende losse prijs: nooit goedkoper dan de hele actie', () => {
  const c = {price: 250, usual: 0, mbq: 2, mbp: 500, r: 1};
  assert.strictEqual(lineCost(c, 1), 500);
  assert.strictEqual(lineCost(c, 2), 500);
  assert.strictEqual(lineCost(c, 3), 1000);
});

test('3 voor 2,99 met 4 stuks: één bundel plus één los', () => {
  const c = {price: 100, usual: 135, mbq: 3, mbp: 299, r: 1};
  assert.strictEqual(lineCost(c, 4), 299 + 135);
});

test('kleinere verpakking: je koopt meerdere pakken', () => {
  /* 1 kg gevraagd, 400 g per pak: 3 pakken */
  assert.strictEqual(lineCost({price: 150, r: 2.5}, 1), 450);
});

test('grotere verpakking: je betaalt het hele pak', () => {
  assert.strictEqual(lineCost({price: 300, r: 0.5}, 1), 300);
});

test('prijs per kilo, liter en stuk', () => {
  assert.deepStrictEqual(perUnit({price: 250, u: 1, q: 500}), {cents: 500, per: 'kg'});
  assert.deepStrictEqual(perUnit({price: 99, u: 2, q: 1500}), {cents: 66, per: 'l'});
  assert.deepStrictEqual(perUnit({price: 300, u: 3, q: 12}), {cents: 25, per: 'st'});
  assert.strictEqual(perUnit({price: 300, u: 0, q: 0}), null);
  /* bij 1+1 gratis telt de actieprijs per stuk */
  assert.deepStrictEqual(perUnit({price: 49, u: 2, q: 1000, mbq: 2, mbp: 99}), {cents: 50, per: 'l'});
});

test('klein zakje mag niet als goedkoopste winkel uitkomen voor 1 kg', () => {
  /* A verkoopt alleen zakjes van 100 g, B een pak van 1 kg */
  const A = store('A', [['A rijst 100 g', 60, 1, 100]]);
  const B = store('B', [['B rijst 1 kg', 199, 1, 1000]]);
  const {m, pl} = basket([A, B], [{id: 1, q: 'rijst 1 kg', qty: 1}]);
  /* bij A kost 1 kg 10 zakjes = € 6,00 */
  assert.strictEqual(m[0][0].price, 600);
  assert.deepStrictEqual(plain(pl.result[0].combo), [1]);
  assert.strictEqual(pl.result[0].total, 199);
});

test('prijs per stuk wordt niet vergeleken met een prijs per kilo', () => {
  /* A verkoopt bananen per stuk, B per kilo: A is niet vergelijkbaar en telt niet mee */
  const A = store('A', [['A bananen', 25, 3, 1]]);
  const B = store('B', [['B bananen 1 kg', 199, 1, 1000]]);
  const {m, pl} = basket([A, B], [{id: 1, q: 'bananen 1 kg', qty: 1}]);
  assert.strictEqual(m[0][0], null);
  assert.deepStrictEqual(plain(pl.result[0].combo), [1]);
});

test('bananenbrood met onbekend formaat wint niet van echte bananen', () => {
  const A = store('A', [['A bananenbrood', 100, 0, 0]]);
  const B = store('B', [['B bananen 1 kg', 199, 1, 1000]]);
  const {m, pl} = basket([A, B], [{id: 1, q: 'bananen 1 kg', qty: 1}]);
  assert.strictEqual(m[0][0], null);
  assert.deepStrictEqual(plain(pl.result[0].combo), [1]);
});

test('onbekend formaat dat goed past blijft meedoen (zoals veel Lidl-producten)', () => {
  const A = store('A', [['A pindakaas', 189, 0, 0]]);
  const B = store('B', [['B pindakaas 350 g', 249, 1, 350]]);
  const {m} = basket([A, B], [{id: 1, q: 'pindakaas 350 g', qty: 1}]);
  assert.strictEqual(m[0][0].mode, 'unknown');
});

test('alleen onvergelijkbare producten: dan toch de goedkoopste, als schatting', () => {
  const A = store('A', [['A banaan', 25, 3, 1]]);
  const B = store('B', [['B banaan', 30, 3, 1]]);
  const {pl} = basket([A, B], [{id: 1, q: 'banaan', qty: 1}]);
  assert.deepStrictEqual(plain(pl.result[0].combo), [0]);
});

test('advies: een extra winkel alleen als die genoeg oplevert', () => {
  const res = [{total: 2000}, {total: 1850}, {total: 1800}];
  assert.strictEqual(advise(res, 200), 0);
  assert.strictEqual(advise(res, 100), 1);
  assert.strictEqual(advise(res, 50), 2);
  assert.strictEqual(advise([null, {total: 900}], 200), 1);
});

test('mandje met actie: de goedkoopste combinatie klopt', () => {
  const A = store('A', [['A halfvolle melk 1 l', 119, 2, 1000], ['A pindakaas 350 g', 249, 1, 350]]);
  const B = store('B', [['B pindakaas 350 g', 299, 1, 350]],
    [{row: ['B halfvolle melk 1 l', 49, 2, 1000], usual: 99, mbq: 2, mbp: 99, label: '1+1 gratis'}]);
  const items = [{id: 1, q: 'halfvolle melk 1 l', qty: 2}, {id: 2, q: 'pindakaas 350 g', qty: 1}];
  const {pl} = basket([A, B], items);
  /* 1 winkel: A = 238 + 249 = 487, B = 99 + 299 = 398 */
  assert.strictEqual(pl.result[0].total, 398);
  assert.deepStrictEqual(plain(pl.result[0].combo), [1]);
  /* 2 winkels: melk bij B (99), pindakaas bij A (249) */
  assert.strictEqual(pl.result[1].total, 348);
});

test('extreem dure "match" (meer dan 8 keer) telt niet mee', () => {
  /* A heeft alleen soesjes (240 g voor € 3,49), B echte bananen */
  const A = store('A', [['A bananen soesjes 240 g', 349, 1, 240]]);
  const B = store('B', [['B bananen 1 kg', 199, 1, 1000]]);
  const {m, pl} = basket([A, B], [{id: 1, q: 'bananen 1 kg', qty: 1}]);
  assert.strictEqual(m[0][0], null);
  assert.deepStrictEqual(plain(pl.result[0].combo), [1]);
});

test('duurder A-merk blijft gewoon meedoen', () => {
  /* koffie van € 7,49 tegenover huismerk € 3,99: minder dan 4 keer zo duur */
  const A = store('A', [['A merkkoffie filterkoffie 500 g', 749, 1, 500]]);
  const B = store('B', [['B filterkoffie 500 g', 399, 1, 500]]);
  const {m} = basket([A, B], [{id: 1, q: 'filterkoffie 500 g', qty: 1}]);
  assert.ok(m[0][0]);
});

test('tip: groter pak is per kilo voordeliger', () => {
  const cands = [
    {i: 0, name: 'Rijst 500 g', price: 189, u: 1, q: 500, score: 0, mode: 'exact'},
    {i: 1, name: 'Rijst 1 kg', price: 279, u: 1, q: 1000, score: 0, mode: 'scaled'},
    {i: 2, name: 'Rijst 5 kg', price: 999, u: 1, q: 5000, score: 0.4, mode: 'scaled'},
    {i: 3, name: 'Rijstwafels', price: 99, u: 1, q: 130, score: 3, mode: 'scaled'}];
  const t = betterValue(cands, 0);
  /* 5 kg is per kilo het voordeligst (€ 2,00), maar rijstwafels passen niet bij de zoekterm */
  assert.strictEqual(t.name, 'Rijst 5 kg');
  assert.strictEqual(betterValue(cands, 2), null);
});

test('waarschuwing als een product veel duurder is dan elders', () => {
  const row = [{price: 1745, mode: 'scaled'}, {price: 258, mode: 'scaled'}, {price: 400, mode: 'exact'}, null];
  assert.strictEqual(muchCheaperElsewhere(row, 0).price, 258);
  assert.strictEqual(muchCheaperElsewhere(row, 2), null);
  assert.strictEqual(muchCheaperElsewhere(row, 1), null);
});

/* twee producten; winkel 0 heeft een verdacht dure "match" voor product 0 (1745 tegenover 258 bij winkel 1) */
const fair = {
  m: [[{price: 1745, mode: 'scaled'}, {price: 258, mode: 'scaled'}], [{price: 300, mode: 'exact'}, {price: 200, mode: 'exact'}]],
  sel: [0, 1],
  one: {total: 2045, assign: [[0, 0], [1, 0]]},
  two: {total: 458, assign: [[0, 1], [1, 1]]}};

test('besparing telt een regel met waarschuwing niet mee', () => {
  /* eerlijk: alleen het tweede product scheelt echt, 300 - 200 */
  assert.strictEqual(fairSaving(fair.one, fair.two, fair.m, fair.sel), 100);
});

test('besparing zonder waarschuwing is gewoon het verschil', () => {
  const m = [[{price: 300, mode: 'exact'}, {price: 200, mode: 'exact'}]];
  const a = {total: 300, assign: [[0, 0]]}, b = {total: 200, assign: [[0, 1]]};
  assert.strictEqual(fairSaving(a, b, m, [0, 1]), 100);
});

test('advies: een verdachte regel is geen reden voor een extra winkel', () => {
  const by = (a, b) => fairSaving(a, b, fair.m, fair.sel);
  /* op het oog € 15,87 verschil, eerlijk maar € 1,00: bij een drempel van € 2 blijft het 1 winkel */
  assert.strictEqual(advise([fair.one, fair.two], 200, by), 0);
  assert.strictEqual(advise([fair.one, fair.two], 200), 1);
});
