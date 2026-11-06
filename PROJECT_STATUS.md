# Projectstatus Slim Boodschappen

Stand: 5 november 2026, branch `livegang-voorbereiding`. Deze versie is nog niet live.

## Wat is het

Een gratis boodschappenvergelijker voor Nederlandse huishoudens. Je maakt een normale boodschappenlijst en de app rekent uit bij welke supermarkt of combinatie van supermarkten je het minst betaalt. Aanbiedingen zijn een extra voordeel, geen voorwaarde.

## Technologie

| Onderdeel | Keuze |
|---|---|
| App | Eén webpagina: HTML, CSS en JavaScript, zonder framework |
| Samenstellen | `web/assemble.py` voegt `web/style.html`, `web/body.html`, `web/engine.js` en de prijsdata samen |
| Rekenmodule | `web/engine.js`, werkt zonder pagina en is getest met `node --test tests/*.test.js` |
| Prijsverwerking | Python-scripts in `kit/` |
| Android | WebView-schil in `android/`, met ML Kit voor het lezen van een briefje |
| Hosting | GitHub Pages, APK via GitHub Releases |
| Automatisering | GitHub Actions: `dagelijks.yml` (prijzen en website), `apk.yml` (app) |
| Backend, database, accounts | Geen |
| Opslag bij de gebruiker | `localStorage` en in de Android-app de Cache API |

## Hoe prijzen binnenkomen

1. Elke ochtend haalt `kit/fetch_promos.py` de aanbiedingen op bij PrijsProfeet (zonder API-key).
2. Gewone prijzen komen uit de open data van Checkjebon. `kit/freshness.py` bepaalt per winkel hoe oud die zijn.
3. `kit/compact.py` maakt er één gecomprimeerd bestand van, en controleert links, hosts en datums.
4. `kit/check.py` stopt de update als de import half mislukt of de data niet klopt.
5. De website krijgt de nieuwe data; de Android-app haalt die zelf op.

## Rekenen

- `priceMatrix` bepaalt per product en winkel de prijs voor de gevraagde hoeveelheid, inclusief hele verpakkingen en meerstuksacties.
- `plan` zoekt de goedkoopste winkelset voor 1 tot 4 winkels; `advise` raadt een extra winkel alleen aan als die genoeg oplevert.
- `storeTotals` geeft per winkel het totaal en "x van y producten". Een ontbrekende prijs telt nooit als 0.
- `fairSaving` telt regels met een waarschuwing niet mee in de besparing.
- `searchRank` zet bij zoeken het losse product boven producten waar het woord alleen in voorkomt.

## Beperkingen

- De gewone prijzen van AH, PLUS, Dirk, Hoogvliet en DekaMarkt zijn ouder dan 92 dagen en doen standaard niet mee. Daardoor zijn totalen bij die winkels vaak onvolledig. Dit is de grootste inhoudelijke beperking van de vergelijking.
- Producten worden op naam vergeleken, niet op barcode: de gewone prijzen hebben geen barcodes.
- De Android-app is alleen gebouwd, niet op een telefoon getest met deze wijzigingen.

## Het team

De agents staan in `.claude/agents/` en zijn herbruikbaar. Een nieuwe sessie herkent ze automatisch.

| Agent | Taak | Mag wijzigen |
|---|---|---|
| `tech-lead` | Plannen, verdelen, beslissen, rapporteren | Ja |
| `full-stack-developer` | Bouwen en repareren | Ja |
| `security-engineer` | Onafhankelijke beveiligingscontrole | Alleen het eigen rapport |
| `privacy-compliance` | AVG, cookies, voorwaarden, juridische pagina's | `site/` en het eigen rapport |
| `qa-reviewer` | Testen en code nakijken | Nee |

Werkafspraken: elke push naar `main` gaat direct live, dus altijd op een werkbranch werken. Samenvoegen alleen na akkoord van de eigenaar.

## Documenten

`LIVEGANG_CHECKLIST.md` staat in de repository. `SECURITY_AUDIT.md`, `PRIVACY_AUDIT.md` en `OPENSTAANDE_PUNTEN.md` staan alleen lokaal in de projectmap, omdat de repository openbaar is.
