/* ENGINE: zoeken en combineren, geen DOM nodig */
const UNIT = {kg:['g',1000],kilo:['g',1000],kilogram:['g',1000],g:['g',1],gr:['g',1],gram:['g',1],
  l:['m',1000],lt:['m',1000],liter:['m',1000],ml:['m',1],cl:['m',10],dl:['m',100],
  st:['s',1],stuks:['s',1],stuk:['s',1]};
const KIND = {g:1,m:2,s:3};
const KIND_LABEL = {1:'g',2:'ml',3:'st'};
const UNITWORDS = new Set(['g','gr','gram','kg','kilo','ml','cl','dl','l','liter','stuks','stuk','st','per','x','pak','pakje','fles','blik','doos','zak','tray']);
const PENALTY = new Set(['saus','mix','choco','chocolade','maaltijd','pizza','snack','smaak','drink','shake','vla','cholesterol','lactosevrij','glutenvrij','bio','biologisch','vegan','vegetarisch','light','zero','kant','klaar']);
const HOUSE = new Set(['ah','jumbo','plus','dirk','deka','dekamarkt','dekavers','hoogvliet','spar','lidl','poiesz','vomar','woon','beste','de','zuivelmeester','melkan','budget','huismerk','pcd','kwetters','vleeschmeesters','daily','chef','basic','bakkershart','soma','van','den']);
const STOP = new Set(['van','de','het','een','met','en','of','voor']);

function norm(s){
  return ' ' + String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim() + ' ';
}

function parseQuery(q){
  const low = q.toLowerCase().replace(',', '.');
  const re = /(\d+(?:\.\d+)?)\s*(kilogram|kilo|kg|gram|gr|g|liter|lt|ml|cl|dl|l|stuks|stuk|st)\b/;
  const m = low.match(re);
  let kind = 0, amount = 0, rest = low;
  if (m) {
    const [k, f] = UNIT[m[2]];
    kind = KIND[k]; amount = parseFloat(m[1]) * f;
    rest = low.replace(m[0], ' ');
  }
  const tokens = norm(rest).trim().split(' ').filter(t => t && !STOP.has(t));
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
    const N = this.norms[s], K = this.skip[s], tiers = [[],[],[]];
    for (let i = 0; i < N.length; i++){
      if (K[i]) continue;
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
    const p = parseQuery(query);
    const qset = new Set(p.tokens);
    const joined = ' ' + p.tokens.join(' ') + ' ';
    /* 1. relevantie: hoe weinig extra woorden heeft de productnaam */
    const scoredAll = this.stores.map((st, s) => {
      const N = this.norms[s];
      return this.matchStore(s, p.tokens).map(({i, tier}) => {
        const words = N[i].trim().split(' ').filter(w => w.length > 1 && !/^\d/.test(w) && !UNITWORDS.has(w));
        let extra = 0;
        for (const w of words){
          let c = null;
          for (const t of qset){
            if (w === t){ c = 0; break; }
            if (w.endsWith(t)) c = c === null ? 0.4 : Math.min(c, 0.4);   /* roomboter = boter */
          }
          if (c === null){
            let related = false;
            for (const t of qset){ if (w.includes(t)) { related = true; break; } }
            c = related ? 3 : (PENALTY.has(w) ? 4 : (HOUSE.has(w) ? 0 : 1));                  /* boterhamworst is geen boter */
          }
          extra += c;
        }
        if (p.tokens.length > 1 && !N[i].includes(joined)) extra += 2;
        return {i, score: extra};
      });
    });
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
        let eff = price, mode = 'other';
        if (!kind) mode = 'exact';
        else if (u === kind && q > 0){
          if (Math.abs(q - amount) / amount <= tol) mode = 'exact';
          else { const r = amount / q; if (r >= 0.25 && r <= 4){ eff = Math.round(price * r); mode = 'scaled'; } }
        } else if (u === 0) mode = 'unknown';
        const c = {i, name: st.n[i], price, eff, q, u, mode, score: x.score, usual: 0, mbq: 0, mbp: 0, label: '', until: ''};
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
  /* suggesties tijdens typen: precieze zoektermen die in meerdere winkels voorkomen */
  suggest(text, storeIdxs, limit){
    const p = parseQuery(text);
    if (!p.tokens.length || p.tokens.join('').length < 3) return [];
    const a = this.analyze(text, 80);
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
          g = {base, stores: new Set(), sizes: new Map(), min: Infinity, minStore: s, words: bw.length, tier};
          groups.set(base, g);
        }
        g.stores.add(s);
        if (c.u && c.q){ const k = fmtQty(c.u, c.q); g.sizes.set(k, (g.sizes.get(k) || 0) + 1); }
        if (c.price < g.min){ g.min = c.price; g.minStore = s; }
      });
    });
    const out = [...groups.values()].map(g => {
      let size = '';
      if (p.kind) size = fmtQty(p.kind, p.amount);
      else if (g.sizes.size){ size = [...g.sizes.entries()].sort((x, y) => y[1] - x[1])[0][0]; }
      g.q = g.base + (size ? ' ' + size : '');
      g.rank = Math.min(g.stores.size, 6) + g.tier * 1.5 - 0.6 * (g.words - 1);
      return g;
    });
    return out.sort((x, y) => y.rank - x.rank || x.min - y.min).slice(0, limit);
  }
}

/* productnaam zonder winkelmerk en formaat: "Jumbo Halfvolle Melk 1 L" -> "halfvolle melk" */
function cleanName(name){
  return norm(name).trim().split(' ')
    .filter(w => w.length > 1 && !/\d/.test(w) && !HOUSE.has(w) && !UNITWORDS.has(w))
    .slice(0, 5).join(' ');
}

/* uitkomst voor een gekozen set winkels */
function priceMatrix(items, analyses, pins, storeIdxs){
  return items.map(it => {
    const a = analyses[it.id];
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
      const c = e.cands[j];
      return {price: lineCost(c, it.qty), c, mode: c.mode, j};
    });
  });
}

/* echte kosten voor n stuks: meerstuksacties gelden alleen per volle bundel, de rest tegen de normale prijs */
function lineCost(c, n){
  const scale = c.price ? c.eff / c.price : 1;
  let cents;
  if (c.mbq > 1 && c.mbp && c.usual){
    const bundles = Math.floor(n / c.mbq), rest = n % c.mbq;
    cents = bundles * c.mbp + rest * c.usual;
  } else cents = n * c.price;
  return Math.round(cents * scale);
}
function combos(arr, k){
  const out = [];
  (function rec(start, cur){
    if (cur.length === k){ out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++){ cur.push(arr[i]); rec(i+1, cur); cur.pop(); }
  })(0, []);
  return out;
}

/* m[item][pos in storeIdxs] ; geeft per k de goedkoopste set die alle vindbare producten dekt */
function plan(m, storeIdxs, kmax){
  const found = m.map((row, i) => row.some(x => x) ? i : -1).filter(i => i >= 0);
  const missing = m.map((row, i) => row.some(x => x) ? -1 : i).filter(i => i >= 0);
  const pos = storeIdxs.map((_, j) => j);
  const result = [];
  for (let k = 1; k <= Math.min(kmax, pos.length); k++){
    let best = null;
    for (const c of combos(pos, k)){
      let total = 0, ok = true; const assign = [];
      for (const i of found){
        let bj = -1, bp = Infinity;
        for (const j of c){ const x = m[i][j]; if (x && x.price < bp){ bp = x.price; bj = j; } }
        if (bj < 0){ ok = false; break; }
        total += bp; assign.push([i, bj]);
      }
      if (ok && (!best || total < best.total)) best = {k, combo: c.map(j => storeIdxs[j]), total, assign: assign.map(([i,j]) => [i, storeIdxs[j]])};
    }
    result.push(best);
  }
  /* gemiddelde van winkels die alles hebben */
  const singles = [];
  for (const j of pos){
    if (found.every(i => m[i][j])) singles.push(found.reduce((s,i) => s + m[i][j].price, 0));
  }
  const avgSingle = singles.length ? Math.round(singles.reduce((a,b)=>a+b,0)/singles.length) : null;
  return {found, missing, result, avgSingle, singles: singles.length};
}

/* kies het aantal winkels: elke extra winkel moet minstens thresh centen opleveren */
function advise(result, thresh){
  let pick = result.findIndex(r => r);
  if (pick < 0) return -1;
  while (pick + 1 < result.length && result[pick+1] && result[pick].total - result[pick+1].total >= thresh) pick++;
  return pick;
}
