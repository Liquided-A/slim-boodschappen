"""Haalt gewone prijzen op van de websites van supermarkten zelf, voor winkels waarvan Checkjebon al lang niet meer bijwerkt.

Gebruik: python3 -I fetch_store.py <winkel> data/<winkel>.json [--limit N] [--max-minutes M] [--delay S]
Winkels: dirk, dekamarkt, hoogvliet, aldi, vomar, poiesz, ekoplaza, spar (spar is reserve voor als Checkjebon stopt).
Vomar en Poiesz hebben geen productsitemap: daar worden lijstpagina's per (sub)groep gelezen, met veel prijzen per pagina.

Netjes ophalen:
- eerlijke User-Agent met een link naar dit project, geen browser nadoen;
- robots.txt wordt gelezen en gevolgd; staat de winkel het niet toe, dan stopt het script;
- één pagina tegelijk, standaard één per seconde; bij 'te veel verzoeken' (429/503) wacht het en remt het af;
- weigert de winkel ons (403), dan stopt het meteen. Er wordt niets omzeild.
Alleen productnummer, naam, inhoud en gewone prijs (niet de actieprijs) worden bewaard.

Producten die deze keer niet zijn opgehaald (tijdslimiet, fout) houden hun vorige prijs met de datum waarop die gezien is.
Elke run begint bij de producten die het langst niet zijn bijgewerkt, zodat een te lange lijst in een paar nachten rond is.
own_prices.py laat prijzen ouder dan 14 dagen weg.
"""
import json, re, sys, time, datetime, os, html as htmllib, urllib.request, urllib.error, urllib.parse, urllib.robotparser

UA = 'SlimBoodschappen/1.0 (+https://github.com/Liquided-A/slim-boodschappen/issues)'

# ---------- per winkel: waar de productlijst staat, welk adres we ophalen en hoe we de pagina lezen ----------
def nuxt_detailresult(html):
    """Dirk en DekaMarkt (zelfde webwinkel): __NUXT_DATA__ met normalPrice (gewone prijs) en packaging (inhoud)"""
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m: return None
    try: d = json.loads(m.group(1))
    except ValueError: return None
    val = lambda i: d[i] if isinstance(i, int) and 0 <= i < len(d) else None
    price = info = None
    for x in d:
        if not isinstance(x, dict): continue
        if price is None and 'normalPrice' in x and 'productId' in x: price = x
        if info is None and 'headerText' in x and 'packaging' in x and 'productId' in x: info = x
    if not price or not info: return None
    pidn, normal = val(price['productId']), val(price['normalPrice'])
    name = val(info['headerText']); sub = val(info['subText']) if 'subText' in info else ''
    size = val(info['packaging']) or ''
    if not isinstance(pidn, int) or not isinstance(name, str) or not name.strip(): return None
    if not isinstance(normal, (int, float)) or not (0.05 <= normal < 1000): return None
    n = name.strip() + (' ' + sub.strip() if isinstance(sub, str) and sub.strip() else '')
    return {'l': str(pidn), 'n': n, 's': size.strip() if isinstance(size, str) else '', 'p': round(float(normal), 2)}

def next_hoogvliet(html):
    """Hoogvliet: __NEXT_DATA__ props.pageProps.entity met regular_price (gewone prijs) en volume + eenheid"""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m: return None
    try: e = json.loads(m.group(1))['props']['pageProps']['entity']
    except (ValueError, KeyError, TypeError): return None
    if not isinstance(e, dict): return None
    try: normal = e['price_range']['minimum_price']['regular_price']['value']
    except (KeyError, TypeError): return None
    name = e.get('display_name') or e.get('name')
    slug = str(e.get('url_key') or '').split('/')[-1]
    if not isinstance(name, str) or not name.strip() or not re.fullmatch(r'[a-z0-9-]+', slug): return None
    if not isinstance(normal, (int, float)) or not (0.05 <= normal < 1000): return None
    sa = e.get('sub_title_attributes') or {}
    size = (str(sa.get('volume') or '').strip() + ' ' + str(sa.get('unit') or '').strip()).strip() if isinstance(sa, dict) else ''
    return {'l': slug, 'n': name.strip(), 's': size, 'p': round(float(normal), 2)}

def next_aldi(html):
    """ALDI: __NEXT_DATA__ props.pageProps.apiData (JSON-tekst) -> ["PRODUCT_DETAIL_GET", {res: {products: [..]}}]
    met currentPrice.priceValue (gewone prijs) en salesUnit (inhoud). Staat er strikePrice of priceTagLabels
    in currentPrice, dan is het een actie- of OP=OP-prijs: overslaan (de vorige gewone prijs blijft staan)."""
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m: return None
    try:
        api = json.loads(json.loads(m.group(1))['props']['pageProps']['apiData'])
        p = next(x[1]['res']['products'][0] for x in api if isinstance(x, list) and x and x[0] == 'PRODUCT_DETAIL_GET')
    except (ValueError, KeyError, TypeError, IndexError, StopIteration): return None
    if not isinstance(p, dict): return None
    cp = p.get('currentPrice') or {}
    if not isinstance(cp, dict) or 'strikePrice' in cp or 'priceTagLabels' in cp: return None
    normal = cp.get('priceValue')
    name, slug = p.get('name'), str(p.get('productSlug') or '')
    if not isinstance(name, str) or not name.strip() or not re.fullmatch(r'[a-z0-9-]+-\d{7}', slug): return None
    if not isinstance(normal, (int, float)) or not (0.05 <= normal < 1000): return None
    brand = p.get('brandName') if isinstance(p.get('brandName'), str) else ''
    n = (brand.strip().title() + ' ' + name.strip()).strip()
    size = re.sub(r'^Inhoud:\s*', '', str(p.get('salesUnit') or '').strip())
    return {'l': slug, 'n': n, 's': size, 'p': round(float(normal), 2)}

# ---------- Vomar: Nuxt 2, window.__NUXT__=(function(a,b,...){ ... }(waarde1,waarde2,...)) ----------
_STR = r'"(?:[^"\\]|\\.)*"'
_JSLIT = re.compile(r'\s*(' + _STR + r'|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|true|false|null|void 0|\{\}|\[\]|Array\(\d+\))\s*(?:,|$)')

def _nuxt2_vars(html):
    """koppelt de parameternamen aan de letterlijke waarden onderaan de functie; (None, None) als dat niet lukt"""
    i = html.find('window.__NUXT__=(function(')
    if i < 0: return None, None
    js = html[i:html.find('</script>', i)]
    m = re.match(r'window\.__NUXT__=\(function\(([^)]*)\)\{', js)
    k = js.rfind('}(')
    if not m or k < 0: return None, None
    tail = js[k + 2:].rstrip().rstrip(';').rstrip()
    if not tail.endswith('))'): return None, None
    tail, vals, pos = tail[:-2], [], 0
    while pos < len(tail):
        mm = _JSLIT.match(tail, pos)
        if not mm or mm.end() == pos: return None, None
        t = mm.group(1)
        if t.startswith('"'):
            try: v = json.loads(t)
            except ValueError: return None, None
        elif t in ('true', 'false'): v = t == 'true'
        elif t in ('null', 'void 0', '{}', '[]') or t.startswith('Array('): v = None
        else: v = float(t) if any(c in t for c in '.eE') else int(t)
        vals.append(v); pos = mm.end()
    names = m.group(1).split(',')
    if len(vals) > len(names): return None, None
    return dict(zip(names, vals)), js[m.end():k]

def _jsval(tok, env):
    if tok.startswith('"'):
        try: return json.loads(tok)
        except ValueError: return None
    if re.fullmatch(r'-?(?:\d+\.?\d*|\.\d+)', tok): return float(tok) if '.' in tok else int(tok)
    return env.get(tok)   # variabelenaam uit de functie

_VPROD = re.compile(r'\{id:"[0-9a-f-]{36}",articleNumber:(\d+),description:(' + _STR + r'|[\w$]+),'
                    r'contents:(' + _STR + r'|[\w$.]+),unit:(' + _STR + r'|[\w$]+),price:(-?[\d.]+|[\w$]+),')

def vomar_group(html):
    """Vomar groepspagina /producten/<afdeling>/<groep>: data[0].mainGroupProducts (pageSize 3000, dus alles)
    met articleNumber, description, contents + unit en price (gewone prijs; acties staan er niet in)"""
    env, body = _nuxt2_vars(html)
    if env is None: return [], None
    paths = {m.group(2): m.group(1) for m in re.finditer(r'href="/producten/([a-z0-9-]+/[a-z0-9-]+/[^"/]+/(\d+))"', html)}
    rows = []
    for m in _VPROD.finditer(body):
        name, cont, unit, price = (_jsval(m.group(g), env) for g in (2, 3, 4, 5))
        if not isinstance(name, str) or not name.strip() or m.group(1) not in paths: continue
        if isinstance(price, bool) or not isinstance(price, (int, float)) or not (0.05 <= price < 1000): continue
        size = (str(cont).strip() + ' ' + str(unit or '').strip()).strip() if cont not in (None, '') else ''
        rows.append({'l': paths[m.group(1)], 'n': name.strip(), 's': size, 'p': round(float(price), 2)})
    return rows, None

def vomar_pages(fetch):
    """/producten -> afdelingen -> groepen (ongeveer 1 + 10 + 85 pagina's)"""
    top = fetch('https://www.vomar.nl/producten') or ''
    out = []
    for dep in sorted(set(re.findall(r'href="/producten/([a-z0-9-]+)"', top))):
        h = fetch(f'https://www.vomar.nl/producten/{dep}') or ''
        out += [f'https://www.vomar.nl/producten/{dep}/{g}' for g in sorted(set(re.findall(rf'href="/producten/{dep}/([a-z0-9-]+)"', h)))]
    return out

# ---------- Poiesz webwinkel: Nuxt 3 __NUXT_DATA__ ----------
def _nuxt3(html):
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m: return None, None
    try: d = json.loads(m.group(1))
    except ValueError: return None, None
    def r(i, depth=0):
        x = d[i] if isinstance(i, int) and 0 <= i < len(d) else i
        if depth > 12: return None
        if isinstance(x, list):
            if x and x[0] in ('ShallowReactive', 'Reactive', 'Ref', 'ShallowRef'): return r(x[1], depth + 1)
            return [r(v, depth + 1) for v in x]
        if isinstance(x, dict): return {k: r(v, depth + 1) for k, v in x.items()}
        return x
    try: data = r(d[1]['data'])
    except (KeyError, TypeError, IndexError): return None, None
    return (data, r) if isinstance(data, dict) else (None, None)

_UNITS = {'gram': 'g', 'kilogram': 'kg', 'milliliter': 'ml', 'liter': 'l', 'centiliter': 'cl', 'stuks': 'st', 'stuk': 'st'}
def _poiesz_size(t):
    m = re.fullmatch(r'\s*([\d.]+)\s*([A-Za-z]+)\s*', str(t or ''))
    if not m: return str(t or '').strip()
    n = m.group(1); n = n[:-3] if n.endswith('.00') else n
    return f'{n} {_UNITS.get(m.group(2).lower(), m.group(2).lower())}'

def poiesz_list(html):
    """Poiesz subsubcategorie: data['subsubcat-products-<naam>'] = {items: [...], paging: {page, pages}}
    item: id, name, price (gewone prijs), strikeThroughPrice/promotion (actie), packageDescription (inhoud)"""
    data, _ = _nuxt3(html)
    if not data: return [], None
    blk = next((v for k, v in data.items() if k.startswith('subsubcat-products-') and isinstance(v, dict)), None)
    if not blk: return [], None
    rows = []
    for p in blk.get('items') or []:
        if not isinstance(p, dict) or p.get('promotion') or p.get('strikeThroughPrice'): continue   # actie: overslaan
        pid, name, price = p.get('id'), p.get('name'), p.get('price')
        if not isinstance(pid, int) or not isinstance(name, str) or not name.strip(): continue
        if isinstance(price, bool) or not isinstance(price, (int, float)) or not (0.05 <= price < 1000): continue
        rows.append({'l': str(pid), 'n': name.strip(), 's': _poiesz_size(p.get('packageDescription')), 'p': round(float(price), 2)})
    pg = blk.get('paging') or {}
    nxt = pg.get('page', 1) + 1 if isinstance(pg.get('page'), int) and isinstance(pg.get('pages'), int) and pg['page'] < pg['pages'] else None
    return rows, nxt

def poiesz_pages(fetch):
    """de hele indeling (hoofd-, sub- en subsubcategorieën) staat op /boodschappen; ongeveer 470 lijstpagina's"""
    data, _ = _nuxt3(fetch('https://webwinkel.poiesz-supermarkten.nl/boodschappen') or '')
    tree = (data or {}).get('boodschappen-main-categories') or []
    ok = lambda x: isinstance(x, dict) and re.fullmatch(r'[a-z0-9-]+', str(x.get('url') or ''))   # alleen nette adresdelen
    return [f'https://webwinkel.poiesz-supermarkten.nl/boodschappen/{m["url"]}/{s["url"]}/{ss["url"]}'
            for m in tree if ok(m) for s in m.get('subCategories') or [] if ok(s) for ss in s.get('subSubCategories') or [] if ok(ss)]

def _ld_products(html):
    """alle schema.org Product-objecten uit de JSON-LD-blokken (ook binnen @graph)"""
    out = []
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S):
        try: d = json.loads(m.group(1))
        except ValueError: continue
        stack = [d]
        while stack:
            x = stack.pop()
            if isinstance(x, list): stack.extend(x)
            elif isinstance(x, dict):
                t = x.get('@type'); t = t if isinstance(t, list) else [t]
                if 'Product' in t: out.append(x)
                stack.extend(v for k, v in x.items() if k == '@graph')
    return out

def _num(v):
    try: v = float(str(v).replace(',', '.'))
    except (TypeError, ValueError): return None
    return round(v, 2) if 0.05 <= v < 1000 else None

def ld_ekoplaza(html):
    """Ekoplaza: JSON-LD Product. offers.price is de huidige prijs; bij een aanbieding staat de gewone prijs in
    offers.priceSpecification (priceType ListPrice). Inhoud in 'size'."""
    canon = re.search(r'<link[^>]*rel="canonical"[^>]*href="https://www\.ekoplaza\.nl/nl/producten/product/([a-z0-9-]+-\d{10})"', html)
    for p in _ld_products(html):
        o = p.get('offers')
        o = o[0] if isinstance(o, list) and o else o
        if not isinstance(o, dict): continue
        normal = _num(o.get('price'))
        specs = o.get('priceSpecification'); specs = specs if isinstance(specs, list) else [specs]
        for s in specs:
            if isinstance(s, dict) and str(s.get('priceType', '')).endswith('ListPrice') and _num(s.get('price')):
                normal = _num(s.get('price'))
        name = p.get('name')
        pid = p.get('@id', '')
        m = re.search(r'/nl/producten/product/([a-z0-9-]+-\d{10})', pid) or canon
        if not m or not isinstance(name, str) or not name.strip() or normal is None: continue
        return {'l': m.group(1), 'n': htmllib.unescape(name.strip()), 's': str(p.get('size') or '').strip(), 'p': normal}
    return None

def ld_spar(html):
    """SPAR: JSON-LD Product met offers.price. Aanbiedingen staan niet op de productpagina (pas in het mandje),
    dus dit is de gewone (advies)prijs. Inhoud staat in <h2 class="c-offer__subtitle">."""
    for p in _ld_products(html):
        o = p.get('offers')
        o = o[0] if isinstance(o, list) and o else o
        if not isinstance(o, dict): continue
        normal = _num(o.get('price'))
        m = re.match(r'https://www\.spar\.nl/([^/?#]+-\d{5,}/)$', htmllib.unescape(urllib.parse.unquote(str(o.get('url') or ''))))
        name = p.get('name')
        if not m or not isinstance(name, str) or not name.strip() or normal is None: continue
        s = re.search(r'<h2 class="c-offer__subtitle">\s*([^<]*?)\s*</h2>', html)
        return {'l': m.group(1), 'n': htmllib.unescape(name.strip()), 's': htmllib.unescape(s.group(1)) if s else '', 'p': normal}
    return None

STORES = {
    # ALDI: productsitemap; alleen 7-cijferige nummers (vast assortiment), 8-cijferige 91xxxxxx zijn OP=OP-acties.
    # Ook 7-cijferige nummers kunnen OP=OP zijn of geen prijs tonen; die staan soms in rijtjes, dus later pas stoppen.
    'aldi': {'robots': 'https://www.aldi.nl/robots.txt', 'sitemap': 'https://www.aldi.nl/sitemaps/.aldi-nord-sitemap-products.xml',
             'keep': r'^https://www\.aldi\.nl/product/([a-z0-9-]+-\d{7})\.html$', 'url': 'https://www.aldi.nl/product/{}.html',
             'base': 'https://www.aldi.nl/product/', 'parse': next_aldi, 'streak': 200},
    # Vomar en Poiesz: geen productsitemap; lijstpagina's met alle producten van een (sub)groep
    'vomar': {'robots': 'https://www.vomar.nl/robots.txt', 'pages': vomar_pages, 'list': vomar_group,
              'base': 'https://www.vomar.nl/producten/'},
    'poiesz': {'robots': 'https://webwinkel.poiesz-supermarkten.nl/robots.txt', 'pages': poiesz_pages, 'list': poiesz_list,
               'base': 'https://webwinkel.poiesz-supermarkten.nl/boodschappen/producten/'},
    'dirk': {'robots': 'https://www.dirk.nl/robots.txt', 'sitemap': 'https://www.dirk.nl/products-sitemap.xml',
             'keep': r'^https://www\.dirk\.nl/boodschappen/.+/(\d+)$', 'url': 'https://www.dirk.nl/boodschappen/x/x/x/{}',
             'base': 'https://www.dirk.nl/boodschappen/x/x/x/', 'parse': nuxt_detailresult},
    # de productlijst van DekaMarkt noemt adressen met /producten/ die niet bestaan; het productnummer klopt wel
    'dekamarkt': {'robots': 'https://www.dekamarkt.nl/robots.txt', 'sitemap': 'https://www.dekamarkt.nl/products-sitemap.xml',
                  'keep': r'^https://www\.dekamarkt\.nl/boodschappen/.+/(\d+)$', 'url': 'https://www.dekamarkt.nl/boodschappen/x/x/x/{}',
                  'base': 'https://www.dekamarkt.nl/boodschappen/x/x/x/', 'parse': nuxt_detailresult},
    'hoogvliet': {'robots': 'https://hoogvliet.nl/robots.txt', 'sitemap': 'https://hoogvliet.nl/sitemap-catalog.xml',
                  'keep': r'^https://hoogvliet\.nl/([a-z0-9-]+-\d{6,})$', 'url': 'https://hoogvliet.nl/{}',
                  'base': 'https://hoogvliet.nl/', 'parse': next_hoogvliet},
    'ekoplaza': {'robots': 'https://www.ekoplaza.nl/robots.txt', 'sitemap': 'https://www.ekoplaza.nl/sitemap-products.xml',
                 'keep': r'^https://www\.ekoplaza\.nl/nl/producten/product/([a-z0-9-]+-\d{10})$',
                 'url': 'https://www.ekoplaza.nl/nl/producten/product/{}',
                 'base': 'https://www.ekoplaza.nl/nl/producten/product/', 'parse': ld_ekoplaza},
    # reserve: alleen inschakelen als Checkjebon stopt met SPAR; zelfde productnummers als Checkjebon (met / aan het eind)
    'spar': {'robots': 'https://www.spar.nl/robots.txt', 'sitemap': 'https://www.spar.nl/sitemap/products.xml',
             'keep': r'^https://www\.spar\.nl/([a-z0-9-]+-\d{5,}/)$', 'url': 'https://www.spar.nl/{}',
             'base': 'https://www.spar.nl/', 'parse': ld_spar},
}

args = sys.argv[1:]
if len(args) < 2 or args[0] not in STORES: sys.exit(__doc__)
KEY, out = args[0], args[1]
CFG = STORES[KEY]
def opt(name, default):
    return type(default)(args[args.index(name) + 1]) if name in args else default
LIMIT, MAXMIN, DELAY = opt('--limit', 0), opt('--max-minutes', 300.0), opt('--delay', 1.0)

class Blocked(Exception): pass

class HttpsOnly(urllib.request.HTTPRedirectHandler):
    """alleen doorsturen naar een https-adres; nooit naar http of een ander soort adres"""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith('https://'): return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)
OPENER = urllib.request.build_opener(HttpsOnly)
MAXBYTES = 30_000_000   # grootste toegestane pagina of productlijst

def get(url):
    """pagina ophalen; None bij 404; Blocked bij 403; wacht en probeert opnieuw bij 429/503 of een netwerkfout"""
    global DELAY
    url = urllib.parse.quote(url, safe=':/?=&%#+,;~@!$*()\'')   # adressen met bijvoorbeeld een ë
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'nl-NL'})
            with OPENER.open(req, timeout=30) as r:
                return r.read(MAXBYTES).decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (404, 410): return None
            if e.code == 403: raise Blocked(url)
            if e.code in (429, 503):
                DELAY = min(DELAY * 2, 10)
                ra = str(e.headers.get('Retry-After') or '')
                time.sleep(min(max(int(ra) if ra.isdigit() else 0, 60 * (attempt + 1)), 300)); continue   # nooit langer dan 5 minuten
            time.sleep(5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            time.sleep(10 * (attempt + 1))
        except (UnicodeError, ValueError):
            return None
    return None

def main():
    started = time.time()
    today = datetime.date.today().isoformat()
    robots = get(CFG['robots'])
    if robots is None: sys.exit('robots.txt niet te lezen; uit voorzorg gestopt')
    rp = urllib.robotparser.RobotFileParser(); rp.parse(robots.splitlines())
    if 'pages' in CFG:
        return save(*from_lists(rp, started, today), started, today)

    xml = get(CFG['sitemap'])
    if not xml: sys.exit('productlijst (sitemap) niet te lezen')
    xml = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', xml)   # Ekoplaza zet adressen in CDATA
    ids, seen = [], set()
    for u in re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', xml):
        m = re.match(CFG['keep'], u)
        if m and m.group(1) not in seen:
            seen.add(m.group(1)); ids.append(m.group(1))
            if len(ids) >= 100_000: break   # bovengrens: een productlijst is nooit zo lang
    allowed = [i for i in ids if rp.can_fetch(UA, CFG['url'].format(i))]
    print(f'{KEY}: {len(ids)} producten in de sitemap, {len(allowed)} toegestaan door robots.txt', file=sys.stderr)
    if not allowed: sys.exit('robots.txt staat het ophalen niet toe; gestopt')

    old = {}
    if os.path.exists(out):
        try: old = {p['l']: p for p in json.load(open(out, encoding='utf-8'))['d']}
        except (ValueError, KeyError, TypeError): old = {}
    # nooit gezien eerst, dan de oudste; zo is een lange lijst in een paar nachten helemaal bijgewerkt
    allowed.sort(key=lambda i: old[i]['t'] if i in old else '')
    if LIMIT: allowed = allowed[:LIMIT]

    new, fails, streak = {}, 0, 0
    for k, i in enumerate(allowed):
        if (time.time() - started) / 60 > MAXMIN:   # ook na lang wachten op de winkel
            print(f'tijdslimiet bereikt na {k} pagina\'s', file=sys.stderr); break
        try: html = get(CFG['url'].format(i))
        except Blocked:
            print(f'{KEY} weigert ons (403); gestopt zonder iets te omzeilen', file=sys.stderr); break
        p = CFG['parse'](html) if html else None
        if p:
            p['t'] = today; new[p['l']] = p; streak = 0
        else:
            fails += 1; streak += 1
            if streak >= CFG.get('streak', 30): print(f'{streak} keer achter elkaar niets bruikbaars; gestopt', file=sys.stderr); break
        if k % 500 == 0: print(f'{k}/{len(allowed)} opgehaald, {len(new)} prijzen, {fails} zonder prijs', file=sys.stderr)
        time.sleep(DELAY)
    save(old, new, fails, started, today)

def from_lists(rp, started, today):
    """winkels zonder productsitemap: alle lijstpagina's (met hun vervolgpagina's) ophalen; elke pagina geeft veel prijzen"""
    old = {}
    if os.path.exists(out):
        try: old = {p['l']: p for p in json.load(open(out, encoding='utf-8'))['d']}
        except (ValueError, KeyError, TypeError): old = {}
    def fetch(u):
        if not rp.can_fetch(UA, u): return None
        time.sleep(DELAY)   # ook tussen de pagina's waarmee de lijst wordt opgebouwd
        try: return get(u)   # via OPENER: alleen https
        except Blocked: sys.exit(f'{KEY} weigert ons (403); gestopt zonder iets te omzeilen')
    pages = list(dict.fromkeys(u for u in CFG['pages'](fetch) if rp.can_fetch(UA, u)))[:2000]   # bovengrens: nooit zo veel groepen
    print(f'{KEY}: {len(pages)} lijstpagina\'s toegestaan door robots.txt', file=sys.stderr)
    if not pages: sys.exit('geen lijstpagina\'s gevonden of toegestaan; gestopt')
    if LIMIT: pages = pages[:LIMIT]
    new, fails, streak = {}, 0, 0
    for k, u in enumerate(pages):
        page, n = 1, 0
        while page and n < 50:   # hoogstens 50 pagina's per lijst, ook als de winkel steeds dezelfde 'volgende' noemt
            if (time.time() - started) / 60 > MAXMIN:
                print(f'tijdslimiet bereikt na {k} lijstpagina\'s', file=sys.stderr); return old, new, fails
            html = fetch(u if page == 1 else f'{u}?page={page}'); n += 1
            rows, nxt = CFG['list'](html) if html else ([], None)
            page = nxt if isinstance(nxt, int) and nxt > page else None   # alleen vooruit
            for p in rows: p['t'] = today; new[p['l']] = p
            if rows: streak = 0
            else:
                fails += 1; streak += 1
                if streak >= 30: print('30 keer achter elkaar niets bruikbaars; gestopt', file=sys.stderr); return old, new, fails
        if k % 50 == 0: print(f'{k}/{len(pages)} lijstpagina\'s, {len(new)} prijzen', file=sys.stderr)
    return old, new, fails

def save(old, new, fails, started, today):
    if len(new) < 50 and not LIMIT:
        sys.exit(f'maar {len(new)} prijzen opgehaald; het oude bestand blijft staan')
    merged = dict(old); merged.update(new)
    rows = sorted(merged.values(), key=lambda p: p['n'].lower())
    json.dump({'fetched': today, 'store': KEY, 'base': CFG['base'], 'd': rows}, open(out, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(f'klaar: {len(new)} nieuw opgehaald, {len(rows)} in het bestand, {fails} pagina\'s zonder prijs, '
          f'{round((time.time() - started) / 60)} minuten', file=sys.stderr)

if __name__ == '__main__':
    main()
