"""Controleert de nieuwe prijsdata voordat die de oude vervangt. Stopt met een foutmelding als de import half
mislukt lijkt; dan blijft de website de prijzen van gisteren tonen en stuurt GitHub een mail over de mislukte run.
Gebruik: python3 -I check.py nieuw.b64 oud.b64
"""
import base64, gzip, json, re, sys

MIN_PROMOS = 2000                         # normaal zijn het er rond de 12.000
MAX_CENTS = 1000000                       # de duurste echte producten kosten rond de 2.800 euro (AH, Lidl)
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
# de inhoud: een kapotte waarde hieronder zou de app of een link bij iedereen raken
for s in new['stores']:
    if not re.fullmatch(r'[a-z_]{2,20}', str(s['k'])): errors.append(f"vreemde winkelsleutel: {str(s['k'])[:30]!r}")
    if s['b'] and not s['b'].startswith('https://'): errors.append(f"{s['k']}: basisadres is geen https")
    if s['b'] and not s['b'].endswith('/'): errors.append(f"{s['k']}: basisadres eindigt niet op /")
    if any(not isinstance(p, int) or not 1 <= p <= MAX_CENTS for p in s['p']): errors.append(f"{s['k']}: prijs buiten bereik")
    if any(v and not re.fullmatch(r'(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])', str(v)) for v in s['pf'] + s['pv']): errors.append(f"{s['k']}: ongeldige datum")
    if s['r'] and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(s['f'])): errors.append(f"{s['k']}: ongeldige versheidsdatum")
# geen reden om te stoppen, wel om te melden: een winkel verliest veel gewone prijzen of valt terug op oudere data
if old is not None:
    ob = {s['k']: s for s in old['stores']}
    for s in new['stores']:
        o = ob.get(s['k'])
        if not o: continue
        if o['r'] >= 1000 and s['r'] < o['r'] * 0.5: print(f"::warning::{s['k']}: {s['r']} gewone prijzen, gisteren {o['r']}")
        if o.get('f') and s.get('f') and str(s['f']) < str(o['f']): print(f"::warning::{s['k']}: gewone prijzen terug van {o['f']} naar {s['f']}")
for e in errors: print('::error::' + e)
if errors: sys.exit(1)
print(f'prijsdata in orde: {total} acties van {sum(1 for v in pn.values() if v)} winkels')
