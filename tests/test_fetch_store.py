"""Tests voor kit/fetch_store.py zonder internet: zelfgemaakte pagina's in de vorm van ALDI, Vomar en Poiesz.
Draaien: python -I tests/test_fetch_store.py
"""
import json, os, sys, unittest, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
ARGV, sys.argv = sys.argv, ['fetch_store.py', 'poiesz', os.path.join(HERE, 'bestaat-niet.json')]   # het script leest argumenten bij het laden
spec = importlib.util.spec_from_file_location('fetch_store', os.path.join(HERE, '..', 'kit', 'fetch_store.py'))
F = importlib.util.module_from_spec(spec); spec.loader.exec_module(F)
sys.argv = ARGV

def aldi_page(product):
    api = json.dumps([['PRODUCT_DETAIL_GET', {'res': {'products': [product]}}]])
    return '<script id="__NEXT_DATA__" type="application/json">' + json.dumps({'props': {'pageProps': {'apiData': api}}}) + '</script>'

def nuxt3_page(data):
    """zoals Nuxt 3 het doet: alles in één platte lijst, verwijzingen zijn plaatsnummers"""
    d = [['Reactive', 1]]
    def enc(o):
        i = len(d); d.append(None)
        d[i] = {k: enc(v) for k, v in o.items()} if isinstance(o, dict) else [enc(v) for v in o] if isinstance(o, list) else o
        return i
    enc({'data': data})
    return '<script type="application/json" id="__NUXT_DATA__">' + json.dumps(d) + '</script>'

def poiesz_page(items, page=1, pages=1):
    return nuxt3_page({'subsubcat-products-kaas': {'items': items, 'paging': {'page': page, 'pages': pages}}})

UUID = '0123abcd-0123-0123-0123-0123456789ab'
VOMAR = ('<a href="/producten/vers/kaas/jong-belegen/111111">x</a><a href="/producten/vers/kaas/oud/222222">y</a>'
         '<script>window.__NUXT__=(function(a,b,c){return {data:[{mainGroupProducts:['
         '{id:"' + UUID + '",articleNumber:111111,description:"Jonge kaas",contents:a,unit:"gram",price:4.29,x:1},'
         '{id:"' + UUID + '",articleNumber:222222,description:b,contents:"6",unit:"stuks",price:c,x:1},'
         '{id:"' + UUID + '",articleNumber:333333,description:"Zonder link",contents:"1",unit:"stuks",price:1.5,x:1}'
         ']}]}}(350,"Oude kaas",null));</script>')

class Aldi(unittest.TestCase):
    base = {'name': 'Breekbrood kaas', 'brandName': 'DE AFBAKKER', 'productSlug': 'breekbrood-kaas-1240878', 'salesUnit': '370 g'}
    def test_gewone_prijs(self):
        p = F.next_aldi(aldi_page(dict(self.base, currentPrice={'priceValue': 2.49})))
        self.assertEqual(p, {'l': 'breekbrood-kaas-1240878', 'n': 'De Afbakker Breekbrood kaas', 's': '370 g', 'p': 2.49})
    def test_actie_en_op_is_op_overslaan(self):
        self.assertIsNone(F.next_aldi(aldi_page(dict(self.base, currentPrice={'priceValue': 1.99, 'strikePrice': 2.49}))))
        self.assertIsNone(F.next_aldi(aldi_page(dict(self.base, currentPrice={'priceValue': 0.59, 'priceTagLabels': {'promoText1': 'OP=OP'}}))))
    def test_geen_prijs_is_niet_nul(self):
        self.assertIsNone(F.next_aldi(aldi_page(self.base)))
        self.assertIsNone(F.next_aldi(aldi_page(dict(self.base, currentPrice={'priceValue': 0}))))
        self.assertIsNone(F.next_aldi('<html>geen data</html>'))

class Vomar(unittest.TestCase):
    def test_groepspagina(self):
        rows, nxt = F.vomar_group(VOMAR)
        self.assertIsNone(nxt)
        # 222222 heeft geen prijs (null) en 333333 geen productlink: allebei weg, niet als 0
        self.assertEqual(rows, [{'l': 'vers/kaas/jong-belegen/111111', 'n': 'Jonge kaas', 's': '350 gram', 'p': 4.29}])
    def test_kapotte_pagina(self):
        self.assertEqual(F.vomar_group('<script>window.__NUXT__=(function(a){return {}}(onzin));</script>'), ([], None))

class Poiesz(unittest.TestCase):
    def test_lijst_en_vervolgpagina(self):
        rows, nxt = F.poiesz_list(poiesz_page([
            {'id': 1, 'name': 'Goudse kaas', 'price': 3.99, 'packageDescription': '500.00 Gram'},
            {'id': 2, 'name': 'Actiekaas', 'price': 2.0, 'strikeThroughPrice': 3.0, 'packageDescription': '1 Stuks'},
            {'id': 3, 'name': 'Zonder prijs', 'price': None, 'packageDescription': '1 Stuks'},
            {'id': 4, 'name': 'Wijn', 'price': 4.29, 'packageDescription': '0.75 Liter'}], page=1, pages=3))
        self.assertEqual(nxt, 2)
        self.assertEqual(rows, [{'l': '1', 'n': 'Goudse kaas', 's': '500 g', 'p': 3.99}, {'l': '4', 'n': 'Wijn', 's': '0.75 l', 'p': 4.29}])
        self.assertIsNone(F.poiesz_list(poiesz_page([], page=3, pages=3))[1])
    def test_indeling(self):
        tree = [{'url': 'zuivel', 'subCategories': [{'url': 'kaas', 'subSubCategories': [{'url': 'jong'}, {'url': '../x'}]}]}]
        pages = F.poiesz_pages(lambda u: nuxt3_page({'boodschappen-main-categories': tree}))
        self.assertEqual(pages, ['https://webwinkel.poiesz-supermarkten.nl/boodschappen/zuivel/kaas/jong'])

class Lijstpaginas(unittest.TestCase):
    """from_lists: volgt vervolgpagina's, maar nooit meer dan 50 per lijst en 2000 lijsten"""
    def run_lists(self, urls, get):
        class RP:
            def can_fetch(self, ua, u): return True
        calls = []
        F.CFG = {'pages': lambda fetch: urls, 'list': F.poiesz_list, 'base': 'x'}
        F.get = lambda u: calls.append(u) or get(u)
        F.DELAY, F.LIMIT, F.MAXMIN = 0, 0, 999.0
        old, new, fails = F.from_lists(RP(), F.time.time(), '2026-11-08')
        return calls, new
    def test_vervolgpaginas(self):
        def get(u):
            page = int(u.split('page=')[1]) if 'page=' in u else 1
            return poiesz_page([{'id': page, 'name': f'Kaas {page}', 'price': 1.0 + page, 'packageDescription': '1 Stuks'}], page, 3)
        calls, new = self.run_lists(['https://a/b/c'], get)
        self.assertEqual(calls, ['https://a/b/c', 'https://a/b/c?page=2', 'https://a/b/c?page=3'])
        self.assertEqual(sorted((p['l'], p['p'], p['t']) for p in new.values()), [('1', 2.0, '2026-11-08'), ('2', 3.0, '2026-11-08'), ('3', 4.0, '2026-11-08')])
    def test_grenzen(self):
        def eindeloos(u):
            page = int(u.split('page=')[1]) if 'page=' in u else 1
            return poiesz_page([{'id': 1, 'name': 'Kaas', 'price': 2.0, 'packageDescription': '1 Stuks'}], page, 10**6)
        calls, _ = self.run_lists(['https://a/b/c'], eindeloos)
        self.assertEqual(len(calls), 50)
        # winkel negeert ?page= en zegt steeds 'pagina 1 van veel': niet blijven hangen
        vast = lambda u: poiesz_page([{'id': 1, 'name': 'Kaas', 'price': 2.0, 'packageDescription': '1 Stuks'}], 1, 10**6)
        calls, _ = self.run_lists(['https://a/b/c'], vast)
        self.assertEqual(calls, ['https://a/b/c', 'https://a/b/c?page=2'])
        een = lambda u: poiesz_page([{'id': 1, 'name': 'Kaas', 'price': 2.0, 'packageDescription': '1 Stuks'}])
        calls, _ = self.run_lists([f'https://a/b/{i}' for i in range(2500)], een)
        self.assertEqual(len(calls), 2000)

if __name__ == '__main__':
    unittest.main()
