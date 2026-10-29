"""Zet de app in elkaar: stijl + pagina + rekenmodule + prijsdata.

Gebruik:
  python3 -I assemble.py [--wrap] stijl.html pagina.html engine.js data.b64 uit.html [config.json]

--wrap      maakt er een volledige HTML-pagina van (voor de Android-app en de website).
config.json zet window.SLIM_CFG in de pagina (alleen de Android-app): adres voor dagelijkse updates enz.
"""
import sys, json

args = sys.argv[1:]
wrap = '--wrap' in args
args = [a for a in args if a != '--wrap']
css, body, eng, data, out = args[:5]
cfg = ''
if len(args) > 5:
    cfg = 'window.SLIM_CFG = ' + json.dumps(json.load(open(args[5], encoding='utf-8')), ensure_ascii=False) + ';'

head = open(css, encoding='utf-8').read()
page = open(body, encoding='utf-8').read()
page = page.replace('/*__CFG__*/', cfg).replace('/*__ENGINE__*/', open(eng, encoding='utf-8').read())
page = page.replace('__DATA__', open(data, encoding='utf-8').read().strip())
if wrap:
    html = ('<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<meta name="theme-color" content="#0D5C45">\n' + head + '\n</head>\n<body>\n' + page + '\n</body>\n</html>\n')
else:
    html = head + page
open(out, 'w', encoding='utf-8').write(html)
print(out, round(len(html) / 1e6, 2), 'MB')
