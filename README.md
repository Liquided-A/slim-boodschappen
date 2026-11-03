# Slim Boodschappen

Alle aanbiedingen van de Nederlandse supermarkten op één plek, met een boodschappenlijstje dat uitrekent
of het loont om bij 1, 2, 3 of 4 winkels te halen. Android-app + website.

**Downloaden:** https://liquided-a.github.io/slim-boodschappen/

## Hoe het werkt
- `web/`: de app zelf (één pagina: `style.html`, `body.html`, `engine.js`). `assemble.py` zet alles in elkaar.
- `android/`: een kleine Android-app die de pagina toont en een foto van een briefje leest met
  Google ML Kit (op de telefoon zelf, gratis, zonder account).
- `kit/`: scripts die de prijzen ophalen (PrijsProfeet-API, Checkjebon open data, foto's van Open Food Facts).
- `data/`: productfoto's (fotobladen van 10 × 10) en de laatst bekende prijsdata.
- `site/`: de downloadpagina.

## Automatisch
- **Prijzen bijwerken en website publiceren** (`.github/workflows/dagelijks.yml`): elke ochtend nieuwe
  aanbiedingen en foto's ophalen en de website bijwerken. De app haalt die gegevens zelf op.
- **Android-app bouwen** (`.github/workflows/apk.yml`): bij elke wijziging in `web/` of `android/` een nieuwe
  APK, te downloaden via de release `app`.

## Bronnen
Aanbiedingen via [PrijsProfeet](https://www.prijsprofeet.nl) (gratis API, met bronvermelding).
Gewone prijzen uit de open data van [Checkjebon](https://github.com/supermarkt/checkjebon).
Productfoto's van [Open Food Facts](https://world.openfoodfacts.org) (CC BY-SA).
Deze app heeft geen band met de supermarkten. Controleer prijzen in de winkel.

## Sleutel
De sleutel die de app ondertekent staat níét in deze opslagplaats, maar in de geheime instellingen van GitHub
(Settings > Secrets and variables > Actions): `KEYSTORE_BASE64` (het sleutelbestand als base64) en `KEYSTORE_PASSWORD`.
Bewaar een kopie van het sleutelbestand en het wachtwoord op een veilige plek; zonder deze sleutel moet de app bij
een update eerst verwijderd worden. Zet nooit een sleutel of wachtwoord in de code.
