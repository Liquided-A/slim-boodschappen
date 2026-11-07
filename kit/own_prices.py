"""Zet zelf opgehaalde gewone prijzen in de plaats van die van Checkjebon, als ze recenter en compleet genoeg zijn.

Gebruik: python3 -I own_prices.py supermarkets.json fresh.json winkel=bestand.json [winkel=bestand.json ...]
Past supermarkets.json en fresh.json ter plekke aan. Prijzen ouder dan 14 dagen tellen niet mee;
zijn er dan minder dan 1000 over, dan blijven de prijzen van Checkjebon staan.
"""
import json, sys, datetime

src, freshf, pairs = sys.argv[1], sys.argv[2], sys.argv[3:]
cjb = json.load(open(src, encoding='utf-8'))
fresh = json.load(open(freshf, encoding='utf-8'))
cut = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()

for pair in pairs:
    k, f = pair.split('=', 1)
    try: own = json.load(open(f, encoding='utf-8'))
    except (OSError, ValueError) as e:
        print(f'{k}: eigen prijzen niet te lezen ({e}); Checkjebon blijft', file=sys.stderr); continue
    rows = [{'n': p['n'], 'l': p['l'], 'p': p['p'], 's': p.get('s', '')} for p in own.get('d', [])
            if isinstance(p, dict) and p.get('t', '') >= cut and isinstance(p.get('p'), (int, float)) and p.get('n')]
    if len(rows) < 1000:
        print(f'{k}: maar {len(rows)} recente eigen prijzen; Checkjebon blijft', file=sys.stderr); continue
    st = next((s for s in cjb if s.get('n') == k), None)
    if st is None:
        print(f'{k}: winkel niet in Checkjebon; overgeslagen', file=sys.stderr); continue
    before = len(st.get('d') or [])
    st['d'] = rows
    newest = max(p['t'] for p in own['d'] if p.get('t', '') >= cut)
    fresh[k] = newest
    print(f'{k}: {len(rows)} eigen prijzen (was {before} uit Checkjebon), bijgewerkt {newest}', file=sys.stderr)

json.dump(cjb, open(src, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(fresh, open(freshf, 'w', encoding='utf-8'))
