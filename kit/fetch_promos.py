"""Haalt alle lopende acties op bij PrijsProfeet (lijst-endpoint, zoals de API-voorwaarden toestaan).
Gebruik: python3 -I fetch_promos.py uitvoer.json
"""
import json, sys, time, urllib.request, urllib.error

BASE = 'https://www.prijsprofeet.nl/api/v1/products/promotional/all'
UA = 'SlimBoodschappen/0.1 (prototype; westraarnold@gmail.com)'
KEEP = ['product_id', 'name', 'brand', 'ean', 'price', 'original_price', 'quantity', 'unit', 'unit_price',
        'product_url', 'image_url', 'retailer', 'unified_category', 'promotion_status', 'promotion_type',
        'promotional_keywords', 'savings_percentage', 'multi_buy_quantity', 'multi_buy_price',
        'valid_from', 'valid_until', 'in_store_only', 'online_only', 'loyalty_price', 'loyalty_program', 'extracted_at']

def get(page, tries=4):
    url = f'{BASE}?page={page}&page_size=100'
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(int(e.headers.get('Retry-After', '20')) + 1); continue
            if t == tries - 1: raise
            time.sleep(5)
        except Exception:
            if t == tries - 1: raise
            time.sleep(5)

def main(out):
    first = get(1)
    total = first['total']; pages = (total + 99) // 100
    rows = list(first['products'])
    for p in range(2, pages + 1):
        time.sleep(2.1)                      # binnen 30 verzoeken per minuut blijven
        rows.extend(get(p)['products'])
        if p % 20 == 0: print(f'pagina {p}/{pages}', file=sys.stderr, flush=True)
    slim = [{k: r.get(k) for k in KEEP} for r in rows]
    json.dump({'fetched': time.strftime('%Y-%m-%dT%H:%M:%S'), 'total': total, 'rows': slim}, open(out, 'w'))
    print(f'{len(slim)} acties opgehaald (total {total})', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1])
