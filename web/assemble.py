"""Zet de app in elkaar: stijl + pagina + rekenmodule + prijsdata.

Gebruik:
  python3 -I assemble.py [--wrap] stijl.html pagina.html engine.js data.b64 uit.html [config.json]

--wrap      maakt er een volledige HTML-pagina van (voor de Android-app en de website).
config.json zet window.SLIM_CFG in de pagina (alleen de Android-app): adres voor dagelijkse updates enz.
"""
import sys, json, re, base64, hashlib

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
raw = open(data, encoding='utf-8').read().strip()
if not re.fullmatch(r'[A-Za-z0-9+/=]+', raw):
    sys.exit('Fout: het databestand is geen geldige base64')
page = page.replace('__DATA__', raw)
if wrap:
    # CSP: alleen het script van deze build mag draaien. De hash hoort bij de tekst na alle vervangingen hierboven,
    # dus verander daarna niets meer aan het script en gebruik geen onclick= en dergelijke: dat wordt geblokkeerd.
    # Het prijzenblok is text/plain en valt er niet onder. Het lettertype zit als data-URI in de stijl.
    hashes = ' '.join("'sha256-" + base64.b64encode(hashlib.sha256(s.encode('utf-8')).digest()).decode() + "'"
                      for s in re.findall(r'<script>(.*?)</script>', head + page, re.S))
    csp = ("default-src 'none'; script-src " + hashes + "; style-src 'unsafe-inline'; font-src data:; "
           "img-src 'self' data: blob: https:; connect-src 'self' https://liquided-a.github.io https://api.github.com; "
           "base-uri 'none'; form-action 'none'")
    html = ('<!doctype html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n'
            '<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<meta name="description" content="Vergelijk je hele boodschappenlijstje bij de supermarkten in Nederland en zie waar je het minst betaalt, met de aanbiedingen van deze week.">\n'
            '<meta name="theme-color" content="#0E6278">\n' + head + '\n</head>\n<body>\n' + page + '\n</body>\n</html>\n')
else:
    html = head + page
open(out, 'w', encoding='utf-8').write(html)
print(out, round(len(html) / 1e6, 2), 'MB')
