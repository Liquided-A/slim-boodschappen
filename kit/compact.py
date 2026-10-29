"""Bouwt het compacte databestand voor de app: gewone prijzen (Checkjebon) + lopende acties (PrijsProfeet).
Gebruik: python3 -I compact.py supermarkets.json promos.json fresh.json uit.b64 [images.json]
"""
import json, re, gzip, base64, sys

src, promof, freshf, out = sys.argv[1:5]
TILES = json.load(open(sys.argv[5]))['tiles'] if len(sys.argv) > 5 else {}
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
                     'po':[], 'pm':[], 'pp':[], 'pl':[], 'pf':[], 'pv':[], 'pc':[], 'pt':[], 'pi':[]}
    return stores[k]

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

order = ['ah','jumbo','lidl','plus','aldi','dirk','coop','spar','poiesz','dekamarkt','hoogvliet','vomar','nettorama','ekoplaza','boni','dagwinkel','mcd','boons_markt','amazing_oriental']
lst = [stores[k] for k in order if k in stores] + [v for k, v in stores.items() if k not in order]
for st in lst:
    print(f"{st['k']:16} gewoon {st['r']:6}  acties {len(st['n'])-st['r']:5}  vers {st['f']}", file=sys.stderr)
payload = {'cats': CATS, 'promoFetched': promos['fetched'], 'stores': lst}
raw = json.dumps(payload, separators=(',',':'), ensure_ascii=False).encode()
b64 = base64.b64encode(gzip.compress(raw, 9)).decode()
open(out,'w').write(b64)
print('foto\'s gekoppeld', sum(1 for st in lst for v in st['pi'] if v >= 0), '| overgeslagen acties', skipped, '| raw', len(raw), '| b64', len(b64), file=sys.stderr)
