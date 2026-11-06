/* Tests voor de rekenmodule (web/engine.js). Draaien: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'engine.js'), 'utf8') +
  '\nObject.assign(globalThis, {Engine, priceMatrix, plan, advise, lineCost, packsFor, perUnit, betterValue, muchCheaperElsewhere, fairSaving, searchRank, stemNL, storeTotals, sortStoreTotals, guessCats, parseQuery, cleanList, cleanCounts, comparable, Map, estimated, priced, wordForms});', ctx);
const {Engine, priceMatrix, plan, advise, lineCost, betterValue, muchCheaperElsewhere, fairSaving, searchRank, stemNL, storeTotals, sortStoreTotals, guessCats, parseQuery, cleanList, cleanCounts} = ctx;
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

const rank = (q, items) => { const r = searchRank(q.split(' '), items); return [...r].sort((a, b) => a[1] - b[1]).map(x => x[0].name); };

test('zoeken: enkelvoud en meervoud zijn hetzelfde woord', () => {
  for (const [a, b] of [['banaan', 'bananen'], ['appel', 'appels'], ['tomaat', 'tomaten'], ['peer', 'peren'], ['koek', 'koekjes'], ['ei', 'eieren'], ['kip', 'kippen']])
    assert.strictEqual(stemNL(a), stemNL(b), a);
  assert.notStrictEqual(stemNL('kip'), stemNL('kips'));
});

test('zoeken: echte bananen staan boven drinken en toetjes met banaan', () => {
  const items = [{name: 'Alpro Sojadrink banaan', cat: 'zuivel-eieren'}, {name: 'AH Knijpfruit appel banaan 6m+', cat: 'groente-fruit'},
    {name: 'Chiquita Groene bananen', cat: 'groente-fruit'}, {name: 'Bananenchips', cat: 'snoep-koek-chips'}, {name: 'Del Monte Bananen', cat: 'groente-fruit'}];
  const r = rank('banaan', items);
  assert.ok(r.slice(0, 2).every(n => /[Bb]ananen$/.test(n)), r.join());
});

test('zoeken: appels boven appelsap, appelmoes en appeltaart', () => {
  const items = [{name: 'Hak Appelmoes extra kwaliteit', cat: 'soepen-conserven-sauzen'}, {name: 'Appeltaart', cat: 'brood-bakkerij'},
    {name: 'AH Appelsap', cat: 'frisdrank'}, {name: 'Elstar appels', cat: 'groente-fruit'}];
  assert.strictEqual(rank('appel', items)[0], 'Elstar appels');
});

test('zoeken: peer vindt geen perzik', () => {
  assert.deepStrictEqual(plain(rank('peer', [{name: 'Perziken op sap', cat: 'x'}, {name: 'Conference peren', cat: 'x'}])), ['Conference peren']);
});

test('zoeken: alle woorden moeten passen', () => {
  assert.deepStrictEqual(plain(rank('halfvolle melk', [{name: 'Campina Halfvolle melk', cat: 'z'}, {name: 'Volle melk', cat: 'z'}])), ['Campina Halfvolle melk']);
});

test('zoeken: roomboter is boter, kipfilet is kip, ijsbergsla is sla', () => {
  assert.strictEqual(rank('boter', [{name: 'AH Boterkoeken', cat: 'snoep-koek-chips'}, {name: 'Campina Roomboter', cat: 'zuivel-eieren'}])[0], 'Campina Roomboter');
  assert.strictEqual(rank('kip', [{name: 'AH Bapao kip', cat: 'maaltijden'}, {name: 'Kipfilet', cat: 'vlees'}])[0], 'Kipfilet');
  assert.strictEqual(rank('sla', [{name: 'Slagers knakworst', cat: 'vlees'}, {name: 'IJsbergsla', cat: 'groente-fruit'}])[0], 'IJsbergsla');
});

test('zoeken: synoniem en tikfout', () => {
  const items = [{name: 'Page toiletpapier', cat: 'huishouden'}, {name: 'Prodent tandpasta', cat: 'mondverzorging'}];
  assert.deepStrictEqual(plain(rank('wc papier', items)), ['Page toiletpapier']);
  assert.deepStrictEqual(plain(rank('tandpsta', items)), ['Prodent tandpasta']);
});

test('zoeken: 0% suiker staat onderaan bij suiker; ui vindt geen uit', () => {
  assert.strictEqual(rank('suiker', [{name: 'Ginger ale 0% suiker', cat: 'frisdrank'}, {name: 'Van Gilse Suikerklontjes', cat: 'ontbijt'}])[0], 'Van Gilse Suikerklontjes');
  assert.deepStrictEqual(plain(rank('ui', [{name: 'Uit de oven pizza', cat: 'x'}, {name: 'Rode uien', cat: 'x'}])), ['Rode uien']);
});

/* ---------- ontbrekende prijzen ---------- */
const cell = price => ({price, mode: 'exact'});

test('per winkel: totaal, aantal en welke producten ontbreken', () => {
  const m = [[cell(100), cell(120)], [cell(200), null], [null, null]];
  const t = plain(storeTotals(m, [4, 7]));
  assert.deepStrictEqual(t[0], {store: 4, total: 300, count: 2, items: 3, missing: [2], complete: true, suspect: 0});
  assert.deepStrictEqual(t[1], {store: 7, total: 120, count: 1, items: 3, missing: [1, 2], complete: false, suspect: 0});
});

test('per winkel: regels die veel duurder zijn dan elders worden geteld, het totaal blijft gelijk', () => {
  /* bananensoesjes bij bananen: 3 keer zo duur of meer telt als mogelijk verkeerd product */
  const m = [[cell(1745), cell(258)], [cell(100), cell(120)], [cell(900), cell(300)], [cell(500), null]];
  const t = plain(storeTotals(m, [0, 1]));
  assert.strictEqual(t[0].suspect, 2);
  assert.strictEqual(t[0].total, 3245);
  assert.strictEqual(t[1].suspect, 0);
});

test('per winkel: een regel met onbekend formaat of zonder vergelijking telt niet als mogelijk verkeerd', () => {
  const m = [[{price: 1000, mode: 'unknown'}, cell(100)], [cell(1000), {price: 100, mode: 'other'}], [cell(1000), null]];
  assert.ok(plain(storeTotals(m, [0, 1])).every(x => x.suspect === 0));
});

test('een product zonder prijs telt nooit als 0', () => {
  /* winkel 0 lijkt met een lege of nul-prijs goedkoper, maar die regels tellen niet mee */
  const m = [[cell(0), cell(150)], [{mode: 'exact'}, cell(250)], [cell(NaN), cell(80)]];
  const t = plain(storeTotals(m, [0, 1]));
  assert.strictEqual(t[0].count, 0);
  assert.strictEqual(t[0].total, 0);
  assert.strictEqual(t[0].complete, false);
  assert.deepStrictEqual(t[0].missing, [0, 1, 2]);
  const pl = plan(m, [0, 1], 2);
  assert.deepStrictEqual(plain(pl.result[0].combo), [1]);
  assert.strictEqual(pl.result[0].total, 480);
});

test('een regel met prijs 0 in de data wordt geen treffer', () => {
  const A = store('A', [['A pindakaas 350 g', 0, 1, 350]]);
  const B = store('B', [['B pindakaas 350 g', 249, 1, 350]]);
  const {m, pl} = basket([A, B], [{id: 1, q: 'pindakaas 350 g', qty: 1}]);
  assert.strictEqual(m[0][0], null);
  assert.strictEqual(pl.result[0].total, 249);
});

test('een product dat nergens een prijs heeft blijft op de lijst en breekt de vergelijking niet', () => {
  const A = store('A', [['A pindakaas 350 g', 249, 1, 350]]);
  const B = store('B', [['B pindakaas 350 g', 199, 1, 350]]);
  const items = [{id: 1, q: 'pindakaas 350 g', qty: 1}, {id: 2, q: 'xqzt', qty: 1}];
  const {m, pl} = basket([A, B], items);
  assert.strictEqual(m.length, 2);
  assert.deepStrictEqual(plain(pl.missing), [1]);
  assert.strictEqual(pl.result[0].total, 199);
  const t = plain(storeTotals(m, [0, 1]));
  assert.ok(t.every(x => x.complete && x.count === 1 && x.items === 2));
});

test('alleen producten zonder prijs: niets gevonden en geen advies', () => {
  const pl = plan([[null, null]], [0, 1], 2);
  assert.deepStrictEqual(plain(pl.found), []);
  assert.deepStrictEqual(plain(pl.missing), [0]);
  assert.strictEqual(plain(storeTotals([[null, null]], [0, 1]))[0].count, 0);
});

test('winkel met weinig producten staat niet bovenaan, ook al is hij het goedkoopst', () => {
  const m = [[cell(100), cell(150), null], [null, cell(300), cell(250)], [null, cell(200), cell(190)]];
  const t = plain(sortStoreTotals(storeTotals(m, [0, 1, 2])));
  assert.deepStrictEqual(t.map(x => x.store), [1, 2, 0]);
  assert.strictEqual(t[0].complete, true);
  assert.strictEqual(t[1].complete, false);
});

test('gelijk aantal producten: laagste totaal eerst', () => {
  const t = plain(sortStoreTotals(storeTotals([[cell(300), cell(200)]], [0, 1])));
  assert.deepStrictEqual(t.map(x => x.store), [1, 0]);
});

test('complete winkel: totaal gelijk aan het plan voor 1 winkel', () => {
  const m = [[cell(100), cell(120)], [cell(200), cell(150)]];
  const pl = plan(m, [0, 1], 2), t = plain(sortStoreTotals(storeTotals(m, [0, 1])));
  assert.strictEqual(t[0].total, pl.result[0].total);
  assert.deepStrictEqual(plain(pl.result[0].combo), [t[0].store]);
});

test('geen enkele winkel heeft alles: advies blijft bij 2 winkels, 1 winkel toont de beste deeloplossing', () => {
  const m = [[cell(100), null, cell(90)], [cell(200), cell(150), null], [null, cell(300), cell(320)]];
  const pl = plan(m, [0, 1, 2], 2);
  assert.strictEqual(pl.result[0], null);
  assert.strictEqual(advise(pl.result, 200), 1);
  /* elke winkel heeft er 2 van de 3: winkel 0 is dan het goedkoopst (300), en mist product 2 */
  assert.deepStrictEqual(plain(pl.partial[0].combo), [0]);
  assert.strictEqual(pl.partial[0].total, 300);
  assert.deepStrictEqual(plain(pl.partial[0].lack), [2]);
  assert.strictEqual(pl.partial[1], null);
});

test('deeloplossing: meeste producten gaat boven laagste totaal', () => {
  const m = [[cell(100), cell(900)], [null, cell(900)], [null, cell(1)], [cell(5), null]];
  const pl = plan(m, [0, 1], 1);
  assert.deepStrictEqual(plain(pl.partial[0].combo), [1]);
  assert.strictEqual(pl.partial[0].assign.length, 3);
});

test('te veel winkels nodig: geen resultaat, wel een deeloplossing', () => {
  const m = [[cell(100), null, null], [null, cell(100), null], [null, null, cell(100)]];
  const pl = plan(m, [0, 1, 2], 2);
  assert.strictEqual(advise(pl.result, 200), -1);
  assert.strictEqual(pl.partial[1].assign.length, 2);
});

/* ---------- zoeken in het gewone assortiment ---------- */
test('assortiment: per naam gegroepeerd, zonder acties, zonder prijs 0 en zonder wat setMask uitzet', () => {
  const A = store('A', [['A Bananen 1 kg', 199, 1, 1000], ['A Halfvolle melk 1 l', 0, 2, 1000]],
    [{row: ['A Pindakaas 350 g', 199, 1, 350]}]);
  const B = store('B', [['B Bananen 1 kg', 179, 1, 1000]]);
  const eng = new Engine([A, B]);
  /* winkel B heeft bijvoorbeeld oude gewone prijzen */
  eng.setMask(s => s === 0);
  assert.deepStrictEqual(plain(eng.assortment()).map(g => [g.name, g.rows]), [['Bananen', [[0, 0]]]]);
  eng.setMask(() => true);
  assert.deepStrictEqual(plain(eng.assortment()).map(g => g.rows), [[[0, 0], [1, 0]]]);
});

test('assortiment: laagste prijs van het gangbare formaat, alleen in je eigen winkels', () => {
  const A = store('A', [['Bananen 1 kg', 199, 1, 1000], ['Bananen 1 st', 25, 3, 1]]);
  const B = store('B', [['Bananen 1 kg', 179, 1, 1000]]);
  const C = store('C', [['Bananen 1 kg', 149, 1, 1000]]);
  const eng = new Engine([A, B, C]);
  const g = eng.assortment()[0];
  const o = eng.assortOffer(g, new Set([0, 1]));
  assert.strictEqual(o.price, 179);
  assert.strictEqual(o.s, 1);
  assert.strictEqual(o.q, 'bananen 1 kg');
  assert.strictEqual(eng.assortOffer(g, new Set([5])), null);
});

test('zoeken: een gewone banaan staat boven een drankje met banaan in de aanbieding', () => {
  const items = [{name: 'Alpro Sojadrink banaan', cat: 'zuivel-eieren'}, {name: 'Bananen', cat: ''}, {name: 'Bananenbrood', cat: ''}];
  const r = rank('banaan', items);
  assert.strictEqual(r[0], 'Bananen');
  assert.ok(r.indexOf('Alpro Sojadrink banaan') > 0);
});

test('zoeken: gewone producten zonder afdeling zakken niet en bepalen de afdeling niet', () => {
  const items = [{name: 'Pindasaus', cat: 'soepen-conserven-sauzen'}, {name: 'Pindas gezouten', cat: ''}, {name: 'Pindas ongezouten', cat: ''}, {name: 'Pindas', cat: 'snoep-koek-chips'}];
  const r = searchRank(['pindas'], items);
  assert.strictEqual(r.get(items[1]), r.get(items[2]));
  assert.strictEqual(rank('pindas', items)[0], 'Pindas');
});

test('afdeling van gewone producten: geleend van aanbiedingen, bij twijfel onbekend', () => {
  const deals = [{name: 'AH Halfvolle melk', cat: 'zuivel-eieren'}, {name: 'Milka chocoladeletter', cat: 'snoep-koek-chips'}, {name: 'Verkade chocoladeletter', cat: 'snoep-koek-chips'},
    {name: 'Dole bananen', cat: 'groente-fruit'}, {name: 'Chiquita bananen', cat: 'groente-fruit'}];
  const groups = [{base: 'halfvolle melk'}, {base: 'chocoladeletter'}, {base: 'bananen'}, {base: 'bananen soesjes'}];
  guessCats(groups, deals);
  assert.deepStrictEqual(plain(groups.map(g => g.cat)), ['zuivel-eieren', 'snoep-koek-chips', 'groente-fruit', '']);
});

/* ---------- zoeken mag nooit vastlopen ---------- */
const within = (ms, fn) => { const t = Date.now(); const r = fn(); assert.ok(Date.now() - t < ms, 'duurde ' + (Date.now() - t) + ' ms'); return r; };
const shelf = ['Calvé Pindakaas', 'Pindakaas zonder palmolie', 'Roomboter ongezouten', 'Wonder wasmiddel', 'Mr Wonder allesreiniger', 'Suiker zonder klontjes',
  'Elstar appels', 'Zout 1 kg', 'Halfvolle melk', 'Tandpasta mint', 'Komkommer', 'Bonder kaas', 'Zomder test'].map(name => ({name, cat: 'x'}));

test('zoeken: de zoekopdrachten die vastliepen eindigen', () => {
  for (const q of ['pindakaas zonder suiker', 'roomboter zonder zout', 'appel xqztw'])
    within(500, () => assert.strictEqual(searchRank(parseQuery(q).tokens, shelf).size, 0, q));
});

test('zoeken: alleen een woord zonder enkele treffer wordt verbeterd, stopwoorden nooit', () => {
  assert.deepStrictEqual(plain(rank('komkomer', shelf)), ['Komkommer']);
  /* zonder heeft zelf treffers en wonder ernaast mag er nooit van worden gemaakt */
  assert.deepStrictEqual(plain(rank('zonder suiker', shelf)), ['Suiker zonder klontjes']);
  const noHit = [{name: 'Wonder wasmiddel', cat: 'x'}, {name: 'Wonder zeep', cat: 'x'}];
  assert.strictEqual(searchRank(['zonder'], noHit).size, 0);
  assert.strictEqual(searchRank(['wonder', 'zonder'], noHit).size, 0);
  /* een goed woord blijft staan als alleen het andere woord een tikfout is */
  assert.deepStrictEqual(plain(rank('tandpsta mint', shelf)), ['Tandpasta mint']);
});

test('zoeken: willekeurige woordcombinaties eindigen altijd snel', () => {
  let seed = 20261105; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const words = ['zonder', 'wonder', 'zomder', 'bonder', 'suiker', 'suikre', 'zout', 'pindakaas', 'pindakas', 'met', 'en', 'de', 'appel', 'appels', 'xqztw', 'kaas', 'melk', 'melkk',
    'constructor', '__proto__', 'tostring', 'hasownproperty', 'wc', 'papier', '500', 'kaaskaaskaas', 'ééé', 'roomboter', 'roomboder'];
  within(5000, () => {
    for (let k = 0; k < 3000; k++){
      const q = Array.from({length: 1 + rnd(8)}, () => words[rnd(words.length)]).join(' ');
      assert.ok(searchRank(parseQuery(q).tokens, shelf) instanceof ctx.Map, q);
    }
  });
});

test('zoeken: ook op de echte prijsdata eindigen ze snel', () => {
  const b64 = fs.readFileSync(path.join(__dirname, '..', 'data', 'data.b64'), 'utf8').trim();
  const D = JSON.parse(require('zlib').gunzipSync(Buffer.from(b64, 'base64')));
  const items = [];
  D.stores.forEach(s => s.n.forEach(name => items.push({name, cat: ''})));
  searchRank(['melk'], items);   /* eenmalig: de woorden van alle namen uitrekenen */
  for (const q of ['pindakaas zonder suiker', 'roomboter zonder zout', 'appel xqztw', 'constructor', 'zonder wonder zonder'])
    within(4000, () => searchRank(parseQuery(q).tokens, items));
});

test('zoekopdracht: hoogstens 6 woorden en 80 tekens', () => {
  assert.strictEqual(parseQuery('a1 b2 c3 d4 e5 f6 g7 h8').tokens.length, 6);
  assert.deepStrictEqual(plain(parseQuery('x'.repeat(200)).tokens), ['x'.repeat(80)]);
  assert.deepStrictEqual(plain(parseQuery('500 g').tokens), []);
  assert.deepStrictEqual(plain(parseQuery('de').tokens), []);
});

/* ---------- rare namen ---------- */
const RARE = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype'];

test('rare namen: analyseren, zoeken en suggesties geven geen fout', () => {
  const A = store('A', [['A constructor 1 kg', 199, 1, 1000], ['A melk 1 l', 99, 2, 1000]]);
  const eng = new Engine([A]);
  for (const q of RARE){
    const a = eng.analyze(q, 15);
    assert.strictEqual(a.per.length, 1);
    eng.suggest(q, [0], 5);
    searchRank(parseQuery(q).tokens, [{name: 'Constructor kit', cat: 'constructor'}, {name: 'Melk', cat: '__proto__'}]);
    assert.strictEqual(typeof stemNL(q.toLowerCase()), 'string');
  }
  const {pl} = basket([A], RARE.map((q, k) => ({id: k + 1, q, qty: 1})));
  assert.ok(pl.missing.length >= 1);
});

test('rare afdeling in de data: afdelingen raden gaat goed', () => {
  const g = [{base: 'melk'}, {base: 'kaas'}];
  guessCats(g, [{name: 'Melk', cat: 'constructor'}, {name: 'Halfvolle melk', cat: 'constructor'}, {name: 'Kaas', cat: '__proto__'}]);
  assert.strictEqual(g[0].cat, 'constructor');
});

test('gedeelde lijst: lege namen weg, aantal geheel en 1-99', () => {
  assert.deepStrictEqual(plain(cleanList([['  melk ', 2.6], ['', 3], ['   ', 1], ['kaas', 0], ['brood', -4], ['ei', 1000], ['bier', 'x'], [5, 1], null, 'tekst', ['a  b', 1]])),
    [['melk', 3], ['kaas', 1], ['brood', 1], ['ei', 99], ['bier', 1], ['a b', 1]]);
  assert.strictEqual(cleanList(Array.from({length: 150}, (_, k) => ['p' + k, 1]), 100).length, 100);
  assert.strictEqual(cleanList([['x'.repeat(200), 1]])[0][0].length, 80);
  for (const bad of [null, 'x', {}, 5]) assert.deepStrictEqual(plain(cleanList(bad)), []);
});

test('tellers uit de opslag: alleen echte aantallen, prototype onaangetast', () => {
  const h = cleanCounts(JSON.parse('{"melk":3,"kaas":"x","ei":-1,"__proto__":{"melk":9},"constructor":2}'));
  assert.strictEqual(h.melk, 3);
  assert.strictEqual(h.constructor, 2);
  assert.strictEqual(h.kaas, undefined);
  assert.strictEqual(Object.getPrototypeOf(h), null);
  assert.strictEqual(Object.keys(cleanCounts(null)).length, 0);
});

/* ---------- ander soort product ---------- */
test('kaas: ravioli met kaas stuurt de winkelkeuze niet', () => {
  const A = store('A', [['Jong belegen kaas 400 g', 499, 1, 400]]);
  const B = store('B', [['Daily Chef Ravioli kaas 400 g', 245, 1, 400]]);
  const {m, pl} = basket([A, B], [{id: 1, q: 'kaas', qty: 1}]);
  assert.strictEqual(m[0][1], null);
  assert.deepStrictEqual(plain(pl.result[0].combo), [0]);
});

test('ander soort product zakt binnen de winkel onder het echte product', () => {
  const A = store('A', [['Daily Chef Ravioli kaas 400 g', 245, 1, 400], ['Belegen kaas 400 g', 699, 1, 400]]);
  const a = new Engine([A]).analyze('kaas', 5);
  assert.strictEqual(a.per[0].cands[0].name, 'Belegen kaas 400 g');
});

test('merk als zoekwoord: wasmiddel en yoghurt tellen niet als ander soort', () => {
  const A = store('A', [['Ariel Wasmiddel Color 1 l', 1399, 2, 1000]]);
  const B = store('B', [['Ariel Pods 1 l', 999, 2, 1000]]);
  const {m} = basket([A, B], [{id: 1, q: 'ariel', qty: 1}]);
  assert.ok(m[0][0] && m[0][1]);
  assert.strictEqual(m[0][0].c.other, false);
});

test('merkproduct met het gevraagde product in de naam blijft meedoen', () => {
  const A = store('A', [['Calvé Pindakaas 350 g', 349, 1, 350]]);
  const B = store('B', [['Pindakaas 350 g', 149, 1, 350]]);
  const {m} = basket([A, B], [{id: 1, q: 'pindakaas 350 g', qty: 1}]);
  assert.ok(m[0][0] && m[0][1]);
});

test('alleen ander soort product te koop: dan blijft dat staan', () => {
  const A = store('A', [['Ravioli kaas 400 g', 245, 1, 400]]);
  const {m} = basket([A], [{id: 1, q: 'kaas', qty: 1}]);
  assert.ok(m[0][0]);
});

test('zelf gekozen ander soort product blijft staan', () => {
  const A = store('A', [['Kaas 400 g', 499, 1, 400]]);
  const B = store('B', [['Kaas ravioli 400 g', 245, 1, 400]]);
  const eng = new Engine([A, B]), items = [{id: 1, q: 'kaas', qty: 1}];
  const m = priceMatrix(items, {1: eng.analyze('kaas', 15)}, {1: {1: 0}}, [0, 1]);
  assert.strictEqual(m[0][1].c.name, 'Kaas ravioli 400 g');
});

/* ---------- beter passend maar niet om te rekenen ---------- */
test('bananen 1 kg: echte bananen per 5 stuks blijven staan als onbekend formaat, soesjes vallen af', () => {
  const A = store('A', [['Jumbo Bananen Soesjes 240 g', 349, 1, 240], ['Jumbo Dole Bananen 5 Stuks', 169, 3, 5]]);
  const B = store('B', [['Bananen', 185, 3, 5]]);
  const C = store('C', [['Chiquita Groene bananen', 175, 3, 5]]);
  const D = store('D', [['Budget Bananen 832 g', 129, 1, 832]]);
  const {m} = basket([A, B, C, D], [{id: 1, q: 'bananen 1 kg', qty: 1}]);
  assert.strictEqual(m[0][0].c.name, 'Jumbo Dole Bananen 5 Stuks');
  for (const j of [0, 1, 2]){
    assert.strictEqual(m[0][j].mode, 'unknown');
    assert.strictEqual(ctx.comparable(m[0][j]), false);
  }
  assert.strictEqual(m[0][3].mode, 'scaled');
  /* de waarschuwing en de groene prijs gaan alleen over wat wel te vergelijken is */
  assert.strictEqual(muchCheaperElsewhere(m[0], 3), null);
});

test('beter passend product zonder rekenbare eenheid wijkt niet voor een slechter passend product', () => {
  const A = store('A', [['Volkoren brood', 250, 3, 1]]);
  const B = store('B', [['Meergranen lang houdbaar volkoren brood stevig 800 g', 300, 1, 800]]);
  const {m} = basket([A, B], [{id: 1, q: 'volkoren brood 800 g', qty: 1}]);
  assert.strictEqual(m[0][0].mode, 'unknown');
  assert.strictEqual(m[0][1].mode, 'exact');
});

test('veel te groot pak dat even goed past blijft weg als er een vergelijkbaar pak is', () => {
  const A = store('A', [['Zout 25 kg', 900, 1, 25000]]);
  const B = store('B', [['Zout 1 kg', 60, 1, 1000]]);
  const {m} = basket([A, B], [{id: 1, q: 'zout 1 kg', qty: 1}]);
  assert.strictEqual(m[0][0], null);
});

/* ---------- een ~-prijs stuurt het advies niet (QA: boter, olie, koffie, wijn, bananen) ---------- */
const cheapest = (stores, q, qty = 1) => basket(stores, [{id: 1, q, qty}]);

test('boter: speculaasbrokken per stuk zijn niet de goedkoopste boter', () => {
  const A = store('A', [['Roomboter Ongezouten 250 g', 115, 1, 250]]);
  const B = store('B', [['POIESZ Roomboter Speculaasbrokken', 75, 3, 6]]);
  const {m, pl} = cheapest([A, B], 'boter');
  assert.deepStrictEqual(plain(pl.result[0].combo), [0]);
  assert.strictEqual(pl.result[0].total, 115);
  assert.strictEqual(ctx.priced(m[0][1]), false);
});

test('olie: sardines in zonnebloemolie zijn geen olie', () => {
  const A = store('A', [['Jumbo Zonnebloemolie 1 L', 129, 2, 1000]]);
  const B = store('B', [['Sardines in zonnebloemolie', 80, 1, 120]]);
  const {pl} = cheapest([A, B], 'olie');
  assert.deepStrictEqual(plain(pl.result[0].combo), [0]);
  assert.strictEqual(pl.result[0].total, 129);
});

test('koffie: ijskoffie is geen koffie, ook al eindigt het erop', () => {
  const A = store('A', [['Douwe Egberts filterkoffie 500 g', 649, 1, 500]]);
  const B = store('B', [['Douwe Egberts ijskoffie 230 ml', 80, 2, 230]]);
  const {pl} = cheapest([A, B], 'koffie');
  assert.deepStrictEqual(plain(pl.result[0].combo), [0]);
});

test('wijn: zuurkool met wijn is geen wijn', () => {
  const A = store('A', [['Rode wijn 750 ml', 399, 2, 750]]);
  const B = store('B', [['Zuurkool Wijn 500 g', 99, 1, 500]]);
  const {pl} = cheapest([A, B], 'wijn');
  assert.deepStrictEqual(plain(pl.result[0].combo), [0]);
});

const bananas = () => [store('Jumbo', [['Jumbo Dole Bananen 5 Stuks', 169, 3, 5]]), store('Deka', [['Del Monte Bananen 1 kg', 89, 1, 1000]]), store('Poiesz', [['Budget Bananen', 129, 1, 832]])];

test('bananen 1, 3 en 5 kg: de prijs schaalt mee en 5 stuks wint nooit', () => {
  for (const [q, price] of [['bananen 1 kg', 89], ['bananen 3 kg', 267], ['bananen 5 kg', 445]]){
    const {m, pl} = cheapest(bananas(), q);
    assert.strictEqual(pl.result[0].total, price, q);
    assert.deepStrictEqual(plain(pl.result[0].combo), [1], q);
    /* zichtbaar in de tabel met ~, maar telt niet mee */
    assert.strictEqual(m[0][0].mode, 'unknown');
    assert.strictEqual(m[0][0].info, true);
    assert.strictEqual(ctx.estimated(m[0][0]), false);
  }
});

test('een winkel met alleen een ~-prijs heeft het product niet voor het advies', () => {
  const [J, D] = bananas();
  const eng = [J, D], items = [{id: 1, q: 'bananen 1 kg', qty: 1}, {id: 2, q: 'melk 1 l', qty: 1}];
  const M = store('M', [['Jumbo melk 1 l', 99, 2, 1000], ['Jumbo Dole Bananen 5 Stuks', 169, 3, 5]]);
  const N = store('N', [['Melk 1 l', 150, 2, 1000], ['Bananen 1 kg', 199, 1, 1000]]);
  const {pl} = basket([M, N], items);
  /* M lijkt goedkoper, maar heeft geen vergelijkbare bananen: alleen N dekt alles */
  assert.deepStrictEqual(plain(pl.result[0].combo), [1]);
  assert.strictEqual(pl.result[0].total, 349);
  assert.strictEqual(eng.length, 2);
});

test('nergens iets vergelijkbaars, zelfde eenheid: geschat en omgerekend naar wat je vroeg', () => {
  const A = store('A', [['Saffraan 1 g', 300, 1, 1]]);
  const {m, pl} = cheapest([A], 'saffraan 100 g');
  assert.strictEqual(ctx.estimated(m[0][0]), true);
  assert.strictEqual(m[0][0].price, 30000);
  assert.strictEqual(pl.result[0].total, 30000);
});

test('nergens iets vergelijkbaars, andere eenheid: de prijs telt niet, want die zou gelijk blijven bij 3 kg', () => {
  const A = store('A', [['Dole Bananen 5 Stuks', 169, 3, 5]]);
  for (const q of ['bananen 1 kg', 'bananen 3 kg']){
    const {m, pl} = cheapest([A], q);
    assert.strictEqual(m[0][0].info, true, q);
    assert.deepStrictEqual(plain(pl.missing), [0], q);
  }
});

test('geen hoeveelheid gevraagd en nergens vergelijkbaar: de verpakking telt als schatting', () => {
  const A = store('A', [['Komkommer', 75, 0, 0]]);
  const {m, pl} = cheapest([A], 'komkommer');
  assert.strictEqual(pl.result[0].total, 75);
  assert.strictEqual(m[0][0].mode, 'exact');
});

test('hoeveelheid gevraagd: onbekend formaat wint niet van een vergelijkbaar product', () => {
  const A = store('A', [['Pindakaas', 89, 0, 0]]);
  const B = store('B', [['Pindakaas 350 g', 249, 1, 350]]);
  const {m, pl} = cheapest([A, B], 'pindakaas 350 g');
  assert.strictEqual(m[0][0].mode, 'unknown');
  assert.deepStrictEqual(plain(pl.result[0].combo), [1]);
});

test('zelf gekozen ~-product telt wel mee, als schatting', () => {
  const [J, D] = bananas(), eng = new Engine([J, D]), items = [{id: 1, q: 'bananen 1 kg', qty: 1}];
  const m = priceMatrix(items, {1: eng.analyze('bananen 1 kg', 15)}, {1: {0: 0}}, [0, 1]);
  assert.strictEqual(ctx.estimated(m[0][0]), true);
  assert.strictEqual(plan(m, [0, 1], 1).result[0].total, 89);
});

test('besparing: schattingen tellen niet mee, ook niet als er alleen maar schattingen zijn', () => {
  const est = price => ({price, mode: 'unknown'});
  const m = [[est(1100), est(80)], [{price: 300, mode: 'exact'}, {price: 200, mode: 'exact'}]];
  const one = {total: 1400, assign: [[0, 0], [1, 0]]}, two = {total: 280, assign: [[0, 1], [1, 1]]};
  /* op het oog € 11,20 verschil; echt te vergelijken is alleen 300 - 200 */
  assert.strictEqual(fairSaving(one, two, m, [0, 1]), 100);
  assert.strictEqual(advise([one, two], 200, (a, b) => fairSaving(a, b, m, [0, 1])), 0);
});

test('jus: een product in gram is bij 1 liter nooit exact', () => {
  const A = store('A', [['Sinaasappelsap 1 l', 99, 2, 1000]]);
  const B = store('B', [['Maggi Jus', 49, 1, 29]]);
  const a = new Engine([A, B]).analyze('jus', 15);
  assert.strictEqual(a.kind, 2);
  assert.strictEqual(a.per[1].cands[0].mode, 'other');
});

test('enkelvoud en meervoud vinden hetzelfde in de winkel', () => {
  const A = store('A', [['Olvarit banaan 6 mnd 200 g', 129, 1, 200], ['Chiquita bananen 1 kg', 199, 1, 1000], ['Conference peren 1 kg', 249, 1, 1000], ['Perziken op sap 400 g', 99, 1, 400]]);
  const e = new Engine([A]);
  assert.strictEqual(e.analyze('banaan', 5).per[0].cands[0].name, 'Chiquita bananen 1 kg');
  assert.strictEqual(e.analyze('bananen', 5).per[0].cands[0].name, 'Chiquita bananen 1 kg');
  const names = plain(e.analyze('peer', 5).per[0].cands.map(c => c.name));
  assert.deepStrictEqual(names, ['Conference peren 1 kg']);
  assert.ok(!ctx.wordForms('peer').includes('per') && !ctx.wordForms('kaas').includes('kas'));
});

test('kaas: macaroni ham-kaas is een gerecht', () => {
  const A = store('A', [['Plus Macaroni ham-kaas 400 g', 299, 1, 400]]);
  const B = store('B', [['Jong belegen kaas 400 g', 499, 1, 400]]);
  const {m} = cheapest([A, B], 'kaas');
  assert.strictEqual(m[0][0], null);
});

test('macaroni zoeken vindt gewoon macaroni', () => {
  const A = store('A', [['Macaroni 500 g', 35, 1, 500]]);
  const {m} = cheapest([A], 'macaroni');
  assert.ok(m[0][0] && !m[0][0].c.other);
});

test('appels vindt geen aardappelen of sinaasappels; boter geen boterhamworst', () => {
  const A = store('A', [['A aardappelen kruimig 1 kg', 99, 1, 1000], ['A boterhamworst 150 g', 120, 1, 150]]);
  const B = store('B', [['B appels 1 kg', 179, 1, 1000], ['B roomboter 250 g', 229, 1, 250]]);
  const {m} = basket([A, B], [{id: 1, q: 'appels 1 kg', qty: 1}, {id: 2, q: 'boter 250 g', qty: 1}]);
  assert.strictEqual(m[0][0], null);
  assert.strictEqual(m[1][0], null);
  assert.strictEqual(m[0][1].price, 179);
  const C = store('C', [['C aardappelen 1 kg', 149, 1, 1000]]);
  assert.strictEqual(basket([C], [{id: 1, q: 'aardappelen 1 kg', qty: 1}]).m[0][0].price, 149);
});
