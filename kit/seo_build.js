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
const ctx = {NOW, STORES: data.stores, STALE_DAYS: 92, S: {oldReg: false}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'web', 'engine.js'), 'utf8') + '\n' +
  ['mmddToDate', 'promoActive', 'regFresh', 'keep'].map(grab).join('\n') +
  '\nObject.assign(globalThis, {Engine, priceMatrix, storeTotals, sortStoreTotals, plan, priced, comparable, regFresh, keep, promoActive, mmddToDate});', ctx);
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
  ['jong belegen kaas 48+ 500 g', /jong belegen/, /geraspt|blokjes|plakken|smeer|light|[23]0\+|35\+|biologisch|bio |geit|schaap|komijn|kruiden|pesto|truffel|mosterd|brandnetel|peper|knoflook/],
  ['elstar appels 1 kg', /elstar/, /sap|moes|taart|chips|gedroogd|bio/],
  ['aardappelen 2 kg', /aardappel/, /friet|patat|kriel|puree|chips|schijf|partjes|rosti|kroket|gekookt|zoete|krieltjes|wedges|gratin|salade|bio/],
  ['spaghetti 500 g', /spaghetti/, /saus|maaltijd|volkoren|glutenvrij|bolognese|pesto|verse|vers |bio/],
  ['witte rijst 1 kg', /rijst/, /zilvervlies|wafel|pap|maaltijd|bruin|risotto|sushi|noedel|melk|dessert|cracker|basmati|pandan|jasmijn|wild|kook in|zak|bio/],
  ['pindakaas 350 g', /pindakaas/, /reep|koek|saus|chocola|cup|light|honing|kokos|biologisch|bio /],
  ['filterkoffie 500 g', /filter/, /pads|cups|bonen|oplos|capsule|decaf|cafeïnevrij|cafeinevrij|zakjes|papier/],
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
const OWN = new Set(['dirk', 'dekamarkt', 'hoogvliet']);
let BASKETMEMO = null;
function basketSection(){ return BASKETMEMO || (BASKETMEMO = basketCalc()); }
function basketCalc(){
  /* De app toont gewone prijzen tot 92 dagen oud (met waarschuwing). Een openbare uitspraak "X is het goedkoopst" vraagt
     meer: alleen winkels waarvan de gewone prijzen in de laatste BASKET_DAYS dagen zijn bijgewerkt doen mee. */
  const recent = st => st.r > 0 && C.regFresh(st) && st.f && (NOW - new Date(st.f + 'T12:00:00')) / 864e5 <= BASKET_DAYS;
  const fresh = data.stores.map((st, s) => s).filter(s => recent(data.stores[s]));
  const stale = data.stores.filter(st => st.r > 0 && !recent(st)).map(st => st.c + (st.f ? ' (gewone prijzen laatst bijgewerkt op ' + dayFmt.format(new Date(st.f + 'T12:00:00')) + ')' : ''));
  const noReg = data.stores.filter(st => !st.r).map(st => st.c);
  const items = BASKET.map(([q, req, not], i) => ({id: i + 1, q, qty: 1, req, not}));
  const an = {}; items.forEach(it => { an[it.id] = eng.analyze(it.q, 80); });
  /* eerlijk vergelijken: omrekenen naar precies de gevraagde hoeveelheid (per kilo, liter of stuk), zodat een pak van 20
     eieren niet duurder lijkt dan een doos van 12. Zonder bruikbare hoeveelheid telt de cel niet mee. */
  /* Per winkel het goedkoopste product onder alle goed passende producten (niet alleen de allerbeste naamovereenkomst),
     zodat huismerk tegen huismerk wordt vergeleken en niet het A-merk van de ene winkel tegen het huismerk van de andere. */
  const FIT = 3;   /* ruim: de vaste regels per product (req/not) houden verkeerde producten buiten */
  const unitCost = (c, a) => {
    /* het mandje vraagt één stuk: een "2 voor"-actie telt niet mee, net als in de app bij aantal 1 */
    const each = c.price;
    if (!a.kind || a.inferred) return {price: Math.round(each), c};                     /* geen hoeveelheid gevraagd: één verpakking */
    if (c.u !== a.kind || !c.q || !(c.mode === 'exact' || c.mode === 'scaled')) return null;
    return {price: Math.round(each / c.q * a.amount), c, scaled: Math.abs(c.q - a.amount) > 0.01};
  };
  const m = items.map(it => {
    const a = an[it.id];
    return fresh.map(s => {
      const e = a && a.per[s]; if (!e || !e.cands.length) return null;
      const real = e.cands.filter(c => { const n = c.name.toLowerCase(); return !c.other && c.price > 0 && it.req.test(n) && !it.not.test(n) && !/baby|peuter|kinder/.test(n); });
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
  /* Veel duurder of goedkoper dan elders voor dezelfde hoeveelheid: vrijwel altijd een ander product of een verkeerd gelezen
     verpakking. Met drie of meer winkels valt alleen die ene prijs af (meer dan 2x van de middelste prijs); met twee winkels
     is niet te zeggen welke van de twee afwijkt, dan telt de hele regel niet mee. */
  m.forEach((row, i) => {
    const ps = row.filter(Boolean).map(x => x.price).sort((a, b) => a - b);
    if (ps.length >= 3){
      const mid = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
      m[i] = row.map(x => {
        if (x && (x.price > 2 * mid || x.price * 2 < mid)){ if (process.env.SEO_DEBUG) console.error('uitschieter', items[i].q, x.c.name, x.price, 'midden', mid); return null; }
        return x;
      });
    } else if (ps.length === 2 && ps[1] > 3 * ps[0]){
      if (process.env.SEO_DEBUG) console.error('uitschieter', items[i].q, row.map(x => x ? x.c.name + ' ' + x.price : '-').join(' | '));
      m[i] = row.map(() => null);
    }
  });
  const totals = C.sortStoreTotals(C.storeTotals(m, fresh));
  if (process.env.SEO_DEBUG) totals.forEach(t => console.error('mandje', data.stores[t.store].c, t.count + '/' + m.length, 'mist:', t.missing.map(i => items[i].q).join(', ')));
  const rows = items.length, minCount = Math.ceil(rows * 0.8);
  const ranked = totals.filter(t => t.count >= minCount);
  const few = totals.filter(t => t.count < minCount);
  if (!ranked.length) return '<p>Vandaag zijn er te weinig actuele gewone prijzen om een eerlijk mandje te vergelijken.</p>';

  /* zelfde aantal producten: alleen die totalen zijn echt naast elkaar te zetten */
  const common = m.map((row, i) => ranked.every(t => C.priced(row[fresh.indexOf(t.store)])) ? i : -1).filter(i => i >= 0);
  const sumCommon = t => common.reduce((a, i) => a + m[i][fresh.indexOf(t.store)].price, 0);
  const byCommon = ranked.slice().sort((a, b) => sumCommon(a) - sumCommon(b));
  const cheapest = byCommon[0], dearest = byCommon[byCommon.length - 1];

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
      return '<tr><th scope="row">' + esc(items[i].q) + '</th>' + cells.map(x => '<td' + (x.price === low ? ' class="low"' : '') + ' title="' + esc(x.c.name) + '">' +
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
/* welke winkels doen mee, en met wat: zo weet een bezoeker meteen wat hij kan verwachten */
function storesSection(){
  const rows = data.stores.map(st => {
    let n = 0; for (let j = 0; j < st.n.length - st.r; j++) if (C.promoActive(st, j)) n++;
    const reg = !st.r ? 'alleen aanbiedingen' : C.regFresh(st) ? 'gewone prijzen en aanbiedingen' : 'aanbiedingen (gewone prijzen nog niet actueel)';
    return '<tr><th scope="row">' + esc(st.c) + '</th><td>' + reg + '</td><td>' + n.toLocaleString('nl-NL') + '</td></tr>';
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
      const i = st.r + j, now = st.p[i], was = st.po[j];
      if (was > now && now >= 50){
        const pct = Math.round(100 * (1 - now / was));
        if (pct >= 25 && pct < 70) top.push({s, name: st.n[i], now, was, pct, until: st.pv[j]});
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
      ': ' + euro(d.now) + ' <s>' + euro(d.was) + '</s>' + esc(until(d.until)) + '</li>').join('') + '</ul>' +
    '<p class="small">De van-prijs en de korting zijn zoals de supermarkt of onze bron ze noemt; wij controleren niet of die prijs eerder echt gold. Kortingen boven 70% laten we weg: dat is vrijwel altijd een fout in de bron. Controleer de prijs altijd in de folder of bij de winkel.</p>';
}

/* ---------- pagina's schrijven ---------- */
fs.mkdirSync(outDir, {recursive: true});
const gen = {mandje: basketSection, mandjekort: basketShort, winkels: storesSection, acties: dealsSection};
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
const prio = f => f === 'index.html' ? '1.0' : /goedkoopste|vergelijken|aanbiedingen|besparen/.test(f) ? '0.8' : '0.4';
const urls = pages.concat(['app.html']).map(f => '  <url><loc>' + SITE + (f === 'index.html' ? '' : f) + '</loc><lastmod>' + today + '</lastmod><priority>' + prio(f) + '</priority></url>');
fs.writeFileSync(path.join(outDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n');
/* robots.txt werkt alleen in de hoofdmap van een domein; met een eigen domein wordt dit bestand gebruikt */
fs.writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + 'sitemap.xml\n');
console.error('seo: ' + pages.length + ' pagina\'s, sitemap en robots.txt geschreven voor ' + SITE);
