/* Tests voor losse functies uit web/body.html die met externe data werken. Draaien: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const body = fs.readFileSync(path.join(__dirname, '..', 'web', 'body.html'), 'utf8');
/* de functies zelf uit de pagina halen, zodat de test altijd de echte code draait */
const grab = name => {
  const m = body.match(new RegExp('^function ' + name + '\\(.*?(?:\\}\\r?\\n|\\n\\}\\r?\\n)', 'ms'));
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
