/* ENGINE: zoeken en combineren, geen DOM nodig */
/* opzoeken met tekst van de gebruiker: zonder prototype vindt constructor, toString of __proto__ niets */
const dict = o => Object.assign(Object.create(null), o);
const UNIT = dict({kg:['g',1000],kilo:['g',1000],kilogram:['g',1000],g:['g',1],gr:['g',1],gram:['g',1],
  l:['m',1000],lt:['m',1000],liter:['m',1000],ml:['m',1],cl:['m',10],dl:['m',100],
  st:['s',1],stuks:['s',1],stuk:['s',1]});
const KIND = {g:1,m:2,s:3};
const KIND_LABEL = {1:'g',2:'ml',3:'st'};
const UNITWORDS = new Set(['g','gr','gram','kg','kilo','ml','cl','dl','l','liter','stuks','stuk','st','per','x','pak','pakje','fles','blik','doos','zak','tray']);
const PENALTY = new Set(['gesuikerde','gedroogde','gedroogd','gekonfijte','gepofte','snoep','chips','reep','koek','koekjes','ijs','siroop','yoghurtdrank','saus','mix','choco','chocolade','maaltijd','pizza','snack','smaak','drink','shake','vla','cholesterol','lactosevrij','glutenvrij','bio','biologisch','vegan','vegetarisch','light','zero','kant','klaar']);
const HOUSE = new Set(['ah','jumbo','plus','dirk','deka','dekamarkt','dekavers','hoogvliet','spar','lidl','poiesz','vomar','woon','beste','de','zuivelmeester','melkan','budget','huismerk','pcd','kwetters','vleeschmeesters','daily','chef','basic','bakkershart','soma','van','den']);
const STOP = new Set(['van','de','het','een','met','en','of','voor']);
/* deze woorden verbeteren we nooit als tikfout: zonder is geen wonder */
const NOFIX = new Set([...STOP, 'zonder','geen','extra','per','ook','in','op','bij']);
const MAXWORDS = 6, MAXQUERY = 80;   /* langere zoekopdrachten kosten alleen tijd */
/* samenstellingen die wél hetzelfde product zijn: roomboter = boter, scharreleieren = eieren */
const GOODPRE = ['room','ijsberg','mineraal','bron','krop','vloer','scharrel','vrijeuitloop','biologische','zilvervlies','volkoren','tarwe','meergranen','spelt','waldkorn','kristal','riet','basmati','jasmijn','pandan','filter','snel','hand','stoof','kruimig','vast','runder','varkens','kalkoen','kippen','braad','was','vaat','toilet','keuken','cherry','tros','vlees','roma','trostomaat','snoep','mini','grote','groene','rode','gele','witte','zoete','vers','verse','halfvolle','volle','magere','griekse','turkse','boeren'];
/* korte, algemene woorden: zoek eerst naar het gangbare product */
const GENERIC = dict({
  'melk':'halfvolle melk','kaas':'jong belegen kaas','brood':'volkoren brood','eieren':'scharreleieren','eiren':'scharreleieren','eitjes':'scharreleieren',
  'boter':'roomboter ongezouten','wc papier':'toiletpapier','wcpapier':'toiletpapier','wc-papier':'toiletpapier','closetpapier':'toiletpapier','wcrol':'toiletpapier',
  'pasta':'spaghetti','macaroni':'macaroni','suiker':'kristalsuiker','koffie':'filterkoffie','thee':'zwarte thee','yoghurt':'magere yoghurt','yogurt':'magere yoghurt',
  'rijst':'zilvervliesrijst','gehakt':'half om half gehakt','chips':'chips naturel','hagelslag':'hagelslag melk','aardappels':'aardappelen','piepers':'aardappelen',
  'cola':'coca cola','bier':'pils','pils':'pils','frisdrank':'cola','sap':'sinaasappelsap','jus':'sinaasappelsap','water':'mineraalwater','olie':'zonnebloemolie',
  'appels':'appels jonagold','appel':'appels jonagold','peren':'handperen','sla':'ijsbergsla','wasmiddel':'wasmiddel','vla':'vanillevla','kwark':'magere kwark',
  'worst':'rookworst','diepvriespizza':'pizza','kippendijen':'kipdijfilet','kipdijen':'kipdijfilet',
  'keukenpapier':'keukenrol','vuilniszak':'vuilniszakken','deo':'deodorant','pindas':'pinda','nootjes':'notenmix','toetje':'vla','slagroom':'slagroom','beleg':'jonge kaas plakken','ham':'beenham','bloem':'tarwebloem','meel':'tarwebloem','zout':'keukenzout',
  'koekjes':'biscuit','koek':'ontbijtkoek','tomaat':'tomaten','ui':'uien','paprika':'paprika rood','wortels':'winterpeen','wortelen':'winterpeen','peen':'winterpeen',
  'kip':'kipfilet','vis':'zalmfilet','zalm':'zalmfilet','pindakaas':'pindakaas','jam':'aardbeienjam','mayo':'mayonaise','ketchup':'tomatenketchup',
  'shampoo':'shampoo','tandpasta':'tandpasta','luiers':'luiers','afwasblokjes':'vaatwastabletten','vaatwastabletten':'vaatwastabletten'
});
const genericFor = q => GENERIC[String(q).toLowerCase().trim().replace(/\s+/g, ' ')];

function norm(s){
  return ' ' + String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim() + ' ';
}

function parseQuery(q){
  const low = String(q).slice(0, MAXQUERY).toLowerCase().replace(',', '.');
  const re = /(\d+(?:\.\d+)?)\s*(kilogram|kilo|kg|gram|gr|g|liter|lt|ml|cl|dl|l|stuks|stuk|st)\b/;
  const m = low.match(re);
  let kind = 0, amount = 0, rest = low;
  if (m) {
    const [k, f] = UNIT[m[2]];
    kind = KIND[k]; amount = parseFloat(m[1]) * f;
    rest = low.replace(m[0], ' ');
  }
  const tokens = norm(rest).trim().split(' ').filter(t => t && !STOP.has(t)).slice(0, MAXWORDS);
  return {tokens, kind, amount};
}

function fmtQty(kind, q){
  if (!kind || !q) return '';
  if (kind === 1) return q >= 1000 ? (q/1000).toLocaleString('nl-NL') + ' kg' : q + ' g';
  if (kind === 2) return q >= 1000 ? (q/1000).toLocaleString('nl-NL') + ' l' : q + ' ml';
  return q + ' st';
}

class Engine {
  constructor(stores){
    this.stores = stores;
    this.norms = stores.map(s => s.n.map(norm));
    this.skip = stores.map(s => new Uint8Array(s.n.length));
  }
  /* keep(s, i) bepaalt welke regels meedoen (verlopen acties, oude gewone prijzen) */
  setMask(keep){
    this.stores.forEach((st, s) => { const m = this.skip[s]; for (let i = 0; i < m.length; i++) m[i] = keep(s, i) ? 0 : 1; });
  }
  /* alle producten in winkel s waarvan elk zoekwoord voorkomt; beste match-niveau wint */
  matchStore(s, tokens){
    if (!tokens.length) return [];
    const N = this.norms[s], K = this.skip[s], P = this.stores[s].p, tiers = [[],[],[]];
    for (let i = 0; i < N.length; i++){
      if (K[i] || !(P[i] > 0)) continue;   /* zonder geldige prijs doet een regel niet mee */
      const n = N[i]; let worst = 0;
      for (let t = 0; t < tokens.length; t++){
        const w = tokens[t];
        let lvl;
        if (n.includes(' ' + w + ' ')) lvl = 1;
        else if (n.includes(' ' + w)) lvl = 2;
        else if (w.length >= 4 && n.includes(w)) lvl = 3;
        else { worst = 0; break; }
        if (lvl > worst) worst = lvl;
      }
      if (worst) tiers[worst-1].push(i);
    }
    return [].concat(...tiers.map((arr, t) => arr.map(i => ({i, tier: t}))));
  }
  analyze(query, limit){
    const g = genericFor(query);
    if (g && g !== String(query).toLowerCase().trim()){
      /* "melk" -> eerst halfvolle melk; winkels zonder treffer vallen terug op het gewone zoekwoord */
      const a = this._analyze(g, limit, true), b = this._analyze(query, limit, true);
      a.per = a.per.map((e, s) => e || b.per[s]); a.query = query;
      return a;
    }
    return this._analyze(query, limit);
  }
  /* known: het zoekwoord is zeker een soort product en geen merk */
  _analyze(query, limit, known){
    const p = parseQuery(query);
    const qset = new Set(p.tokens), asked = new Set(p.tokens.map(stemNL));
    const joined = ' ' + p.tokens.join(' ') + ' ';
    /* 1. relevantie: hoe weinig extra woorden heeft de productnaam */
    const scoredAll = this.stores.map((st, s) => {
      const N = this.norms[s];
      return this.matchStore(s, p.tokens).map(({i, tier}) => {
        const words = N[i].trim().split(' ').filter(w => w.length > 1 && !/^\d/.test(w) && !UNITWORDS.has(w));
        let extra = 0, other = false, pen = 0;
        for (const w of words){
          let c = null;
          for (const t of qset){
            if (w === t){ c = 0; break; }
            if (w.endsWith(t) && w.length > t.length){
              const pre = w.slice(0, w.length - t.length);
              const v = GOODPRE.includes(pre) ? 0.4 : 1.6;               /* roomboter = boter, maar karnemelk is geen melk */
              c = c === null ? v : Math.min(c, v);
            }
          }
          if (c === null){
            let related = false;
            for (const t of qset){ if (w.includes(t)) { related = true; break; } }
            /* ravioli met kaas is geen kaas, boterhamworst geen boter */
            c = related ? 3 : (PENALTY.has(w) ? 4 : (HOUSE.has(w) ? 0 : 1));
            if (otherType(w, asked)){ pen += 4 - c; c = 4; other = true; }
          }
          extra += c;
        }
        if (p.tokens.length > 1 && !N[i].includes(joined)) extra += 2;
        return {i, score: extra, other, pen};
      });
    });
    /* nergens het kale product (ariel, optimel, dove): dan is het zoekwoord een merk en hoort wasmiddel of yoghurt
       gewoon bij wat je zoekt. De soortwoorden kosten dan niets extra, zodat merkproducten niet wegzakken */
    if (!known && !scoredAll.some(l => l.some(x => !x.other && x.score <= 0.5)))
      scoredAll.forEach(l => l.forEach(x => { x.score -= x.pen; x.other = false; }));
    let kind = p.kind, amount = p.amount, inferred = false;
    if (!kind){
      /* geen formaat opgegeven: neem het gangbare formaat van de best passende producten */
      let gmin = Infinity;
      scoredAll.forEach(l => l.forEach(x => { if (x.score < gmin) gmin = x.score; }));
      const counts = {1:0,2:0,3:0}, bag = [];
      scoredAll.forEach((l, s) => l.forEach(x => {
        if (x.score > gmin + 1) return;
        const u = this.stores[s].u[x.i]; if (u){ counts[u]++; bag.push([u, this.stores[s].q[x.i]]); }
      }));
      const dom = +Object.keys(counts).sort((a,b) => counts[b]-counts[a])[0];
      if (counts[dom] > 0){
        const qs = bag.filter(b => b[0] === dom).map(b => b[1]).sort((a,b) => a-b);
        kind = dom; amount = qs[Math.floor(qs.length/2)]; inferred = true;
      }
    }
    const tol = inferred ? 0.3 : 0.12;
    const GR = {exact:0, scaled:1, unknown:2, other:3};
    const per = scoredAll.map((scored, s) => {
      if (!scored.length) return null;
      const st = this.stores[s];
      const min = Math.min(...scored.map(x => x.score));
      /* 2. formaat: rekent af naar gewenste hoeveelheid waar dat kan */
      const make = x => {
        const i = x.i, u = st.u[i], q = st.q[i], price = st.p[i];
        let eff = price, mode = 'other', r = 1;
        if (!kind) mode = 'exact';
        else if (u === kind && q > 0){
          if (Math.abs(q - amount) / amount <= tol) mode = 'exact';
          else { const rr = amount / q; if (rr >= 0.25 && rr <= 10){ r = rr; mode = 'scaled'; eff = price * packsFor(1, r); } }
        } else if (u === 0) mode = 'unknown';
        /* je koopt hele pakken: kleiner pak = meer pakken, groter pak = je betaalt het hele pak */
        const c = {i, name: st.n[i], price, eff, r, q, u, mode, score: x.score, other: x.other, usual: 0, mbq: 0, mbp: 0, label: '', until: ''};
        if (i >= st.r){
          const j = i - st.r;
          c.usual = st.po[j]; c.mbq = st.pm[j]; c.mbp = st.pp[j]; c.label = st.pl[j]; c.until = st.pv[j];
        }
        return c;
      };
      const all = scored.map(make);
      const band = all.filter(c => c.score <= min + 0.5).sort((a,b) => GR[a.mode]-GR[b.mode] || a.eff-b.eff || a.name.length-b.name.length);
      const rest = all.filter(c => c.score > min + 0.5).sort((a,b) => a.score-b.score || a.eff-b.eff);
      const cands = band.concat(rest).slice(0, limit || 15);
      return {cands, mode: cands[0].mode};
    });
    return {query, kind, amount, inferred, per};
  }
  /* het gewone assortiment: producten zonder actie, per naam zonder merk en formaat; wat setMask uitzet doet niet mee */
  assortment(){
    const steps = this.assortSteps(); let r = steps.next();
    while (!r.done) r = steps.next();
    return r.value;
  }
  /* dezelfde lijst in stukjes: de pagina kan hem bouwen terwijl er niets te doen is */
  *assortSteps(){
    const map = new Map();
    for (let s = 0; s < this.stores.length; s++){
      const st = this.stores[s];
      for (let i = 0; i < st.r; i++){
        if (i % 500 === 499) yield;
        if (this.skip[s][i] || !(st.p[i] > 0)) continue;
        const base = cleanName(st.n[i]); if (!base) continue;
        let g = map.get(base);
        if (!g){ g = {reg: true, base, name: base[0].toUpperCase() + base.slice(1), cat: '', rows: []}; map.set(base, g); }
        g.rows.push([s, i]);
      }
    }
    return [...map.values()];
  }
  /* wat groep g kost in de winkels on (Set): het gangbare formaat en daarvan de laagste prijs; null als het daar niet te koop is */
  assortOffer(g, on){
    const rows = g.rows.filter(r => on.has(r[0]));
    if (!rows.length) return null;
    const sizeOf = ([s, i]) => { const st = this.stores[s]; return st.u[i] && st.q[i] ? fmtQty(st.u[i], st.q[i]) : ''; };
    const sizes = new Map();
    rows.forEach(r => { const k = sizeOf(r); if (k) sizes.set(k, (sizes.get(k) || 0) + 1); });
    const size = sizes.size ? [...sizes.entries()].sort((x, y) => y[1] - x[1])[0][0] : '';
    let best = null;
    rows.forEach(r => { if (size && sizeOf(r) !== size) return; if (!best || this.stores[r[0]].p[r[1]] < this.stores[best[0]].p[best[1]]) best = r; });
    return {s: best[0], i: best[1], price: this.stores[best[0]].p[best[1]], size, q: g.base + (size ? ' ' + size : ''), sold: rows};
  }
  /* suggesties tijdens typen: precieze zoektermen die in meerdere winkels voorkomen */
  suggest(text, storeIdxs, limit){
    const p = parseQuery(text);
    if (!p.tokens.length || p.tokens.join('').length < 3) return [];
    const a = this._analyze(text, 80);
    const gq = genericFor(text);
    if (gq && gq !== String(text).toLowerCase().trim()){
      /* algemeen woord: het gangbare product bovenaan, daarna de andere soorten */
      const ga = this._analyze(gq, 30);
      a.per = a.per.map((e, s) => !ga.per[s] ? e : !e ? ga.per[s] : {cands: ga.per[s].cands.concat(e.cands), mode: ga.per[s].mode});
    }
    const groups = new Map();
    storeIdxs.forEach(s => {
      const e = a.per[s]; if (!e) return;
      e.cands.forEach(c => {
        const base = cleanName(c.name);
        if (!base) return;
        let g = groups.get(base);
        if (!g){
          const bw = base.split(' ');
          const tier = p.tokens.every(t => bw.includes(t)) ? 2 : (p.tokens.every(t => bw.some(w => w === t || w.endsWith(t))) ? 1 : 0);
          g = {base, stores: new Set(), sizes: new Map(), min: Infinity, minStore: s, words: bw.length, tier, refs: []};
          groups.set(base, g);
        }
        g.stores.add(s);
        if (g.refs.length < 6) g.refs.push([s, c.i]);   /* producten om een fototje van te tonen */
        if (c.u && c.q){ const k = fmtQty(c.u, c.q); g.sizes.set(k, (g.sizes.get(k) || 0) + 1); }
        if (c.price < g.min){ g.min = c.price; g.minStore = s; }
      });
    });
    const out = [...groups.values()].map(g => {
      let size = '';
      if (p.kind) size = fmtQty(p.kind, p.amount);
      else if (g.sizes.size){ size = [...g.sizes.entries()].sort((x, y) => y[1] - x[1])[0][0]; }
      g.q = g.base + (size ? ' ' + size : '');
      const last = g.base.split(' ').pop();
      const head = p.tokens.some(t => last === t || (last.endsWith(t) && GOODPRE.includes(last.slice(0, last.length - t.length))));
      const bad = p.tokens.some(t => g.base.split(' ').some(w => w !== t && ((w.endsWith(t) && !GOODPRE.includes(w.slice(0, w.length - t.length))) || w.startsWith(t))));
      g.gen = !!gq && gq.split(' ').every(w => g.base.split(' ').some(b => b === w || b.endsWith(w)));
      g.rank = Math.min(g.stores.size, 6) + g.tier * 1.5 - 0.6 * (g.words - 1) + (head ? 2.5 : 0) - (bad && !head ? 2 : 0);
      return g;
    });
    out.sort((x, y) => y.rank - x.rank || x.min - y.min);
    if (!gq) return out.slice(0, limit);
    /* bij een algemeen woord: eerst een paar keer het gangbare product, dan de andere soorten */
    const gen = out.filter(g => g.gen), rest = out.filter(g => !g.gen);
    const head = gen.slice(0, Math.min(3, limit));
    return head.concat(rest, gen.slice(head.length)).slice(0, limit);
  }
}

/* ---------- zoeken in de aanbiedingen ---------- */
/* grondvorm: banaan en bananen, appel en appels, koek en koekjes zijn hetzelfde woord */
const IRREGULAR = dict({eieren:'ei', eitjes:'ei', uien:'ui', uitje:'ui', uitjes:'ui', kazen:'kaas', kaasje:'kaas'});
function stemNL(w){
  if (IRREGULAR[w]) return IRREGULAR[w];
  let s = w;
  if (s.length > 5) s = s.replace(/(tje|tjes|je|jes)$/, '');
  if (s.length > 4 && s.endsWith('en')) s = s.slice(0, -2);
  else if (s.length > 3 && /[elrnk]s$/.test(s)) s = s.slice(0, -1);
  s = s.replace(/([bdfgklmnprst])\1$/, '$1');              /* kippen -> kip */
  return s.replace(/(aa|ee|oo|uu)([^aeiou])$/, (m, v, c) => v[0] + c);   /* banaan -> banan, zoals bananen */
}
/* woorden die zeggen dat het iets anders is dan het losse product: bananensap, appeltaart, drink met banaan */
const OTHERTYPE = ['drink','drank','sap','nectar','smoothie','limonade','siroop','stroop','yoghurt','kwark','skyr','vla','pudding','toetje','dessert','ijs','roomijs','cake','koek','koekje','wafel','taart','gebak','reep','snoep','chips','chocolade','jam','moes','saus','soep','thee','ijsthee','shampoo','zeep','crème','creme','douche','mix','poeder','knijpfruit','fruit','hapje','ontbijtje','maaltijd','boost','split','aioli','hoemoes','boter','brood','pasta','gnocchi','chutney','azijn','bier','cider','wijn','likeur','geur','schijfjes','wrap','pizza','popcorn','dip','salade','hummus','jus','biscuit','middel','afwas','mnd','maanden','baby','kroket','tablet','dubbelfrisss','olvarit','ella','bonbebe','tuc','mcvitie','sandwich','soup','ravioli','tortellini','soes','soesjes','stamppot','bolognese','spritsen','burger','quiche','wraps','ketchup','haribo'];
const OTHERSTEM = OTHERTYPE.map(o => [o, stemNL(o)]);
const OTHERWORD = new Map();
/* staat dit woord (of het einde ervan) in OTHERTYPE? Eén keer per woord uitgerekend */
function otherWord(w){
  let v = OTHERWORD.get(w);
  if (v === undefined){
    const st = stemNL(w);
    v = OTHERSTEM.some(([o, os]) => w === o || st === os || (o.length >= 3 && w.endsWith(o)) || (o.length >= 4 && st.endsWith(os)));
    OTHERWORD.set(w, v);
  }
  return v;
}
/* zegt w dat het iets anders is dan wat er gevraagd is? asked: grondvormen van de zoekwoorden */
function otherType(w, asked){
  if (!otherWord(w)) return false;
  const st = stemNL(w);
  if (asked.has(st)) return false;
  for (const a of asked) if (a.length >= 3 && st.endsWith(a)) return false;
  return true;
}
const FLAVOUR = new Set(['met','smaak','geur','aroma']);
/* zo kort dat begin-van-woord te veel treft: ui mag geen uit vinden, ei geen eigen */
const EXACTONLY = new Set(['ui','ei']);
/* kipfilet is gewoon kip */
const GOODPOST = ['filet','filets','dij','dijen','dijfilet','bout','bouten','poot','poten','vleugels','gehakt','reepjes','haas'];
const SEARCHALIAS = dict({'wc papier':'toiletpapier','wcpapier':'toiletpapier','closetpapier':'toiletpapier','wcrol':'toiletpapier','pleepapier':'toiletpapier','piepers':'aardappelen'});
/* de afdeling van veelgezochte producten; bij andere woorden telt de app zelf waar ze het meest staan */
const HOMECAT = Object.create(null);
[['groente-fruit','banaan appel peer sinaasappel mandarijn druif citroen tomaat paprika komkommer sla ui wortel aardappel broccoli bloemkool champignon spinazie'],
 ['zuivel-eieren','melk boter yoghurt kwark vla eieren ei'],['kaas','kaas'],['vlees','kip gehakt worst biefstuk spek'],['vis','zalm tonijn kabeljauw'],
 ['frisdrank','water cola'],['brood-bakkerij','brood']].forEach(([c, w]) => w.split(' ').forEach(x => { HOMECAT[stemNL(x)] = c; }));

/* woorden en grondvormen van een naam, één keer uitgerekend: bij elke zoekopdracht gaan alle namen langs */
const NAMEPARTS = new Map();
function nameParts(name){
  let p = NAMEPARTS.get(name);
  if (!p){ const words = norm(name).trim().split(' ').filter(Boolean); p = {words, stems: words.map(stemNL)}; NAMEPARTS.set(name, p); }
  return p;
}

/* hoe goed past een productnaam bij de zoekwoorden: null = niet, anders hoe lager hoe beter */
function searchScore(tokens, name){
  const {words, stems} = nameParts(name);
  let score = 0, last = -1;
  const asked = new Set();
  for (const t of tokens){
    const st = stemNL(t);
    asked.add(st);
    let k = stems.indexOf(st), tier = 0;
    if (k < 0){
      /* samenstelling die op het woord eindigt: handappels bij appel, ontbijtkoek bij koek */
      k = words.findIndex((w, i) => (w.length > t.length && w.endsWith(t) && GOODPRE.includes(w.slice(0, w.length - t.length))) ||
        (stems[i].length > st.length && stems[i].endsWith(st) && GOODPRE.includes(stems[i].slice(0, stems[i].length - st.length))) ||
        (w.startsWith(t) && GOODPOST.includes(w.slice(t.length))));
      tier = 1;
    }
    if (k < 0 && st.length >= 4){ k = stems.findIndex(w => w.length > st.length && w.endsWith(st)); tier = 7; }
    if (k < 0 && !EXACTONLY.has(t)){ k = words.findIndex(w => w.startsWith(t) || (st.length >= 4 && w.startsWith(st))); tier = 4; }
    if (k < 0) return null;
    /* "0% suiker", "zonder suiker": juist niet wat je zoekt */
    if (k > 0 && ['0','geen','zonder'].includes(words[k - 1])) tier += 8;
    score += tier;
    last = Math.max(last, k);
  }
  /* wat er na het zoekwoord staat of eromheen zegt iets over het soort product */
  const core = words.filter(w => w.length > 1 && !/\d/.test(w) && !UNITWORDS.has(w));
  if (words.some(w => otherType(w, asked))) score += 6;
  if (words.some(w => FLAVOUR.has(w))) score += 3;
  score += Math.max(0, core.length - tokens.length) * 0.3;   /* hoe minder extra woorden hoe beter */
  return score;
}

/* alle treffers met hun score; producten buiten de afdeling waar het zoekwoord thuishoort zakken
   (melkpopcorn bij melk, ei-salade bij eieren). items: {name, cat}; zonder cat (gewoon assortiment) is de
   afdeling onbekend: dat kost minder dan de verkeerde afdeling, en niets als de naam precies past. Geeft een Map item -> score */
function searchRank(tokens, items){
  const alias = SEARCHALIAS[tokens.join(' ')];
  if (alias) tokens = [alias];
  let pass = rankPass(tokens, items);
  /* niets gevonden: misschien een tikfout (tandpsta, komkomer). Eén ronde, anders blijft zonder -> wonder -> zonder rondgaan */
  if (!pass.out.size){
    const fixed = fixTokens(tokens, items);
    if (fixed.join() !== tokens.join()){ tokens = fixed; pass = rankPass(tokens, items); }
  }
  const {out, count} = pass;
  const fixedHome = tokens.length === 1 ? HOMECAT[stemNL(tokens[0])] : null;
  const home = fixedHome || Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  if (home) out.forEach((v, d) => { if (d.cat !== home) out.set(d, v + (d.cat ? 3 : v > 0 ? 1 : 0)); });
  return out;
}
function rankPass(tokens, items){
  const out = new Map(), count = Object.create(null);
  items.forEach(d => {
    const v = searchScore(tokens, d.name); if (v === null) return;
    out.set(d, v);
    if (v < 2 && d.cat) count[d.cat] = (count[d.cat] || 0) + 1;
  });
  return {out, count};
}
/* alleen woorden die in geen enkele naam voorkomen zijn een mogelijke tikfout */
function fixTokens(tokens, items){
  return tokens.map(t => t.length < 5 || NOFIX.has(t) || items.some(d => searchScore([t], d.name) !== null) ? t : closestWord(t, items) || t);
}

/* gewone producten hebben geen afdeling in de data: leen die van de aanbiedingen. Eerst dezelfde naam, anders
   als alle woorden uit de naam vooral in één afdeling voorkomen. groups: {base, cat}, deals: {name, cat} */
function guessCats(groups, deals){
  const exact = new Map(), per = new Map();
  deals.forEach(d => {
    const base = cleanName(d.name); exact.set(base, d.cat);
    base.split(' ').forEach(w => { const k = stemNL(w), c = per.get(k) || Object.create(null); c[d.cat] = (c[d.cat] || 0) + 1; per.set(k, c); });
  });
  const main = w => {
    const c = per.get(stemNL(w)); if (!c) return '';
    const best = Object.keys(c).sort((a, b) => c[b] - c[a])[0], n = Object.values(c).reduce((a, b) => a + b, 0);
    return n >= 2 && c[best] / n >= 0.6 ? best : '';
  };
  groups.forEach(g => {
    const cats = g.base.split(' ').map(main);
    g.cat = exact.get(g.base) || (cats.every(c => c && c === cats[0]) ? cats[0] : '');
  });
}

/* het woord uit de productnamen dat één letter verschilt van w; bij meerdere het vaakst voorkomende */
function closestWord(w, items){
  const seen = new Map();
  items.forEach(d => nameParts(d.name).words.forEach(x => { if (Math.abs(x.length - w.length) <= 1 && x.length >= 4) seen.set(x, (seen.get(x) || 0) + 1); }));
  let best = null, n = 0;
  seen.forEach((c, x) => { if (c > n && oneEdit(w, x)){ best = x; n = c; } });
  return best;
}
function oneEdit(a, b){
  if (a === b) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}

/* productnaam zonder winkelmerk en formaat: "Jumbo Halfvolle Melk 1 L" -> "halfvolle melk" */
function cleanName(name){
  return norm(name).trim().split(' ')
    .filter(w => w.length > 1 && !/\d/.test(w) && !HOUSE.has(w) && !UNITWORDS.has(w))
    .slice(0, 5).join(' ');
}

/* exact of omgerekend naar de gevraagde hoeveelheid: alleen die prijzen zijn eerlijk te vergelijken */
const comparable = x => !!x && (x.mode === 'exact' || x.mode === 'scaled');

/* uitkomst voor een gekozen set winkels */
function priceMatrix(items, analyses, pins, storeIdxs){
  return items.map(it => {
    const a = analyses[it.id];
    let row = priceRow(it, a, pins, storeIdxs);
    /* een ander soort product (ravioli bij kaas, bananensoesjes bij bananen) doet niet mee zodra een andere winkel
       het echte product heeft; bij een merk als zoekwoord staat c.other nooit aan (zie _analyze) */
    if (row.some(x => x && !x.c.other)) row = row.map(x => x && x.c.other && !x.pinned ? null : x);
    /* zodra een andere winkel een vergelijkbaar product heeft, tellen niet mee: een ander soort product
       (per stuk in plaats van per kilo, of veel te klein/groot) en een product met onbekend formaat dat ook
       slechter bij de zoekterm past (bananenbrood bij "bananen"); zelf gekozen producten blijven staan */
    const cmp = row.filter(comparable);
    if (!cmp.length) return row;
    const best = Math.min(...cmp.map(x => x.c.score));
    /* voor dezelfde hoeveelheid meer dan 8 keer zo duur als het goedkoopste product dat minstens even goed
       bij de zoekterm past, én zelf slechter passend: vrijwel altijd een ander product (bananensoesjes bij
       "bananen"); een duurder A-merk dat even goed past blijft gewoon meedoen */
    const suspect = x => {
      if (!comparable(x)) return false;
      const better = cmp.filter(y => y !== x && y.c.score + 0.5 < x.c.score);
      return better.length > 0 && x.price > OUTLIER * Math.min(...better.map(y => y.price));
    };
    /* niet om te rekenen maar wel het gevraagde product: dat verdwijnt niet, het telt als onbekend formaat (~).
       Beter passend dan alles wat wel te rekenen is, of ongeveer even goed passend als er geen formaat is gevraagd
       (dat is dan een schatting) of als het een pak van meer stuks is (5 bananen) bij een vraag in kilo's.
       Eén los stuk zegt niets over een kilo; dat valt af zolang er een even goed vergelijkbaar product is */
    const loose = x => x.mode === 'other' && !x.c.other && (x.c.score + 0.5 < best || (x.c.score <= best + LOOSEFIT &&
      (a.inferred || (x.c.u === 3 && a.kind !== 3 && x.c.q > 1))));
    return row.map(x => {
      if (!x || x.pinned || (comparable(x) && !suspect(x)) || (x.mode === 'unknown' && x.c.score <= best + 1)) return x;
      return loose(x) ? Object.assign({}, x, {mode: 'unknown', c: Object.assign({}, x.c, {mode: 'unknown'})}) : null;
    });
  });
}
const LOOSEFIT = 3;   /* tot drie woorden meer dan het best passende product: Chiquita Groene bananen, Campina Greek Style Yoghurt */
const OUTLIER = 8;   /* gemeten op 40 gangbare producten: bij 4 of 6 vielen ook echte A-merken (Ariel, Dreft, Dove) af */

/* positie j in een rij van priceMatrix minstens 3 keer zo duur als het goedkoopste vergelijkbare product
   elders? Dan geeft de bon een waarschuwing (misschien een ander product); geeft die goedkopere cel terug */
function muchCheaperElsewhere(row, j){
  const x = row[j];
  if (!comparable(x)) return null;
  let low = null;
  row.forEach((y, k) => { if (k !== j && comparable(y) && (!low || y.price < low.price)) low = y; });
  return low && x.price >= 3 * low.price ? low : null;
}
function priceRow(it, a, pins, storeIdxs){
  return storeIdxs.map(s => {
    const e = a && a.per[s]; if (!e) return null;
    const pinned = pins[it.id] && pins[it.id][s];
    let j;
    if (pinned !== undefined) j = Math.min(pinned, e.cands.length-1);
    else {
      /* kies binnen de best passende producten het product dat voor dit aantal echt het goedkoopst is */
      const top = e.cands[0]; j = 0; let best = lineCost(top, it.qty);
      e.cands.forEach((c, k) => {
        if (k === 0 || c.mode !== top.mode || c.score > top.score + 0.5) return;
        const v = lineCost(c, it.qty); if (v < best){ best = v; j = k; }
      });
    }
    const c = e.cands[j], price = lineCost(c, it.qty);
    return price > 0 ? {price, c, mode: c.mode, j, pinned: pinned !== undefined} : null;
  });
}

/* prijs per kilo, liter of stuk; bij een meerstuksactie de actieprijs per stuk */
function perUnit(c){
  if (!c.u || !c.q) return null;
  const each = c.mbq > 1 && c.mbp ? c.mbp / c.mbq : c.price;
  if (c.u === 1) return {cents: Math.round(each * 1000 / c.q), per: 'kg'};
  if (c.u === 2) return {cents: Math.round(each * 1000 / c.q), per: 'l'};
  return {cents: Math.round(each / c.q), per: 'st'};
}

/* een product in dezelfde winkel dat even goed bij de zoekterm past en per kilo/liter/stuk minstens
   15% voordeliger is dan het gekozen product (meestal een groter pak); null als er geen is */
function betterValue(cands, j){
  const cur = cands[j], up = cur && perUnit(cur);
  if (!up) return null;
  let pick = null, low = up.cents * 0.85;
  cands.forEach((c, k) => {
    if (k === j || c.u !== cur.u || c.score > cur.score + 0.5) return;
    const v = perUnit(c); if (v && v.cents < low){ low = v.cents; pick = c; }
  });
  return pick;
}

/* echte kosten voor n stuks: meerstuksacties gelden alleen per volle bundel, de rest tegen de normale prijs */
function packsFor(n, r){ return Math.max(1, Math.ceil(n * (r || 1) - 0.05)); }
function lineCost(c, n){
  const packs = packsFor(n, c.r);
  let cents;
  if (c.mbq > 1 && c.mbp && c.usual){
    const bundles = Math.floor(packs / c.mbq), rest = packs % c.mbq;
    cents = bundles * c.mbp + rest * c.usual;
  } else if (c.mbq > 1 && c.mbp){
    /* losse prijs onbekend: reken met hele bundels, dan is het totaal nooit te laag */
    cents = Math.ceil(packs / c.mbq) * c.mbp;
  } else cents = packs * c.price;
  return Math.round(cents);
}
function combos(arr, k){
  const out = [];
  (function rec(start, cur){
    if (cur.length === k){ out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++){ cur.push(arr[i]); rec(i+1, cur); cur.pop(); }
  })(0, []);
  return out;
}

/* een cel met een echte prijs; een ontbrekende prijs telt nooit als 0 */
const priced = x => !!x && x.price > 0;

/* per winkel: totaal van de producten met prijs, hoeveel dat er zijn en welke ontbreken.
   complete: de winkel heeft alles wat ergens een prijs heeft, alleen die totalen zijn onderling te vergelijken.
   suspect: regels die veel duurder zijn dan elders, dus waarschijnlijk een ander product (ze tellen wel mee in total) */
function storeTotals(m, storeIdxs){
  const found = m.map(row => row.some(priced));
  return storeIdxs.map((store, j) => {
    let total = 0, count = 0, suspect = 0, complete = true; const missing = [];
    m.forEach((row, i) => {
      if (priced(row[j])){ total += row[j].price; count++; if (muchCheaperElsewhere(row, j)) suspect++; }
      else { missing.push(i); if (found[i]) complete = false; }
    });
    return {store, total, count, items: m.length, missing, complete, suspect};
  });
}
/* eerst de winkels met de meeste producten, dan het laagste totaal: weinig producten is niet goedkoop */
function sortStoreTotals(list){ return list.slice().sort((a, b) => b.count - a.count || a.total - b.total); }

/* m[item][pos in storeIdxs] ; geeft per k de goedkoopste set die alle vindbare producten dekt (result, de basis
   voor het advies). Lukt dat niet, dan staat in partial de set die de meeste producten dekt, met lack = wat ontbreekt */
function plan(m, storeIdxs, kmax){
  const found = m.map((row, i) => row.some(priced) ? i : -1).filter(i => i >= 0);
  const missing = m.map((row, i) => row.some(priced) ? -1 : i).filter(i => i >= 0);
  const pos = storeIdxs.map((_, j) => j);
  const result = [], partial = [];
  for (let k = 1; k <= Math.min(kmax, pos.length); k++){
    let best = null, part = null;
    for (const c of combos(pos, k)){
      let total = 0; const assign = [], lack = [];
      for (const i of found){
        let bj = -1, bp = Infinity;
        for (const j of c){ const x = m[i][j]; if (priced(x) && x.price < bp){ bp = x.price; bj = j; } }
        if (bj < 0){ lack.push(i); continue; }
        total += bp; assign.push([i, bj]);
      }
      const r = {k, combo: c.map(j => storeIdxs[j]), total, assign: assign.map(([i,j]) => [i, storeIdxs[j]])};
      if (!lack.length){ if (!best || total < best.total) best = r; }
      else if (assign.length && (!part || assign.length > part.assign.length || (assign.length === part.assign.length && total < part.total))) part = Object.assign(r, {lack});
    }
    result.push(best); partial.push(best ? null : part);
  }
  /* gemiddelde van winkels die alles hebben */
  const singles = [];
  for (const j of pos){
    if (found.every(i => priced(m[i][j]))) singles.push(found.reduce((s,i) => s + m[i][j].price, 0));
  }
  const avgSingle = singles.length ? Math.round(singles.reduce((a,b)=>a+b,0)/singles.length) : null;
  return {found, missing, result, partial, avgSingle, singles: singles.length};
}

/* boodschappen uit een gedeelde link of uit de opslag: alleen [naam, aantal] met een echte naam en een heel aantal 1-99 */
function cleanList(rows, limit){
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows){
    if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
    const q = r[0].trim().replace(/\s+/g, ' ').slice(0, MAXQUERY).trim();
    if (q) out.push([q, Math.max(1, Math.min(99, Math.round(+r[1]) || 1))]);
    if (out.length === (limit || 100)) break;
  }
  return out;
}

/* tellers uit de opslag: alleen echte aantallen, in een object zonder prototype */
function cleanCounts(o){
  const out = Object.create(null);
  if (o && typeof o === 'object') Object.keys(o).forEach(k => { const n = +o[k]; if (k && n > 0 && Number.isFinite(n)) out[k] = n; });
  return out;
}

/* wat plan to echt oplevert ten opzichte van plan from: een regel uit from met een waarschuwing (waarschijnlijk
   een ander product, zoals bananensoesjes bij "bananen") telt niet mee, anders lijkt de besparing veel te groot */
function fairSaving(from, to, m, storeIdxs){
  let saving = from.total - to.total;
  from.assign.forEach(([i, s]) => {
    const j = storeIdxs.indexOf(s);
    if (!muchCheaperElsewhere(m[i], j)) return;
    const a = to.assign.find(x => x[0] === i), other = a && m[i][storeIdxs.indexOf(a[1])];
    if (other && m[i][j].price > other.price) saving -= m[i][j].price - other.price;
  });
  return saving;
}

/* kies het aantal winkels: elke extra winkel moet minstens thresh centen opleveren;
   saving(a, b) bepaalt wat de overstap oplevert, standaard het verschil in totaal */
function advise(result, thresh, saving){
  const gain = saving || ((a, b) => a.total - b.total);
  let pick = result.findIndex(r => r);
  if (pick < 0) return -1;
  while (pick + 1 < result.length && result[pick+1] && gain(result[pick], result[pick+1]) >= thresh) pick++;
  return pick;
}
