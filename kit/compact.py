"""Bouwt het compacte databestand voor de app: gewone prijzen (Checkjebon) + lopende acties (PrijsProfeet).
Gebruik: python3 -I compact.py supermarkets.json promos.json fresh.json uit.b64 [images.json] [fotolinks.json]
fotolinks.json onthoudt de productfoto's van de supermarkten (per winkel en productnummer). Elke dag komen er
nieuwe bij uit de aanbiedingen, zodat steeds meer producten uit het gewone assortiment ook een foto krijgen.
"""
import json, re, gzip, base64, sys, os

src, promof, freshf, out = sys.argv[1:5]
TILES = json.load(open(sys.argv[5]))['tiles'] if len(sys.argv) > 5 else {}
LINKF = sys.argv[6] if len(sys.argv) > 6 else None
LINKS = json.load(open(LINKF)) if LINKF and os.path.exists(LINKF) else {}   # winkel -> {productnummer: foto}

def small(u):
    """kleinere versie van de foto (ongeveer 200 pixels), zodat de app snel blijft"""
    if not u: return ''
    if 'static.ah.nl' in u: return re.sub(r'rendition=[^&]+', 'rendition=200x200_JPG', u)
    if 'jumbo.com/dam-images/fit-in/' in u: return re.sub(r'fit-in/\d+x\d+', 'fit-in/240x240', u)
    if 'images.ctfassets.net' in u: return u.split('?')[0] + '?h=200&w=200&fm=webp'
    if any(h in u for h in ('web-fileserver.dirk.nl', 'web-fileserver.dekamarkt.nl', 'images.poiesz-supermarkten.nl', 'static.hoogvliet.nl')):
        return u.split('?')[0] + '?width=200'
    if 'ekoplaza.nl/api/media' in u: return u.replace('.800x580.', '.200x145.')
    if 'scene7.com' in u: return u.split('?')[0] + '?wid=200&hei=200&fmt=webp'
    return u

def pid(k, link):
    """productnummer uit een productlink, zodat foto en product bij elkaar gezocht kunnen worden"""
    if not link: return ''
    if k == 'ah':
        m = re.search(r'wi\d+', link); return m.group(0) if m else ''
    if k == 'jumbo':
        m = re.search(r'(\d{3,}[A-Z]{2,5})(?:$|[/?#])', link); return m.group(1) if m else ''
    if k == 'hoogvliet':
        slug = link.rstrip('/').split('/')[-1]; return re.sub(r'-\d{6,}$', '', slug)
    m = re.findall(r'\d{4,}', link); return m[-1] if m else ''

def nkey(name): return re.sub(r'[^a-z0-9]+', ' ', name.lower()).strip()

cjb = json.load(open(src))
promos = json.load(open(promof))
FRESH = json.load(open(freshf))      # winkel -> datum waarop de gewone prijzen voor het laatst veranderden

UNITS = {'kg':('g',1000),'kilo':('g',1000),'kilogram':('g',1000),'g':('g',1),'gr':('g',1),'gram':('g',1),
         'l':('m',1000),'lt':('m',1000),'liter':('m',1000),'ltr':('m',1000),'ml':('m',1),'milliliter':('m',1),'cl':('m',10),'dl':('m',100),
         'stuks':('s',1),'stuk':('s',1),'st':('s',1)}
KIND = {'g':1,'m':2,'s':3}
num = r'(\d+(?:[.,]\d+)?)'
def parse_one(txt):
    t = txt.lower().replace('per ','').strip()
    m = re.search(r'(\d+)\s*[x×]\s*'+num+r'\s*([a-z]+)\b', t)
    mult = 1
    if m and m.group(3) in UNITS:
        mult = int(m.group(1)); val = float(m.group(2).replace(',','.')); u = m.group(3)
    else:
        m = re.search(num+r'\s*([a-z]+)\b', t)
        if not m or m.group(2) not in UNITS: return None
        val = float(m.group(1).replace(',','.')); u = m.group(2)
    k, f = UNITS[u]
    return KIND[k], round(val*f*mult, 2)
def parse(size, name):
    r = parse_one(size) if size else None
    if r is None:
        m = re.search(num+r'\s*(kg|g|gr|gram|ml|cl|l|liter)\b\s*$', name.lower())
        if m: r = parse_one(m.group(0))
    return r or (0, 0)

NAMES = {'ah':'AH','albert_heijn':'AH','jumbo':'Jumbo','lidl':'Lidl','plus':'PLUS','dirk':'Dirk','aldi':'ALDI','spar':'SPAR',
         'poiesz':'Poiesz','dekamarkt':'DekaMarkt','hoogvliet':'Hoogvliet','vomar':'Vomar','coop':'Coop','nettorama':'Nettorama',
         'ekoplaza':'Ekoplaza','boni':'Boni','dagwinkel':'Dagwinkel','mcd':'MCD','boons_markt':"Boon's Markt",'amazing_oriental':'Amazing Oriental'}
PPKEY = {'albert_heijn':'ah','gewoon_coop':'coop'}
CATS = ['zuivel-eieren','groente-fruit','vlees','vis','vega','kaas','brood-bakkerij','ontbijt','pasta-rijst-wereldkeuken',
        'soepen-conserven-sauzen','maaltijden','diepvries','snoep-koek-chips','koffie-thee','frisdrank','bier','wijn',
        'sterke-drank','bier-wijn-sterke-drank','baby-kind','huishouden','huidverzorging','haarverzorging','mondverzorging',
        'deodorant','drogisterij','gezondheid','huisdier','overig']
CI = {c:i for i,c in enumerate(CATS)}

stores = {}
def store(k):
    if k not in stores:
        stores[k] = {'k':k, 'c':NAMES.get(k, k), 'f':FRESH.get(k), 'b':'', 'n':[], 'p':[], 'q':[], 'u':[], 'l':[], 'r':0,
                     'po':[], 'pm':[], 'pp':[], 'pl':[], 'pf':[], 'pv':[], 'pc':[], 'pt':[], 'pi':[], 'im':[]}
    return stores[k]

# 0. foto's uit de aanbiedingen onthouden (productnummer en naam)
NAMEIMG = {}
for r in promos['rows']:
    k = PPKEY.get(r['retailer'], r['retailer']); u = small(r.get('image_url') or '')
    if not u: continue
    i = pid(k, r.get('product_url') or '')
    if i: LINKS.setdefault(k, {})[i] = u
    NAMEIMG.setdefault(k, {})[nkey(r['name'])] = u

# 1. gewone prijzen
for s in cjb:
    if not s['d']: continue
    st = store(s['n']); st['b'] = s['u']; seen = set()
    for p in s['d']:
        if p['p'] is None or p['p'] < 0.10: continue
        key = (p['n'].strip().lower(), round(p['p'],2), p.get('s',''))
        if key in seen: continue
        seen.add(key)
        u, q = parse(p.get('s',''), p['n'])
        st['n'].append(p['n'].strip()); st['p'].append(int(round(p['p']*100))); st['u'].append(u); st['q'].append(q); st['l'].append(p.get('l',''))
        img = LINKS.get(s['n'], {}).get(pid(s['n'], p.get('l', ''))) or NAMEIMG.get(s['n'], {}).get(nkey(p['n']), '')
        if not img and s['n'] == 'poiesz' and str(p.get('l', '')).isdigit():
            img = f"https://images.poiesz-supermarkten.nl/artikelen/{p['l']}.png?width=200"
        st['im'].append(img)
    st['r'] = len(st['n'])

# 2. acties
skipped = 0
for r in promos['rows']:
    k = PPKEY.get(r['retailer'], r['retailer'])
    price, orig = r['price'], r['original_price']
    if price is None or price < 0.05 or not r['name']: skipped += 1; continue
    if r['savings_percentage'] is not None and r['savings_percentage'] >= 70: skipped += 1; continue   # boven 70% is vrijwel altijd een datafout
    if not r['valid_until'] and (r['valid_from'] or '') < '2026-09-01': skipped += 1; continue
    st = store(k)
    u, q = parse(r['quantity'] or '', r['name'])
    kw = [w for w in (r['promotional_keywords'] or []) if w and w.upper() != 'ACTIE' and 'bezorging' not in w.lower()]
    label = kw[0] if kw else ''
    if r['loyalty_program']: label = (label + ' · ' if label else '') + 'met ' + r['loyalty_program']
    if r['in_store_only']: label = (label + ' · ' if label else '') + 'alleen in de winkel'
    name = r['name'].strip()
    if r['brand'] and not name.lower().startswith(r['brand'].lower()) and r['brand'].lower() not in ('ah','jumbo','plus','dirk','aldi','lidl'):
        name = r['brand'] + ' ' + name
    st['n'].append(name); st['p'].append(int(round(price*100))); st['u'].append(u); st['q'].append(q)
    st['l'].append(r['product_url'] or '')
    st['po'].append(int(round(orig*100)) if orig and orig > price else 0)
    st['pm'].append(r['multi_buy_quantity'] or 0)
    st['pp'].append(int(round(r['multi_buy_price']*100)) if r['multi_buy_price'] else 0)
    st['pl'].append(label)
    st['pf'].append((r['valid_from'] or '')[5:].replace('-',''))
    st['pv'].append((r['valid_until'] or '')[5:].replace('-',''))
    st['pc'].append(CI.get(r['unified_category'], CI['overig']))
    st['pt'].append(1 if r['promotion_status'] == 'upcoming' else 0)
    st['pi'].append(TILES.get(r.get('ean') or '', -1))
    st['im'].append(small(r.get('image_url') or ''))

order = ['ah','jumbo','lidl','plus','aldi','dirk','coop','spar','poiesz','dekamarkt','hoogvliet','vomar','nettorama','ekoplaza','boni','dagwinkel','mcd','boons_markt','amazing_oriental']
lst = [stores[k] for k in order if k in stores] + [v for k, v in stores.items() if k not in order]
for st in lst:
    print(f"{st['k']:16} gewoon {st['r']:6}  acties {len(st['n'])-st['r']:5}  vers {st['f']}", file=sys.stderr)
# fotolinks compact: het meest voorkomende begin van de links één keer per winkel ('ib')
for st in lst:
    urls = [u for u in st['im'] if u]
    if not urls: st['im'] = []; continue
    host = {}
    for u in urls:
        h = '/'.join(u.split('/')[:3]) + '/'; host[h] = host.get(h, 0) + 1
    top = max(host, key=host.get)
    pre = os.path.commonprefix([u for u in urls if u.startswith(top)])
    st['ib'] = pre
    st['im'] = [u[len(pre):] if u and u.startswith(pre) else ('!' + u if u else '') for u in st['im']]
if LINKF:
    json.dump(LINKS, open(LINKF, 'w'), separators=(',', ':'))
payload = {'cats': CATS, 'promoFetched': promos['fetched'], 'stores': lst}
raw = json.dumps(payload, separators=(',',':'), ensure_ascii=False).encode()
b64 = base64.b64encode(gzip.compress(raw, 9)).decode()
open(out,'w').write(b64)
print('winkelfoto\'s', sum(1 for st in lst for v in st['im'] if v), 'van', sum(len(st['n']) for st in lst), '| open food facts', sum(1 for st in lst for v in st['pi'] if v >= 0), '| overgeslagen acties', skipped, '| raw', len(raw), '| b64', len(b64), file=sys.stderr)
