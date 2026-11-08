"""Haalt gewone prijzen op van de websites van supermarkten zelf, voor winkels waarvan Checkjebon al lang niet meer bijwerkt.

Gebruik: python3 -I fetch_store.py <winkel> data/<winkel>.json [--limit N] [--max-minutes M] [--delay S]
Winkels: dirk, dekamarkt, hoogvliet.

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
import json, re, sys, time, datetime, os, urllib.request, urllib.error, urllib.parse, urllib.robotparser

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

STORES = {
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

    xml = get(CFG['sitemap'])
    if not xml: sys.exit('productlijst (sitemap) niet te lezen')
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
            if streak >= 30: print('30 keer achter elkaar niets bruikbaars; gestopt', file=sys.stderr); break
        if k % 500 == 0: print(f'{k}/{len(allowed)} opgehaald, {len(new)} prijzen, {fails} zonder prijs', file=sys.stderr)
        time.sleep(DELAY)

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
