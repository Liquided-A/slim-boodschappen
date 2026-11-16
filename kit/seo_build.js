/* Bouwt de statische pagina's van de website uit site/ met de prijzen van vandaag.
   Gebruik: node kit/seo_build.js data.b64 site uitmap [https://adres/]

   - vult {{SITE}} (volledig adres, eindigt op /), {{DATUM}} en {{JAAR}} in alle pagina's in;
   - vult <!--GEN:mandje--> (goedkoopste supermarkt voor een vast mandje) en <!--GEN:acties--> (acties van deze week);
   - schrijft sitemap.xml en robots.txt.
   Alle bedragen komen uit de prijsdata van die dag en uit dezelfde rekenmodule als de app (web/engine.js).
   Niets wordt verzonnen: een winkel zonder actuele gewone prijzen doet niet mee in het mandje, en dat staat erbij. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const [dataFile, srcDir, outDir, siteArg] = process.argv.slice(2);
if (!dataFile || !srcDir || !outDir) { console.error('gebruik: node kit/seo_build.js data.b64 site uitmap [adres]'); process.exit(2); }
const SITE = (siteArg || process.env.SITE_URL || 'https://liquided-a.github.io/slim-boodschappen/').replace(/\/?$/, '/');
if (!/^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._~\/-]*)?$/.test(SITE)) throw new Error('ongeldig site-adres: ' + SITE);
const ROOT = path.join(__dirname, '..');

/* ---------- data en rekenmodule, precies zoals de app ze gebruikt ---------- */
const data = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(dataFile, 'utf8').trim(), 'base64')).toString('utf8'));
const NOW = new Date(data.promoFetched.slice(0, 10) + 'T12:00:00');
const body = fs.readFileSync(path.join(ROOT, 'web', 'body.html'), 'utf8');
const grab = name => {
  const m = body.match(new RegExp('^function ' + name + '\\(.*\\}\\r?$', 'm')) || body.match(new RegExp('^function ' + name + '\\(.*?^\\}\\r?$', 'ms'));
  if (!m) throw new Error('functie ' + name + ' niet gevonden in body.html');
  return m[0];
};
const ctx = {NOW, STORES: data.stores, STALE_DAYS: Number((body.match(/^const STALE_DAYS = (\d+);/m) || [])[1]), S: {oldReg: false}};
if (!(ctx.STALE_DAYS > 0)) throw new Error('STALE_DAYS niet gevonden in body.html');
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'web', 'engine.js'), 'utf8') + '\n' +
  ['mmddToDate', 'promoActive', 'regFresh', 'keep'].map(grab).join('\n') + '\n' +
  /* afdelingsnamen en -volgorde, zoals de app ze toont */
  (body.match(/^const CATLABEL = \{[\s\S]*?\};/m) || ['const CATLABEL = {};'])[0] + '\n' + (body.match(/^const CATORDER = \[[\s\S]*?\];/m) || ['const CATORDER = [];'])[0] +
  '\nObject.assign(globalThis, {Engine, priceMatrix, storeTotals, sortStoreTotals, plan, priced, comparable, regFresh, keep, promoActive, mmddToDate, CATLABEL, CATORDER});', ctx);
const C = ctx;
const eng = new C.Engine(data.stores);
eng.setMask(C.keep);

const esc = s => String(s).replace(/[&<>"'{}]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '{': '&#123;', '}': '&#125;'}[c]));
const euro = cents => '€ ' + (cents / 100).toFixed(2).replace('.', ',');
const dayFmt = new Intl.DateTimeFormat('nl-NL', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam'});
const DATUM = dayFmt.format(NOW);

/* ---------- vast mandje: gangbare weekboodschappen, met hoeveelheid zodat winkels eerlijk te vergelijken zijn ---------- */
/* Per product vaste regels welke producten meedoen (req: moet in de naam staan, not: mag er niet in staan). De automatische
   koppeling van de app is goed genoeg voor een eigen lijstje dat je zelf naloopt, maar niet voor een uitspraak als
   "deze winkel is het goedkoopst": daar mag geen stroopwafel als roomboter of vochtig toiletpapier als toiletpapier tussen zitten. */
const BASKET = [
  ['halfvolle melk 1 l', /halfvolle melk|melk halfvol/, /lactosevrij|choco|karne|drink|koffie|poeder|bio/],
  ['volkoren brood', /volkoren/, /beschuit|cracker|knäck|wrap|toast|bol|stokbrood|pistolet|mix|meel|crouton|broodje|kaiser|bolletje|half/],
  ['scharreleieren 10 stuks', /scharrel/, /gekookt|gepeld|salade|bio|vrije uitloop|kwartel/],
  ['roomboter 250 g', /roomboter/, /stroopwa|koek|cake|croissant|deeg|kruiden|knoflook|wafel|bonbon|cookie|spritz|sprits|amand|specpop|puntje|taart/],
  ['jong belegen kaas 500 g', /jong belegen/, /geraspt|blokjes|plakken|smeer|light|[23]0\+|35\+|biologisch|bio |geit|schaap|komijn|kruiden|pesto|truffel|mosterd|brandnetel|peper|knoflook/],
  ['elstar 1 kg', /elstar/, /sap|moes|taart|chips|gedroogd|bio/],
  ['aardappelen 2 kg', /aardappel/, /friet|patat|kriel|puree|chips|schijf|partjes|rosti|kroket|gekookt|zoete|krieltjes|wedges|gratin|salade|bio/],
  ['spaghetti 500 g', /spaghetti/, /saus|maaltijd|volkoren|glutenvrij|bolognese|pesto|verse|vers |bio|maanden|olvarit|tomaat|\bham\b|\bmet\b/],
  ['rijst 1 kg', /rijst/, /zilvervlies|wafel|pap|maaltijd|bruin|risotto|sushi|noedel|melk|dessert|cracker|basmati|pandan|jasmijn|wild|kook in|zak|bio|\bmet\b|\bkip\b|nasi|bami/],
  ['pindakaas 350 g', /pindakaas/, /reep|koek|saus|chocola|cup|light|honing|kokos|biologisch|bio /],
  /* zoeken op 'filter': dan doet ook snelfiltermaling mee; getoond als filterkoffie */
  ['filter 500 g', /filterkoffie|filter.*koffie|filtermaling|snelfilter/, /pads|cups|bonen|oplos|capsule|decaf|cafeïnevrij|cafeinevrij|zakjes|papier|koffiefilter/, 'filterkoffie 500 g'],
  ['kristalsuiker 1 kg', /kristalsuiker/, /riet|bruin|klont|stick|poeder/],
  ['komkommer', /komkommer/, /mini|salade|plakjes|snack|zuur|augurk|water|bio/],
  ['uien 1 kg', /\buien\b/, /rode|lente|sjalot|zilver|gebakken|gesnipperd|soep|ringen|poeder|bio|zoete|gedroogd|gefrituurd/],
  ['kipfilet 500 g', /kipfilet/, /reepjes|blokjes|gekruid|gemarineerd|beleg|plakjes|gerookt|shoarma|saté|sate|schnitzel|gegrild|gebraden|cordon|nugget|burger|bio|haas|mini|wortel|erwt|\bmet\b|maaltijd|americano|kebab|tandoori|roast|gaar/],
  ['rundergehakt 500 g', /rundergehakt/, /bal|burger|kruiden|bio|tartaar|lasagne|ballen/],
  ['halfvolle yoghurt 1 l', /yoghurt/, /vanille|aardbei|fruit|griekse|turkse|drink|perzik|kers|framboos|honing|banaan|mango|magere|\bvolle|bio|kwark|skyr|toetje/],
  ['hagelslag melk 400 g', /hagelslag/, /puur|wit|vlokken|fruit|mix|anijs|smaak|vanille|beer|jammie/],
  ['afwasmiddel 500 ml', /afwasmiddel/, /machine|vaatwas|tabs|capsule|navul|borstel/],
  ['zonnebloemolie 1 l', /zonnebloemolie/, /spray|bio/],
];

const BASKET_DAYS = 14;
/* winkels waarvan we de gewone prijzen zelf ophalen (eigen-prijzen.yml); de rest komt uit Checkjebon */
/* zelf opgehaald: er staat een data/<winkel>.json van de laatste 14 dagen (own_prices.py gebruikt die dan) */
const OWN = new Set(data.stores.map(st => st.k).filter(k => {
  try { const o = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', k + '.json'), 'utf8'));
        return o.d && o.d.length >= 300 &&(NOW - new Date(o.fetched + 'T12:00:00')) / 864e5 <= BASKET_DAYS; }
  catch (e) { return false; }
}));
let BASKETMEMO = null;
const BASKETRANK = {};   /* per winkel de plaats in het mandje van vandaag, voor de winkelpagina's */
function basketSection(){ return BASKETMEMO || (BASKETMEMO = basketCalc()); }
function basketCalc(){
  /* De app noemt gewone prijzen tot STALE_DAYS dagen oud actueel. Een openbare uitspraak "X is het goedkoopst" vraagt
     meer: alleen winkels waarvan de gewone prijzen in de laatste BASKET_DAYS dagen zijn bijgewerkt doen mee. */
  const recent = st => st.r > 0 && C.regFresh(st) && st.f && (NOW - new Date(st.f + 'T12:00:00')) / 864e5 <= BASKET_DAYS;
  const fresh = data.stores.map((st, s) => s).filter(s => recent(data.stores[s]));
  const stale = data.stores.filter(st => st.r > 0 && !recent(st)).map(st => st.c + (st.f ? ' (gewone prijzen laatst bijgewerkt op ' + dayFmt.format(new Date(st.f + 'T12:00:00')) + ')' : ''));
  const noReg = data.stores.filter(st => !st.r).map(st => st.c);
  const items = BASKET.map(([q, req, not, label], i) => ({id: i + 1, q, label: label || q, qty: 1, req, not}));
  const an = {}; items.forEach(it => { an[it.id] = eng._analyze(it.q, 80); });   /* zonder de vertaling naar het gangbare product (rijst -> zilvervliesrijst): het mandje heeft eigen regels */
  /* eerlijk vergelijken: omrekenen naar precies de gevraagde hoeveelheid (per kilo, liter of stuk), zodat een pak van 20
     eieren niet duurder lijkt dan een doos van 12. Zonder bruikbare hoeveelheid telt de cel niet mee. */
  /* Per winkel het goedkoopste product onder alle goed passende producten (niet alleen de allerbeste naamovereenkomst),
     zodat huismerk tegen huismerk wordt vergeleken en niet het A-merk van de ene winkel tegen het huismerk van de andere. */
  const FIT = 3;   /* ruim: de vaste regels per product (req/not) houden verkeerde producten buiten */
  const unitCost = (c, a) => {
    /* het mandje vraagt één stuk: een "2 voor"-actie telt niet mee, net als in de app bij aantal 1 */
    const each = c.mbq > 1 && c.mbp ? (c.usual || c.mbp) : c.price;   /* bij 1+1 of 2 voor: de prijs als je er één koopt */
    if (!a.kind || a.inferred) return {price: Math.round(each), c};                     /* geen hoeveelheid gevraagd: één verpakking */
    if (c.u !== a.kind || !c.q || !(c.mode === 'exact' || c.mode === 'scaled')) return null;
    return {price: Math.round(each / c.q * a.amount), c, scaled: Math.abs(c.q - a.amount) > 0.01};
  };
  const m = items.map(it => {
    const a = an[it.id];
    return fresh.map(s => {
      const e = a && a.per[s]; if (!e || !e.cands.length) return null;
      const real = e.cands.filter(c => { const n = c.name.toLowerCase(); return c.price > 0 && it.req.test(n) && !it.not.test(n) && !/baby|peuter|kinder/.test(n); });
      if (!real.length) return null;
      const top = Math.min(...real.map(c => c.score));
      let best = null;
      for (const c of real){
        if (c.score > top + FIT) continue;
        const x = unitCost(c, a);
        if (x && x.price > 0 && (!best || x.price < best.price)) best = x;
      }
      return best;
    });
  });
  /* 1. Veel duurder dan de rest voor dezelfde hoeveelheid (meer dan 3x de middelste prijs): vrijwel altijd een ander
        product of een verkeerd gelezen verpakking; die ene prijs telt niet mee.
     2. Liggen de prijzen bij de winkels die meetellen daarna nog meer dan 3,5x uit elkaar, dan vergelijken we bij die
        regel geen gelijke producten; dan telt het product voor geen enkele winkel mee. */
  m.forEach((row, i) => {
    const ps = row.filter(Boolean).map(x => x.price).sort((a, b) => a - b);
    if (ps.length < 3) return;
    const mid = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
    m[i] = row.map(x => {
      if (x && x.price > 3 * mid){ if (process.env.SEO_DEBUG) console.error('uitschieter', items[i].q, x.c.name, x.price, 'midden', mid); return null; }
      return x;
    });
  });
  const need = Math.ceil(items.length * 0.8);
  const eligible = fresh.map((s, j) => m.filter(row => row[j]).length >= need);
  m.forEach((row, i) => {
    const ps = row.filter((x, j) => x && eligible[j]).map(x => x.price).sort((a, b) => a - b);
    if (ps.length >= 2 && ps[ps.length - 1] > 3.5 * ps[0]){
      if (process.env.SEO_DEBUG) console.error('regel valt weg', items[i].q, row.map(x => x ? x.c.name + ' ' + x.price : '-').join(' | '));
      m[i] = row.map(() => null);
    }
  });
  const totals = C.sortStoreTotals(C.storeTotals(m, fresh));
  if (process.env.SEO_DEBUG) totals.forEach(t => console.error('mandje', data.stores[t.store].c, t.count + '/' + m.length, 'mist:', t.missing.map(i => items[i].label).join(', ')));
  const rows = items.length, minCount = Math.ceil(rows * 0.8);
  const ranked = totals.filter(t => t.count >= minCount);
  const few = totals.filter(t => t.count < minCount);
  if (!ranked.length) return '<p>Vandaag zijn er te weinig actuele gewone prijzen om een eerlijk mandje te vergelijken.</p>';

  /* zelfde aantal producten: alleen die totalen zijn echt naast elkaar te zetten */
  const common = m.map((row, i) => ranked.every(t => C.priced(row[fresh.indexOf(t.store)])) ? i : -1).filter(i => i >= 0);
  const sumCommon = t => common.reduce((a, i) => a + m[i][fresh.indexOf(t.store)].price, 0);
  const byCommon = ranked.slice().sort((a, b) => sumCommon(a) - sumCommon(b));
  const cheapest = byCommon[0], dearest = byCommon[byCommon.length - 1];
  if (byCommon.length > 1) byCommon.forEach((t, k) => { BASKETRANK[t.store] = {pos: k + 1, of: byCommon.length}; });

  SUMMARY = byCommon.length > 1 ? 'Op ' + esc(DATUM) + ' was <strong>' + esc(data.stores[cheapest.store].c) + '</strong> het goedkoopst voor ons vaste mandje van ' + common.length +
    ' producten, ' + euro(sumCommon(dearest) - sumCommon(cheapest)) + ' goedkoper dan ' + esc(data.stores[dearest.store].c) + '.' : '';
  let h = '<p class="lead">Op ' + esc(DATUM) + ' was <strong>' + esc(data.stores[cheapest.store].c) + '</strong> het goedkoopst voor ons vaste mandje van ' +
    common.length + ' producten die alle vergeleken winkels hebben: <strong>' + euro(sumCommon(cheapest)) + '</strong>' +
    (byCommon.length > 1 ? ', tegen ' + euro(sumCommon(dearest)) + ' bij ' + esc(data.stores[dearest.store].c) + ' (' + euro(sumCommon(dearest) - sumCommon(cheapest)) + ' verschil)' : '') + '.</p>';
  if (byCommon.length > 1){
    const second = byCommon[1], gap = (sumCommon(second) - sumCommon(cheapest)) / sumCommon(cheapest);
    if (gap < 0.05) h += '<p>Het verschil met ' + esc(data.stores[second.store].c) + ' is klein (' + euro(sumCommon(second) - sumCommon(cheapest)) + ', ' + Math.max(1, Math.round(gap * 100)) +
      '%). Met een ander lijstje of in een andere week kan dus een andere supermarkt het goedkoopst zijn.</p>';
  }
  h += '<div class="tablewrap"><table class="rank"><caption>Mandje van ' + common.length + ' producten, gewone prijzen plus lopende aanbiedingen</caption>' +
    '<thead><tr><th scope="col">#</th><th scope="col">Supermarkt</th><th scope="col">Totaal</th><th scope="col">Verschil</th></tr></thead><tbody>' +
    byCommon.map((t, k) => '<tr' + (k === 0 ? ' class="best"' : '') + '><td>' + (k + 1) + '</td><th scope="row">' + esc(data.stores[t.store].c) + '</th><td>' + euro(sumCommon(t)) +
      '</td><td>' + (k ? '+ ' + euro(sumCommon(t) - sumCommon(cheapest)) : '–') + '</td></tr>').join('') + '</tbody></table></div>' +
    '<p class="small">Dit zegt iets over dit mandje op deze dag, niet over alle producten of over jouw boodschappen. Een andere selectie kan een andere uitkomst geven.</p>';

  /* per product: welk product en welke prijs, zodat iedereen kan nagaan hoe het totaal tot stand komt */
  h += '<details><summary>Bekijk per product wat we vergeleken</summary><div class="tablewrap"><table class="items"><thead><tr><th scope="col">Product</th>' +
    byCommon.map(t => '<th scope="col">' + esc(data.stores[t.store].c) + '</th>').join('') + '</tr></thead><tbody>' +
    common.map(i => {
      const cells = byCommon.map(t => m[i][fresh.indexOf(t.store)]);
      const low = Math.min(...cells.map(x => x.price));
      return '<tr><th scope="row">' + esc(items[i].label) + '</th>' + cells.map(x => '<td' + (x.price === low ? ' class="low"' : '') + ' title="' + esc(x.c.name) + '">' +
        euro(x.price) + (x.c.usual ? ' <span class="sale">actie</span>' : '') + '<small>' + esc(x.c.name) + (x.scaled ? ' · omgerekend' : '') + '</small></td>').join('') + '</tr>';
    }).join('') + '</tbody></table></div></details>';

  const notes = [];
  if (common.length < rows) notes.push((rows - common.length) + ' van de ' + rows + ' producten in ons mandje hadden niet alle winkels; die tellen hier niet mee.');
  if (few.length) notes.push('Te weinig producten gevonden om eerlijk mee te tellen: ' + few.map(t => esc(data.stores[t.store].c)).join(', ') + '.');
  notes.push('Bronnen van de gewone prijzen: ' + byCommon.map(t => { const st = data.stores[t.store];
    return esc(st.c) + ' ' + (OWN.has(st.k) ? 'zelf opgehaald van de eigen webwinkel' : 'uit de open data van Checkjebon') + ', bijgewerkt op ' + esc(dayFmt.format(new Date(st.f + "T12:00:00")));
  }).join('; ') + '. Aanbiedingen via PrijsProfeet, opgehaald op ' + esc(DATUM) + '. Webwinkelprijzen kunnen afwijken van de prijs in een filiaal.');
  if (stale.length) notes.push('Niet vergeleken, omdat de gewone prijzen van deze winkels de laatste ' + BASKET_DAYS + ' dagen niet zijn bijgewerkt: ' + stale.map(esc).join(', ') + '. Hun aanbiedingen zie je wel in de app.');
  if (noReg.length) notes.push('Van ' + noReg.map(esc).join(', ') + ' hebben we alleen aanbiedingen.');
  h += '<ul class="notes">' + notes.map(n => '<li>' + n + '</li>').join('') + '</ul>';
  return h;
}

let SUMMARY = '';
function basketShort(){
  basketSection();
  return SUMMARY ? '<p class="lead">' + SUMMARY + '</p><p><a href="goedkoopste-supermarkt.html">Bekijk de hele vergelijking per product</a></p>'
    : '<p><a href="goedkoopste-supermarkt.html">Bekijk welke supermarkt het goedkoopst is</a></p>';
}
/* ---------- pagina per supermarkt: "<winkel> aanbiedingen", elke dag uit de echte acties ---------- */
const MIN_STORE_DEALS = 20;   /* minder acties: geen eigen pagina, die zou te dun zijn */
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const storePage = st => 'aanbiedingen-' + slug(st.k || st.c) + '.html';
/* actietekst rustig: "2+3 GRATIS" wordt "2+3 gratis" (zelfde regel als de app) */
const mech = t => String(t || '').replace(/\b[A-ZÀ-Ý]{4,}\b/g, w => w.toLowerCase()).replace(/\s+/g, ' ').trim();
const catLabel = k => (C.CATLABEL && C.CATLABEL[k]) || 'Overig';
function activeDeals(st){
  const out = [];
  for (let j = 0; j < st.n.length - st.r; j++){
    if (!C.promoActive(st, j)) continue;
    const i = st.r + j, now = st.p[i], was = st.po[j];
    const pct = was > now ? Math.round(100 * (1 - now / was)) : 0;
    out.push({name: st.n[i], now, was: pct > 0 && pct < 70 ? was : 0, pct: pct < 70 ? pct : 0, until: st.pv[j], label: mech(st.pl[j]), multi: st.pm[j] > 1,
      cat: data.cats ? data.cats[st.pc[j]] : ''});
  }
  return out;
}
const storePages = data.stores.filter(st => activeDeals(st).length >= MIN_STORE_DEALS);
const shortDate = v => { const d = v ? C.mmddToDate(v) : null; return d ? new Intl.DateTimeFormat('nl-NL', {day: 'numeric', month: 'short'}).format(d) : ''; };
function dealLi(d){
  return '<li>' + (d.pct ? '<span class="pct">−' + d.pct + '%</span> ' : '') + '<strong>' + esc(d.name) + '</strong>: ' + euro(d.now) + (d.was ? ' <s>' + euro(d.was) + '</s>' : '') +
    (d.label ? ' <span class="small">· ' + esc(d.label) + '</span>' : '') + (shortDate(d.until) ? ' <span class="small">· t/m ' + esc(shortDate(d.until)) + '</span>' : '') + '</li>';
}
/* afwisseling: hooguit 2 producten van hetzelfde merk (eerste woord), geen dubbele namen; de rest schuift door */
function diverse(list, max, seen){
  const names = seen || new Set(), brands = {}, out = [];
  for (const d of list){
    const k = d.name.toLowerCase(), b = k.split(/\s+/)[0];
    if (names.has(k) || (brands[b] || 0) >= 2) continue;
    names.add(k); brands[b] = (brands[b] || 0) + 1; out.push(d);
    if (out.length >= max) break;
  }
  return out;
}
function storePageHtml(st, s){
  const deals = activeDeals(st), n = deals.length, name = esc(st.c), file = storePage(st);
  const top = deals.filter(d => d.pct >= 25 && d.now >= 50).sort((a, b) => b.pct - a.pct || a.now - b.now);
  const seen = new Set(), best = diverse(top, 12, seen);
  /* per afdeling de beste acties, in de volgorde van de winkel */
  const byCat = {};
  deals.forEach(d => { (byCat[d.cat || 'overig'] = byCat[d.cat || 'overig'] || []).push(d); });
  const order = (C.CATORDER || []).filter(k => byCat[k]).concat(Object.keys(byCat).filter(k => !(C.CATORDER || []).includes(k)));
  const cats = order.map(k => {
    const list = diverse(byCat[k].slice().sort((a, b) => b.pct - a.pct || a.now - b.now).filter(d => !seen.has(d.name.toLowerCase())), 8);
    return list.length ? '<h3>' + esc(catLabel(k)) + ' <span class="small">(' + byCat[k].length + ')</span></h3><ul class="deals">' + list.map(dealLi).join('') + '</ul>' : '';
  }).join('');
  const fresh = st.r > 0 && C.regFresh(st);
  const rank = BASKETRANK[s];
  const regText = fresh
    ? 'Van ' + name + ' vergelijken we ook de gewone prijzen (bijgewerkt op ' + esc(dayFmt.format(new Date(st.f + 'T12:00:00'))) + '). Zo zie je in de app niet alleen de aanbiedingen, maar ook wat de rest van je lijstje bij ' + name + ' kost.' +
      (rank ? ' In ons vaste mandje van vandaag staat ' + name + ' op plaats ' + rank.pos + ' van ' + rank.of + '. <a href="goedkoopste-supermarkt.html">Bekijk de hele vergelijking</a>.' : '')
    : st.r > 0 ? 'De gewone prijzen van ' + name + ' die we hebben, zijn niet actueel genoeg. In de app tellen daarom alleen de aanbiedingen van ' + name + ' mee; dat staat er steeds duidelijk bij.'
    : 'Van ' + name + ' hebben we op dit moment alleen de aanbiedingen, nog geen gewone prijzen. In de app zie je die aanbiedingen naast de prijzen van andere supermarkten.';
  /* maximaal 160 tekens zoals Google het toont; de lange variant alleen als die past (ook na het coderen van tekens als ') */
  const descLong = st.c + ' aanbiedingen van deze week: ' + n + ' acties, met de grootste kortingen per afdeling. Elke ochtend bijgewerkt en te vergelijken met andere supermarkten.';
  const desc = esc(descLong).length <= 160 ? descLong : st.c + ' aanbiedingen van deze week: ' + n + ' acties, de grootste kortingen per afdeling. Elke ochtend bijgewerkt.';
  const others = storePages.filter(o => o !== st).map(o => '<a href="' + storePage(o) + '">' + esc(o.c) + '</a>').join(' · ');
  return '<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#0E6278">\n' +
    '<title>' + name + ' aanbiedingen deze week | Bespaar op je boodschap</title>\n<meta name="description" content="' + esc(desc) + '">\n' +
    '<link rel="canonical" href="' + SITE + file + '">\n<meta property="og:type" content="website">\n<meta property="og:locale" content="nl_NL">\n<meta property="og:site_name" content="Bespaar op je boodschap">\n' +
    '<meta property="og:title" content="' + name + ' aanbiedingen van deze week">\n<meta property="og:description" content="' + esc(desc) + '">\n<meta property="og:url" content="' + SITE + file + '">\n<meta property="og:image" content="' + SITE + 'icon.png">\n<link rel="icon" href="icon.png">\n' +
    '<script type="application/ld+json">' + JSON.stringify({'@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      {'@type': 'ListItem', position: 1, name: 'Home', item: SITE},
      {'@type': 'ListItem', position: 2, name: 'Supermarkt aanbiedingen', item: SITE + 'supermarkt-aanbiedingen.html'},
      {'@type': 'ListItem', position: 3, name: String(st.c).replace(/[{}<>&"]/g, '') + ' aanbiedingen', item: SITE + file}]}).replace(/</g, '\\u003c') + '</script>\n' +
    PARTS['{{STIJL}}'] + '\n</head>\n<body>\n' + PARTS['{{KOP}}'] + '\n<header class="hero">\n  <p class="crumbs"><a href="./">Home</a> › <a href="supermarkt-aanbiedingen.html">Aanbiedingen</a> › ' + name + '</p>\n' +
    '  <h1>' + name + ' aanbiedingen van deze week</h1>\n  <p>' + n.toLocaleString('nl-NL') + ' acties bij ' + name + ', bijgewerkt op ' + esc(DATUM) + '. Met de grootste kortingen en alles per afdeling.</p>\n' +
    '  <div class="btns"><a class="big" href="app.html">Vergelijk met andere supermarkten</a></div>\n</header>\n<main>\n' +
    (best.length ? '<section class="card" aria-labelledby="top"><h2 id="top">Grootste kortingen bij ' + name + '</h2><ul class="deals">' + best.map(dealLi).join('') + '</ul></section>\n' : '') +
    '<section class="card" aria-labelledby="afd"><h2 id="afd">Alle ' + name + ' acties per afdeling</h2><p class="small">Per afdeling de acties met de meeste korting. Alle ' + n + ' acties zoek je in de app.</p>' + cats +
    '<a class="cta" href="app.html">Zoek in alle ' + name + ' aanbiedingen</a></section>\n' +
    '<section class="card" aria-labelledby="reg"><h2 id="reg">Is ' + name + ' goedkoop?</h2><p>' + regText + '</p>' +
    '<p>Een aanbieding is niet altijd de goedkoopste keuze: hetzelfde product kan bij een andere supermarkt zonder actie goedkoper zijn. Zet je boodschappen in de app en zie per supermarkt wat je hele lijstje kost.</p></section>\n' +
    '<section class="card" aria-labelledby="andere"><h2 id="andere">Aanbiedingen van andere supermarkten</h2><p>' + others + '</p>' +
    '<p class="small">De acties komen van PrijsProfeet en worden elke ochtend bijgewerkt. Kortingen van 70% of meer laten we weg, omdat dat vrijwel altijd een fout in de bron is. Controleer de prijs altijd in de folder of bij ' + name + '. Bespaar op je boodschap heeft geen band met ' + name + '.</p></section>\n' +
    '</main>\n' + PARTS['{{VOET}}'] + '\n</body>\n</html>\n';
}
function storeLinks(){
  return '<p>' + storePages.map(st => '<a href="' + storePage(st) + '">' + esc(st.c) + ' aanbiedingen</a>').join(' · ') + '</p>';
}

/* welke winkels doen mee, en met wat: zo weet een bezoeker meteen wat hij kan verwachten */
function storesSection(){
  const rows = data.stores.map(st => {
    let n = 0; for (let j = 0; j < st.n.length - st.r; j++) if (C.promoActive(st, j)) n++;
    const reg = !st.r ? 'alleen aanbiedingen' : C.regFresh(st) ? 'gewone prijzen en aanbiedingen' : 'aanbiedingen (gewone prijzen nog niet actueel)';
    const label = storePages.includes(st) ? '<a href="' + storePage(st) + '">' + esc(st.c) + '</a>' : esc(st.c);
    return '<tr><th scope="row">' + label + '</th><td>' + reg + '</td><td>' + n.toLocaleString('nl-NL') + '</td></tr>';
  });
  return '<div class="tablewrap"><table><caption>Stand van ' + esc(DATUM) + '</caption><thead><tr><th scope="col">Supermarkt</th><th scope="col">Wat we vergelijken</th><th scope="col">Lopende acties</th></tr></thead><tbody>' +
    rows.join('') + '</tbody></table></div>';
}

/* ---------- acties van deze week: aantallen per winkel en de grootste kortingen ---------- */
function dealsSection(){
  const per = [], top = [];
  data.stores.forEach((st, s) => {
    let n = 0;
    for (let j = 0; j < st.n.length - st.r; j++){
      if (!C.promoActive(st, j)) continue;
      n++;
      const i = st.r + j, now = st.p[i], was = st.po[j], multi = st.pm[j] > 1 ? st.pl[j] || 'meerdere stuks' : '';
      if (was > now && now >= 50){
        const pct = Math.round(100 * (1 - now / was));
        if (pct >= 25 && pct < 70) top.push({s, name: st.n[i], now, was, pct, until: st.pv[j], multi});
      }
    }
    if (n) per.push([st.c, n]);
  });
  per.sort((a, b) => b[1] - a[1]);
  top.sort((a, b) => b.pct - a.pct || a.now - b.now);
  const seen = new Set(), pick = [];
  for (const d of top){ const key = d.name.toLowerCase(); if (seen.has(key) || pick.filter(x => x.s === d.s).length >= 3) continue; seen.add(key); pick.push(d); if (pick.length >= 15) break; }
  const total = per.reduce((a, x) => a + x[1], 0);
  const until = v => { const d = v ? C.mmddToDate(v) : null; return d ? ' t/m ' + new Intl.DateTimeFormat('nl-NL', {day: 'numeric', month: 'short'}).format(d) : ''; };
  return '<p class="lead">Op ' + esc(DATUM) + ' liepen er <strong>' + total.toLocaleString('nl-NL') + ' aanbiedingen</strong> bij ' + per.length + ' supermarkten.</p>' +
    '<div class="tablewrap"><table class="rank"><caption>Aantal lopende aanbiedingen per supermarkt</caption><thead><tr><th scope="col">Supermarkt</th><th scope="col">Aanbiedingen</th></tr></thead><tbody>' +
    per.map(([c, n]) => '<tr><th scope="row">' + esc(c) + '</th><td>' + n.toLocaleString('nl-NL') + '</td></tr>').join('') + '</tbody></table></div>' +
    '<h3>Grote kortingen van deze week</h3><ul class="deals">' + pick.map(d => '<li><span class="pct">−' + d.pct + '%</span> <strong>' + esc(d.name) + '</strong> bij ' + esc(data.stores[d.s].c) +
      ': ' + euro(d.now) + ' <s>' + euro(d.was) + '</s>' + (d.multi ? ' per stuk bij ' + esc(d.multi) : '') + esc(until(d.until)) + '</li>').join('') + '</ul>' +
    '<p class="small">De van-prijs en de korting zijn zoals de supermarkt of onze bron ze noemt; wij controleren niet of die prijs eerder echt gold. Kortingen boven 70% laten we weg: dat is vrijwel altijd een fout in de bron. Controleer de prijs altijd in de folder of bij de winkel.</p>';
}

/* ---------- pagina's schrijven ---------- */
fs.mkdirSync(outDir, {recursive: true});
const gen = {mandje: basketSection, mandjekort: basketShort, winkels: storesSection, acties: dealsSection, winkellinks: storeLinks};
/* gedeelde stukken: site/_stijl.css, _kop.html, _voet.html (worden zelf niet gepubliceerd) */
const part = f => fs.existsSync(path.join(srcDir, f)) ? fs.readFileSync(path.join(srcDir, f), 'utf8').trim() : '';
const PARTS = {'{{STIJL}}': '<style>\n' + part('_stijl.css') + '\n</style>', '{{KOP}}': part('_kop.html'), '{{VOET}}': part('_voet.html')};
const pages = [];
for (const f of fs.readdirSync(srcDir)){
  const src = path.join(srcDir, f);
  if (f.startsWith('_')) continue;
  if (f.endsWith('.html')){
    let h = fs.readFileSync(src, 'utf8');
    for (const [k, v] of Object.entries(PARTS)) h = h.split(k).join(v);
    /* in het menu de huidige pagina aanwijzen */
    h = h.replace('<a href="' + f + '">', '<a href="' + f + '" aria-current="page">');
    /* eerst het sjabloon invullen en controleren, pas daarna de prijsdata invoegen: een productnaam met {{...}} mag de build niet stoppen */
    h = h.split('{{SITE}}').join(SITE).split('{{DATUM}}').join(esc(DATUM)).split('{{JAAR}}').join(String(NOW.getFullYear()));
    if (/\{\{[A-Z]+\}\}/.test(h)) throw new Error(f + ': onbekende {{...}} over');
    h = h.replace(/<!--GEN:(\w+)-->/g, (all, k) => gen[k] ? gen[k]() : all);
    fs.writeFileSync(path.join(outDir, f), h);
    if (!/<meta name="robots" content="noindex/.test(h)) pages.push(f);
  } else if (f !== 'sitemap.xml' && f !== 'robots.txt') fs.copyFileSync(src, path.join(outDir, f));
}
/* een pagina per supermarkt (na het mandje, zodat de plaats in het mandje bekend is) */
basketSection();
storePages.forEach(st => {
  const f = storePage(st);
  fs.writeFileSync(path.join(outDir, f), storePageHtml(st, data.stores.indexOf(st)));
  pages.push(f);
});
/* de app zelf (gemaakt door web/assemble.py): vaste link en deelgegevens erbij, één keer */
const appFile = path.join(outDir, 'app.html');
if (fs.existsSync(appFile)){
  let a = fs.readFileSync(appFile, 'utf8');
  if (!a.includes('rel="canonical"')){
    a = a.replace('</head>', '<link rel="canonical" href="' + SITE + 'app.html">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Bespaar op je boodschap">\n' +
      '<meta property="og:title" content="Vergelijk je boodschappenlijst bij alle supermarkten">\n<meta property="og:url" content="' + SITE + 'app.html">\n<meta property="og:image" content="' + SITE + 'icon.png">\n</head>');
    a = a.replace(/<title>[^<]*<\/title>/, '<title>Boodschappenlijst vergelijken | Bespaar op je boodschap</title>');
    fs.writeFileSync(appFile, a);
  }
}
const today = NOW.toISOString().slice(0, 10);
const prio = f => f === 'index.html' ? '1.0' : /^aanbiedingen-/.test(f) ? '0.7' : /goedkoopste|vergelijken|aanbiedingen|besparen/.test(f) ? '0.8' : '0.4';
const urls = pages.concat(['app.html']).map(f => '  <url><loc>' + SITE + (f === 'index.html' ? '' : f) + '</loc><lastmod>' + today + '</lastmod><priority>' + prio(f) + '</priority></url>');
fs.writeFileSync(path.join(outDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n');
/* robots.txt werkt alleen in de hoofdmap van een domein; met een eigen domein wordt dit bestand gebruikt */
fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + 'sitemap.xml\n');
console.error('seo: ' + pages.length + ' pagina\'s, sitemap en robots.txt geschreven voor ' + SITE);
