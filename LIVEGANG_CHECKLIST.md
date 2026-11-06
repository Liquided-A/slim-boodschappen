# Livegang-checklist Slim Boodschappen

Stand: 6 november 2026, branch `livegang-voorbereiding`. Deze versie staat nog niet live.

Statussen: Afgerond en gecontroleerd · [~] Gedeeltelijk afgerond · Nog niet afgerond · [!] Mijn input of toestemming nodig

## Functie

| Onderdeel | Status | Toelichting |
|---|---|---|
| Normale boodschappenlijst, ook zonder aanbieding | Afgerond en gecontroleerd | Zoeken toont aanbiedingen en gewone producten samen |
| Melding "Geen aanbieding" en banner weg | Afgerond en gecontroleerd | |
| Prijs onbekend | Afgerond en gecontroleerd | Product blijft staan, telt nooit als 0, totaal zegt dat het onvolledig is |
| Totaal per supermarkt | Afgerond en gecontroleerd | Met "x van y producten"; met de hand nagerekend |
| Goedkoopste combinatie | Afgerond en gecontroleerd | Gelijk aan zelf alle combinaties proberen |
| Productmatching | [~] Gedeeltelijk afgerond | Op naam en soortwoorden. Restfouten, zie onder |
| Volledigheid bij AH, PLUS, Dirk, Hoogvliet, DekaMarkt | [!] Mijn input of toestemming nodig | Gewone prijzen zijn verouderd en doen standaard niet mee |

## Juridisch

| Onderdeel | Status | Toelichting |
|---|---|---|
| Privacyverklaring | [!] Mijn input of toestemming nodig | Tekst klaar; naam en contact van de verantwoordelijke ontbreken |
| Cookiebeleid | Afgerond en gecontroleerd | `cookies.html` |
| Cookiebanner | Afgerond en gecontroleerd | Niet nodig: geen trackingcookies, alleen opslag voor wat de gebruiker vraagt. Wordt anders bij advertenties of affiliate |
| Contactpagina | [!] Mijn input of toestemming nodig | Bestaat, nu alleen met GitHub-meldingen. Eigen adres nodig |
| Gebruiksvoorwaarden | [!] Mijn input of toestemming nodig | Tekst klaar; identiteit ontbreekt |
| Uitleg over prijzen | Afgerond en gecontroleerd | `prijzen.html` |
| Bronvermelding PrijsProfeet | Afgerond en gecontroleerd | Onderaan elke app-weergave, met link |
| Voorwaarden PrijsProfeet | [!] Mijn input of toestemming nodig | Hun site weigert automatische toegang. Zelf controleren, drie vragen voorleggen |
| Juridische toets | [!] Mijn input of toestemming nodig | Teksten zijn niet door een jurist bekeken |

## Beveiliging en techniek

| Onderdeel | Status | Toelichting |
|---|---|---|
| Geen geheimen in de bestanden | Afgerond en gecontroleerd | Alleen de oude, vervangen sleutel staat nog in de historie |
| Geen API-key in frontend | Afgerond en gecontroleerd | PrijsProfeet gebruikt geen key |
| Backend, database, login | Afgerond en gecontroleerd | Bestaan niet |
| XSS en Content-Security-Policy | Afgerond en gecontroleerd | Getest met vergiftigde data; niet op een echte telefoon |
| Controle externe data | Afgerond en gecontroleerd | Links, hosts, datums, prijzen |
| Actions op vaste versie, sleutel alleen op main | [~] Gedeeltelijk afgerond | Workflow klaar; `uitbrengen` en de dagelijkse run zijn nog niet echt gedraaid |
| Environment en regels op GitHub | [!] Mijn input of toestemming nodig | Na samenvoegen, zie `OPENSTAANDE_PUNTEN.md` |
| Google Fonts weg | Afgerond en gecontroleerd | Lettertype is ingebakken |
| Hosting en logs | [~] Gedeeltelijk afgerond | GitHub noemt geen bewaartermijn voor Pages-logs |
| Sitemap en metadata | Afgerond en gecontroleerd | `robots.txt` kan niet in een submap; pas bij een eigen domein |
| Automatische tests | Afgerond en gecontroleerd | 92 tests |
| Mobiel en desktop | [~] Gedeeltelijk afgerond | Getest op 375 en 1280 px in Edge; geen echte telefoon, Safari of Firefox |
| Android-app | Nog niet afgerond | Bouwt, maar is niet op een telefoon getest. CSP, scannen en inspreken eerst proberen |
| Snelheid | [~] Gedeeltelijk afgerond | Na het laden vlot; direct na openen kan zoeken op een trage telefoon lang duren. Toont "Zoeken…" |

## Bekende restfouten

- `honing` en `tonijn` kunnen op een verkeerd product uitkomen als goedkoopste (pinda's met honing, kattenvoer). De soortwoordenlijst blijft een benadering zolang gewone prijzen geen categorie hebben.
- `boter 1 kg` kan bij een winkel een taartje met roomboter kiezen.
- Bij `komkommer` kan een product zonder formaat grijs blijven.
- Besparing wijkt in zeldzame gevallen enkele centen af (ongeveer 1% van de geteste lijstjes).
- 9 regels in de brondata hebben de bundelprijs als stukprijs ("2 VOOR 1.-").
- `pindakaas zonder suiker` geeft geen resultaat, wel de knop om het op de lijst te zetten.
