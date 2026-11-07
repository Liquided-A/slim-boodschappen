"""Haalt de gewone prijzen van Dirk op van dirk.nl zelf, omdat die in Checkjebon al maanden niet meer veranderen.

Gebruik: python3 -I fetch_dirk.py data/dirk.json [--limit N] [--max-minutes M] [--delay S]

Netjes ophalen:
- eerlijke User-Agent met een link naar dit project, geen browser nadoen;
- robots.txt wordt gelezen en gevolgd; staat dirk.nl het niet toe, dan stopt het script;
- één pagina tegelijk, standaard één per seconde; bij 'te veel verzoeken' (429/503) wacht het en remt het af;
- blokkeert dirk.nl ons (403), dan stopt het meteen. Er wordt niets omzeild.
Alleen productnummer, naam, inhoud en gewone prijs worden bewaard.

Producten die deze keer niet zijn opgehaald (tijdslimiet, fout) houden hun vorige prijs met de datum waarop die gezien is,
zodat een halve run het bestand niet leeg maakt. own_prices.py laat prijzen ouder dan 14 dagen weg.
"""
import json, re, sys, time, datetime, os, urllib.request, urllib.error, urllib.parse, urllib.robotparser

UA = 'SlimBoodschappen/1.0 (+https://github.com/Liquided-A/slim-boodschappen/issues)'
BASE = 'https://www.dirk.nl'
SITEMAP = BASE + '/products-sitemap.xml'

args = sys.argv[1:]
out = args[0]
def opt(name, default):
    return type(default)(args[args.index(name) + 1]) if name in args else default
LIMIT, MAXMIN, DELAY = opt('--limit', 0), opt('--max-minutes', 300.0), opt('--delay', 1.0)

class Blocked(Exception): pass

def get(url):
    """pagina ophalen; None bij 404; Blocked bij 403; wacht en probeert opnieuw bij 429/503 of een netwerkfout"""
    global DELAY
    url = urllib.parse.quote(url, safe=':/?=&%#+,;~@!$*()\'')   # adressen met bijvoorbeeld een ë
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'nl-NL'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 404 or e.code == 410: return None
            if e.code == 403: raise Blocked(url)
            if e.code in (429, 503):
                DELAY = min(DELAY * 2, 10)
                wait = int(e.headers.get('Retry-After') or 0) if str(e.headers.get('Retry-After') or '').isdigit() else 0
                time.sleep(max(wait, 60 * (attempt + 1))); continue
            time.sleep(5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            time.sleep(10 * (attempt + 1))
        except (UnicodeError, ValueError):
            return None
    return None

def parse(html):
    """{'l': productnummer, 'n': naam, 's': inhoud, 'p': gewone prijs} of None"""
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
    name = val(info['headerText']); sub = val(info.get('subText')) if 'subText' in info else ''
    size = val(info['packaging']) or ''
    if not isinstance(pidn, int) or not isinstance(name, str) or not name.strip(): return None
    if not isinstance(normal, (int, float)) or not (0.05 <= normal < 1000): return None
    n = name.strip() + (' ' + sub.strip() if isinstance(sub, str) and sub.strip() else '')
    return {'l': str(pidn), 'n': n, 's': size.strip() if isinstance(size, str) else '', 'p': round(float(normal), 2)}

def main():
    started = time.time()
    today = datetime.date.today().isoformat()
    rp = urllib.robotparser.RobotFileParser()
    robots = get(BASE + '/robots.txt')
    if robots is None: sys.exit('robots.txt niet te lezen; uit voorzorg gestopt')
    rp.parse(robots.splitlines())

    xml = get(SITEMAP)
    if not xml: sys.exit('productlijst (sitemap) niet te lezen')
    urls = [u for u in re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', xml) if u.startswith(BASE + '/boodschappen/')]
    allowed = [u for u in urls if rp.can_fetch(UA, u)]
    print(f'{len(urls)} producten in de sitemap, {len(allowed)} toegestaan door robots.txt', file=sys.stderr)
    if not allowed: sys.exit('robots.txt staat het ophalen niet toe; gestopt')
    if LIMIT: allowed = allowed[:LIMIT]

    old = {}
    if os.path.exists(out):
        try: old = {p['l']: p for p in json.load(open(out, encoding='utf-8'))['d']}
        except (ValueError, KeyError, TypeError): old = {}

    new, fails, streak = {}, 0, 0
    for k, u in enumerate(allowed):
        if (time.time() - started) / 60 > MAXMIN:
            print(f'tijdslimiet bereikt na {k} pagina\'s', file=sys.stderr); break
        try: html = get(u)
        except Blocked:
            print('dirk.nl weigert ons (403); gestopt zonder iets te omzeilen', file=sys.stderr); break
        p = parse(html) if html else None
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
    json.dump({'fetched': today, 'source': SITEMAP, 'd': rows}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'klaar: {len(new)} nieuw opgehaald, {len(rows)} in het bestand, {fails} pagina\'s zonder prijs, '
          f'{round((time.time() - started) / 60)} minuten', file=sys.stderr)

if __name__ == '__main__':
    main()
