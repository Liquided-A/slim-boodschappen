"""Bepaalt per winkel sinds wanneer de gewone prijzen in Checkjebon niet meer veranderd zijn.
Gebruik (in een clone met historie): python3 -I freshness.py <repo-dir> fresh.json
"""
import json, subprocess, sys, hashlib

repo, out = sys.argv[1], sys.argv[2]
log = subprocess.run(['git', '-C', repo, 'log', '--format=%h %cs', '--', 'data/supermarkets.json'],
                     capture_output=True, text=True).stdout.split('\n')
lines = [l.split() for l in log if l.strip()]

def snap(h):
    raw = subprocess.run(['git', '-C', repo, 'show', f'{h}:data/supermarkets.json'], capture_output=True).stdout
    try:
        return {s['n']: hashlib.md5(json.dumps(s['d'], sort_keys=True).encode()).hexdigest() for s in json.loads(raw) if s['d']}
    except Exception:
        return None

cur = snap(lines[0][0])
same = {k: lines[0][1] for k in cur}
done = set()
for h, d in lines[1::2]:                 # elke tweede versie is precies genoeg
    s = snap(h)
    if not s: continue
    for k in cur:
        if k in done: continue
        if s.get(k) == cur[k]: same[k] = d
        else: done.add(k)
    if len(done) == len(cur): break
json.dump(same, open(out, 'w'))
print('versheid:', same, file=sys.stderr)
