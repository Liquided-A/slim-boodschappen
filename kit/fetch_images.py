"""Zoekt productfoto's op bij Open Food Facts (per barcode, binnen hun limiet van 100 per minuut),
downloadt kleine versies en bundelt ze in fotobladen van 10 x 10 (img/sN.jpg).
Bestaande foto's (images.json) worden hergebruikt; alleen nieuwe barcodes worden opgezocht.
Gebruik: python3 -I fetch_images.py promos.json images.json img_dir [max_nieuw]
"""
import json, sys, os, time, io, urllib.request, urllib.error
from PIL import Image

promof, mapf, imgdir = sys.argv[1:4]
max_new = int(sys.argv[4]) if len(sys.argv) > 4 else 100000
UA = {'User-Agent': 'SlimBoodschappen/0.1 (westraarnold@gmail.com)'}
NONFOOD = {'huishouden', 'huidverzorging', 'haarverzorging', 'mondverzorging', 'deodorant', 'drogisterij', 'gezondheid', 'huisdier'}
TILE, GRID = 120, 10

# images.json: {"tiles": {ean: index}, "miss": {ean: datum}, "sheets": n, "next": index}
state = json.load(open(mapf)) if os.path.exists(mapf) else {'tiles': {}, 'miss': {}, 'next': 0}
rows = json.load(open(promof))['rows']
wanted = []
for r in rows:
    e = r.get('ean')
    if not e or not e.isdigit() or r.get('unified_category') in NONFOOD: continue
    if e in state['tiles'] or e in state['miss'] or e in wanted: continue
    wanted.append(e)
wanted = wanted[:max_new]
print(f'{len(wanted)} nieuwe barcodes om op te zoeken', file=sys.stderr, flush=True)

def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

os.makedirs(imgdir, exist_ok=True)
# veiligheidscheck: het laatste, deels gevulde fotoblad moet lokaal aanwezig zijn, anders zouden bestaande foto's verdwijnen
_n, _pos = divmod(state['next'], GRID * GRID)
if _pos and not os.path.exists(os.path.join(imgdir, f's{_n}.jpg')):
    sys.exit(f'Fout: img/s{_n}.jpg ontbreekt lokaal; haal die eerst op uit de artifact. Gestopt zonder iets te veranderen.')
sheets = {}
touched = set()
def sheet(n):
    if n not in sheets:
        p = os.path.join(imgdir, f's{n}.jpg')
        sheets[n] = Image.open(p).convert('RGB') if os.path.exists(p) else Image.new('RGB', (TILE * GRID, TILE * GRID), 'white')
    return sheets[n]

found = 0
for k, e in enumerate(wanted):
    t0 = time.time()
    try:
        d = json.loads(get(f'https://world.openfoodfacts.org/api/v2/product/{e}?fields=image_front_small_url'))
        url = (d.get('product') or {}).get('image_front_small_url') if d.get('status') == 1 else None
    except urllib.error.HTTPError as err:
        url = None
        if err.code == 429: time.sleep(30)
    except Exception:
        url = None
    if url:
        try:
            im = Image.open(io.BytesIO(get(url))).convert('RGB')
            im.thumbnail((TILE - 8, TILE - 8))
            idx = state['next']; n, pos = divmod(idx, GRID * GRID)
            sh = sheet(n); x, y = (pos % GRID) * TILE, (pos // GRID) * TILE
            sh.paste((255, 255, 255), (x, y, x + TILE, y + TILE))
            sh.paste(im, (x + (TILE - im.width) // 2, y + (TILE - im.height) // 2))
            state['tiles'][e] = idx; state['next'] = idx + 1; found += 1; touched.add(n)
        except Exception:
            state['miss'][e] = time.strftime('%Y-%m-%d')
    else:
        state['miss'][e] = time.strftime('%Y-%m-%d')
    if (k + 1) % 200 == 0:
        for n, sh in sheets.items(): sh.save(os.path.join(imgdir, f's{n}.jpg'), quality=78, optimize=True)
        json.dump(state, open(mapf, 'w'))
        print(f'{k + 1}/{len(wanted)} opgezocht, {found} foto\'s', file=sys.stderr, flush=True)
    time.sleep(max(0, 0.65 - (time.time() - t0)))     # onder de 100 per minuut blijven

for n, sh in sheets.items(): sh.save(os.path.join(imgdir, f's{n}.jpg'), quality=78, optimize=True)
state['sheets'] = (state['next'] + GRID * GRID - 1) // (GRID * GRID)
json.dump(state, open(mapf, 'w'))
open(os.path.join(imgdir, 'gewijzigd.txt'), 'w').write('\n'.join(f'img/s{n}.jpg' for n in sorted(touched)))
print(f'klaar: {found} nieuwe foto\'s, totaal {len(state["tiles"])}, {state["sheets"]} fotobladen', file=sys.stderr)
