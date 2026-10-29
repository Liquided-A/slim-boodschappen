"""Vervangt alleen het databestand in de gepubliceerde pagina; de rest van de app blijft gelijk.
Gebruik: python3 -I splice.py pagina.html data.b64 nieuwe_pagina.html
"""
import sys, re
page, data, out = sys.argv[1:4]
h = open(page, encoding='utf-8').read()
start_tag = '<script type="text/plain" id="prijsdata">'
a = h.index(start_tag) + len(start_tag)
b = h.index('</script>', a)
new = h[:a] + open(data).read().strip() + h[b:]
assert new.count(start_tag) == 1
open(out, 'w', encoding='utf-8').write(new)
print('nieuwe pagina', round(len(new) / 1e6, 2), 'MB')
