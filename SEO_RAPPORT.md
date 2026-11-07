# SEO-rapport Bespaar op je boodschap

Stand: 7 november 2026. Werkbranch `seo`. Nog niet live.

## 1. Wat er onderzocht is

**De eigen website**
- Alle pagina's in `site/` en de app (`app.html`).
- Titels, beschrijvingen, koppen, canonical-links, sitemap en robots.txt.
- Gestructureerde gegevens, interne links, weergave op mobiel en laadgewicht.

**Concurrenten** (alleen hun openbare homepages gelezen, niets overgenomen)
- **Allesupers.nl:** catalogus per supermarkt, onderzoekspagina's (inflatie, krimpflatie, prijsmonitor), bespaartips, FAQ met gestructureerde gegevens en een voorbeeldmandje op de homepage.
- **Spaartje.com:** pagina per supermarkt, pagina's als "AH vs Jumbo", een pagina "goedkoopste supermarkt", een blog en een pagina "hoeveel besparen".
- **Supermarktscanner.nl:** "live prijzen", de claim "bespaar tot wel €30 per week" en een pagina over hoe ze data verzamelen.
- **Checkjebon.nl:** nauwelijks SEO; de pagina wordt pas in de browser opgebouwd.

**Zoekwoorden:** de lijst uit de opdracht is als uitgangspunt gebruikt. Zoekvolumes heb ik niet kunnen meten; daarvoor is Google Search Console nodig (zie 7).

## 2. Gevonden problemen

| Probleem | Ernst |
|---|---|
| Geen eigen domein: robots.txt kan alleen in de hoofdmap van een domein staan, dus nu werkt hij niet | hoog |
| Maar 8 pagina's, geen pagina per zoekintentie (goedkoopste supermarkt, aanbiedingen, vergelijken, besparen) | hoog |
| Homepage ging vooral over installeren; de H1 was alleen de merknaam | hoog |
| Bijna geen interne links tussen de pagina's, alleen een voettekst | middel |
| Sitemap met de hand gemaakt, zonder datum; vaste adressen op elke pagina | middel |
| De app (`app.html`) had geen canonical en geen deelgegevens | middel |
| Geen 404-pagina | laag |
| De app is ruim 4 MB (de prijsdata zit erin) en zwaar voor Core Web Vitals; de nieuwe informatiepagina's zijn juist licht | middel |
| De app heeft meerdere H1's (één per scherm) | laag |

**Belangrijke vondst bij de pagina "goedkoopste supermarkt".** De automatische productkoppeling van de app is niet betrouwbaar genoeg voor een uitspraak als "deze winkel is het goedkoopst". Bij de eerste versie wisselde de "winnaar" tussen Jumbo, Lidl en SPAR, afhankelijk van één instelling. Er kwamen verkeerde producten in: stroopwafels als roomboter, vochtig toiletpapier, geraspte kaas en een kindermaaltijd met kipfilet.

Daarom heeft elk product in het mandje nu vaste regels voor wat wel en niet meetelt. Verpakkingen worden omgerekend naar dezelfde hoeveelheid, en producten die niet eerlijk te vergelijken zijn, zijn eruit gehaald (bananen per stuk tegen per tros, toiletpapier per 4 tegen per 8 rollen). Zo blijft de vergelijking objectief; dat is ook juridisch belangrijk bij vergelijkende reclame.

## 3. Uitgevoerde verbeteringen

**Technisch**
- `kit/seo_build.js` bouwt de website elke ochtend opnieuw, met de prijzen van die dag. Hij:
  - vult het adres van de site in (`{{SITE}}`) en zet de gedeelde navigatie en voettekst op elke pagina;
  - maakt een sitemap met datums, en een robots.txt;
  - zet in de app een canonical-link en deelgegevens.
- Een eigen domein wordt één instelling: de variabele `SITE_URL` (zie 7).
- Elke pagina heeft een eigen titel (maximaal 62 tekens), een eigen beschrijving (maximaal 160 tekens), precies één H1 en een canonical-link.
- Gestructureerde gegevens:
  - homepage: WebSite, Organization, WebApplication en FAQPage;
  - inhoudspagina's: BreadcrumbList;
  - "boodschappen vergelijken": HowTo;
  - bespaartips: Article.
  
  Er staan geen verzonnen beoordelingen of sterren in.
- Navigatie op elke pagina (kop en voet) met beschrijvende linkteksten. De huidige pagina is gemarkeerd.
- Een 404-pagina met links naar de belangrijkste onderdelen.
- Alle 274 interne links gecontroleerd: geen kapotte links.
- Op mobiel gecontroleerd (375 pixels breed): geen horizontaal scrollen. Brede tabellen scrollen binnen hun eigen vak.
- Een automatische test (`tests/seo.test.js`) bewaakt bij elke wijziging:
  - geen lege plekken in de pagina's;
  - één H1 per pagina en unieke titels;
  - een canonical-link en een beschrijving van de juiste lengte;
  - een sitemap zonder de 404-pagina.

**Inhoud**
- Een nieuwe homepage met de hoofdboodschap "Ontdek waar jouw boodschappen het goedkoopst zijn" en "Vergelijk slim. Betaal minder." Erop staan:
  - hoe het werkt;
  - het verschil met alleen aanbiedingen vergelijken;
  - per supermarkt wat we vergelijken (elke dag bijgewerkt);
  - bespaartips, de installatie-uitleg en een FAQ.
- De samenvatting op de homepage en de tabellen met prijzen worden elke dag uit de echte prijzen gemaakt.

## 4. Pagina's

| Pagina | Status | Zoekintentie |
|---|---|---|
| `/` (index.html) | herschreven | supermarktprijzen vergelijken, goedkoopste boodschappen |
| `goedkoopste-supermarkt.html` | **nieuw**, elke dag berekend | welke supermarkt is het goedkoopst |
| `supermarkt-aanbiedingen.html` | **nieuw**, elke dag bijgewerkt | supermarkt aanbiedingen deze week |
| `boodschappen-vergelijken.html` | **nieuw** | boodschappen vergelijken, boodschappenlijst vergelijken |
| `besparen-op-boodschappen.html` | **nieuw** | besparen op boodschappen, goedkoop boodschappen doen, bespaartips |
| `404.html` | **nieuw**, niet in de sitemap | – |
| over, prijzen, privacy, cookies, voorwaarden, contact | navigatie, voettekst en adres aangepast | betrouwbaarheid en transparantie |

**Bewust niet gemaakt**
- **Een aparte pagina "goedkoop boodschappen doen".** Die zou bijna hetzelfde zijn als "besparen op boodschappen" (dubbele inhoud); beide zoekwoorden staan nu op één sterke pagina.
- **Pagina's per supermarkt.** Van AH, PLUS en Vomar hebben we geen actuele gewone prijzen. Een pagina "Albert Heijn" met alleen aanbiedingen zou dun zijn en de belofte niet waarmaken. Zie vervolgstappen.

## 5. Betrouwbaarheid en transparantie

- Op de pagina "goedkoopste supermarkt":
  - de datum;
  - per product welk product we per winkel hebben gekozen, met "omgerekend" en "actie" erbij;
  - welke winkels niet meedoen en waarom;
  - de rekenregels.
- Is het verschil met de nummer twee kleiner dan 5%, dan zegt de pagina dat er ook bij. Vandaag scheelt het maar € 0,74 tussen Jumbo en SPAR.
- Geen beloftes als "bespaar tot € 30 per week": dat kunnen we niet onderbouwen.
- De pagina "hoe we prijzen vergelijken" (prijzen.html) legt al uit:
  - waar de prijzen vandaan komen en wanneer ze worden bijgewerkt;
  - waarom ze kunnen afwijken;
  - hoe we producten koppelen.

## 6. Waar we ons kunnen onderscheiden van concurrenten

- **Verdelen over winkels:** de app rekent uit of 1, 2, 3 of 4 winkels het goedkoopst is, met een drempel die je zelf instelt.
- **Eerlijk over ontbrekende gegevens:** geen € 0 bij een onbekende prijs, en geen oude prijzen in de vergelijking.
- **Toegankelijk:** grote letters en grote knoppen.
- **Privacy:** geen account, geen tracking en geen reclame.
- **Een transparante dagelijkse mandjevergelijking per product.** Concurrenten tonen vooral een uitkomst, niet hoe die tot stand komt.

## 7. Wat jouw aandacht nodig heeft

1. **Het domein vastleggen:** bespaaropjeboodschap.nl bestond op 7 november nog niet. Na registratie:
   - zet je bij de domeinverkoper de DNS-gegevens (ik geef je de precieze waarden);
   - voeg ik een CNAME-bestand toe;
   - zet je in GitHub bij Settings > Pages het eigen domein en "Enforce HTTPS" aan;
   - zet je in GitHub bij Settings > Secrets and variables > Actions > Variables de variabele `SITE_URL` op `https://www.bespaaropjeboodschap.nl/`.
   
   Pas dan werken robots.txt en de canonical-links goed.
2. **Google Search Console:** maak een account en voeg het domein toe (bevestigen via DNS), en meld daar `sitemap.xml` aan. Hiermee zie je vertoningen, klikken, positie en CTR per zoekwoord, en welke pagina's in Google staan.
3. **Google Analytics 4:** niet ingebouwd. GA4 plaatst cookies en vraagt dan om een cookiemelding en toestemming (AVG), en de site belooft nu "geen tracking". Search Console geeft zonder cookies al de belangrijkste SEO-cijfers. Wil je toch bezoekers meten, overweeg dan een cookieloze, privacyvriendelijke teller. Dat is jouw keuze; daarna pas ik de privacyverklaring aan.
4. **Juridisch:** de mandjevergelijking noemt supermarkten bij naam (vergelijkende reclame). De vergelijking is objectief en per product controleerbaar opgezet, maar laat dit bij commercieel gebruik toetsen.
5. **Hosting:** GitHub Pages is niet bedoeld voor commerciële sites. Bij advertenties of affiliate is andere hosting nodig.

## 8. Vervolgstappen met de grootste kansen

1. **Eigen domein + Search Console.** Zonder deze twee kan Google de site nauwelijks goed vinden en kunnen we niets meten.
2. **Pagina's per supermarkt** (te beginnen met Jumbo, Dirk, Lidl, Hoogvliet en DekaMarkt, waarvan we actuele prijzen hebben):
   - aantal acties en grootste kortingen;
   - plaats in het dagelijkse mandje;
   - prijsontwikkeling.
   
   Dat is unieke inhoud uit eigen data.
3. **Vergelijkingspagina's "Jumbo vs Lidl"** enzovoort, met het mandje per paar winkels. Daar wordt veel op gezocht, en concurrent Spaartje heeft ze ook.
4. **Prijsontwikkeling bijhouden:** de dagelijkse mandjeprijs opslaan, zodat een grafiek "wat kost ons mandje per maand" ontstaat. Dat is goed voor artikelen als "hoeveel kun je besparen", met eigen cijfers in plaats van beweringen.
5. **Artikelen uit de opdracht.** De volgende passen al grotendeels in de bestaande pagina's of komen als de cijfers er zijn:
   - "Is Aldi of Lidl goedkoper?";
   - "Is het goedkoper bij meerdere supermarkten?";
   - "Hoe vergelijk je eerlijk?".
   
   Schrijf ze pas als er genoeg data is om ze te onderbouwen.
6. **Meer winkels met actuele gewone prijzen** (Vomar, ALDI). Hoe meer winkels in het mandje, hoe sterker de pagina "goedkoopste supermarkt".
7. **De app lichter maken:** de prijsdata los laden in plaats van in de pagina. Dat is goed voor laadsnelheid en Core Web Vitals.

## Onderhoud

- De regels per product in het mandje staan in `kit/seo_build.js` (`BASKET`).
- Bekijk de per-product-tabel op de pagina "goedkoopste supermarkt" af en toe. Staat er een vreemd product tussen, dan is één regel aanpassen genoeg.
- Lokaal bouwen: `node kit/seo_build.js data/data.b64 site uitmap https://adres/`
