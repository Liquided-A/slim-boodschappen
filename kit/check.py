"""Controleert de nieuwe prijsdata voordat die de oude vervangt. Stopt met een foutmelding als de import half
mislukt lijkt; dan blijft de website de prijzen van gisteren tonen en stuurt GitHub een mail over de mislukte run.
Gebruik: python3 -I check.py nieuw.b64 oud.b64
"""
import base64, gzip, json, sys

MIN_PROMOS = 2000                         # normaal zijn het er rond de 12.000
BIG = ['ah', 'jumbo', 'lidl', 'plus', 'dirk', 'aldi']

def load(path):
    try:
        return json.loads(gzip.decompress(base64.b64decode(open(path).read())))
    except Exception:
        return None

def promos(d):
    return {s['k']: len(s['n']) - s['r'] for s in d['stores']}

new, old = load(sys.argv[1]), load(sys.argv[2])
if new is None: sys.exit('::error::nieuwe prijsdata is onleesbaar')
pn = promos(new); total = sum(pn.values())
errors = []
if total < MIN_PROMOS: errors.append(f'maar {total} acties (minimaal {MIN_PROMOS})')
if old is not None:
    po = promos(old); was = sum(po.values())
    if total < was * 0.5: errors.append(f'{total} acties, gisteren {was}: meer dan de helft minder')
    for k in BIG:
        if po.get(k, 0) >= 100 and pn.get(k, 0) < 10: errors.append(f'{k}: {pn.get(k, 0)} acties, gisteren {po[k]}')
for e in errors: print('::error::' + e)
if errors: sys.exit(1)
print(f'prijsdata in orde: {total} acties van {sum(1 for v in pn.values() if v)} winkels')
