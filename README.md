# Verdünnungsrechner

Verdünnungs- und Lösungsrechner für den Laboralltag als Progressive Web App: reines HTML/CSS/JavaScript, keine Build-Tools, kein Server-Backend. Läuft komplett offline, ist auf dem Handy als App installierbar, Oberfläche auf Deutsch, Dark Mode. Alle Daten bleiben lokal auf dem Gerät.

## Funktionen

| Bereich | Inhalt |
|---|---|
| **A · Einwaage** | Zielkonzentration + Volumen → Masse; Reinheit, Kristallwasser, Bezugsform (wasserfrei, Element, Anion), bei Flüssigkeiten Volumen über die Dichte |
| **B · Verdünnung** | c₁·V₁ = c₂·V₂, jede der vier Größen berechenbar, Verdünnungsfaktor, „X mL auf Y mL auffüllen“ |
| **C · Konzentrierte Lösung** | % (m/m) + Dichte → mol/L; „wie viel mL für 1 L 0,1 M?“ |
| **D · Reihe** | Kalibrier-/Verdünnungsreihe parallel oder seriell, Pipettierplan, tatsächliche Konzentrationen, Zwischenverdünnung |
| **E · Umrechner** | Wert in allen sinnvollen Einheiten (mol/L, g/L, ppm …) |
| **F · Interner Standard** | µL je Probe, Chargenbedarf mit Reserve, Arbeitslösung |
| **Praxis** | Plausibilitätswarnungen, Gerätevorschläge, Messunsicherheit, Lösungsverwaltung mit Ampel, Verlauf, Export als Text/PDF, Backup |
| **Stoffdatenbank** | 216 Laborchemikalien (Säuren, Basen, Puffer, Lösungsmittel, Komplexbildner, PFAS …), eigene Stoffe, optional PubChem-Abfrage |

Jedes Ergebnis zeigt den vollständigen Rechenweg mit eingesetzten Zahlen.

## Am PC starten

**Nicht `index.html` per Doppelklick öffnen** – dann blockiert der Browser die Programmteile (JavaScript-Module über `file://`) und es erscheint nur ein Hinweis. Stattdessen:

1. Im Projektordner **`start.bat`** doppelklicken. Es öffnet sich ein Konsolenfenster (offen lassen) und der Browser mit <http://localhost:8080/>.
2. Zum Beenden das Konsolenfenster schließen.

Alternativ im Terminal: `node tools/serve.js --open`.

## Auf dem Handy installieren (Samsung Galaxy S24 FE, Chrome)

Für Offline-Betrieb und Installation braucht Chrome eine **sichere Adresse** (`https://…` oder `http://localhost`). Deshalb gibt es zwei Wege:

### Weg 1 (empfohlen): GitHub Pages – dauerhaft, kostenlos, https

1. Auf <https://github.com> ein Konto anlegen (falls noch nicht vorhanden) und ein **neues, öffentliches** Repository anlegen, z. B. `verduennungsrechner` (ohne README).
   *(GitHub Pages ist für private Repositories nur mit einem kostenpflichtigen Konto verfügbar. Im Code stehen keine persönlichen Daten – Ihre Stoffe und Lösungen bleiben auf dem Handy.)*
2. Im Projektordner am PC:
   ```bash
   git remote add origin https://github.com/IHR-NAME/verduennungsrechner.git
   ```
   ```bash
   git push -u origin main
   ```
3. Auf GitHub im Repository: **Settings → Pages → Build and deployment → Source: „Deploy from a branch“, Branch: `main`, Ordner: `/ (root)` → Save**. Nach ca. 1 Minute ist die App erreichbar unter `https://IHR-NAME.github.io/verduennungsrechner/`.
4. Auf dem Handy diese Adresse in **Chrome** öffnen → Menü **⋮ → „Zum Startbildschirm hinzufügen“ → „Installieren“**. Die App erscheint als Symbol (Erlenmeyerkolben) im App-Drawer.
5. **Offline-Test:** App einmal öffnen, dann Flugmodus einschalten und die App erneut starten – sie muss vollständig funktionieren (nur die PubChem-Abfrage meldet „offline“).

**Updates:** Nach Änderungen am Code die Version erhöhen (`CACHE_VERSION` in `sw.js` und `APP_VERSION` in `js/ui/version.js`), `node tools/update-sw.js` ausführen, committen und pushen. Die App zeigt dann „Eine neue Version ist verfügbar – Neu laden“.

### Weg 2: Lokaler Server im WLAN (zum Ausprobieren)

Voraussetzung: Node.js am PC (ist installiert, v24).

```bash
node tools/serve.js
```

(oder `start.bat` doppelklicken). Der Server zeigt die Adressen an, z. B. `http://192.168.178.23:8080/`. PC und Handy müssen im selben WLAN sein (ggf. in der Windows-Firewall „Node.js“ für private Netzwerke zulassen).

- **Nur ansehen/testen:** Adresse am Handy in Chrome öffnen. Die App funktioniert, aber **ohne Offline-Modus und ohne Installation**, weil `http://192.168…` keine sichere Adresse ist.
- **Mit Offline-Modus und Installation (USB):** Am Handy Entwickleroptionen + USB-Debugging aktivieren, per USB verbinden, am PC in Chrome `chrome://inspect/#devices` öffnen → **Port forwarding…** → Port `8080` an `localhost:8080` → Haken „Enable port forwarding“. Dann am Handy `http://localhost:8080` öffnen – jetzt gilt die Adresse als sicher und die App lässt sich installieren.
- **Alternative ohne USB:** Am Handy `chrome://flags/#unsafely-treat-insecure-origin-as-secure` öffnen, die WLAN-Adresse (z. B. `http://192.168.178.23:8080`) eintragen, „Enabled“, Chrome neu starten. (Nur für Tests – die Einstellung gilt für das ganze Chrome.)

> Hinweis: Eine über Weg 2 installierte App ist an die Adresse gebunden. Für den Dauerbetrieb Weg 1 verwenden.

## Datensicherung und Handywechsel

**Mehr → Daten & Backup → Backup exportieren** speichert eine JSON-Datei (Stoffe inkl. eigener Änderungen, Lösungen, Verlauf, Einstellungen) im Download-Ordner. Auf dem neuen Gerät **Backup importieren** wählen (Ersetzen oder Zusammenführen).

Die App bittet Chrome um dauerhafte Speicherung; bei installierten Apps löscht Chrome die Daten nicht von selbst. Trotzdem gelegentlich ein Backup exportieren.

## Tests und Prüfwerkzeuge

```bash
npm test
```

```bash
node tools/check-substances.js --md
```

```bash
node tools/verify-pubchem.js
```

- `npm test` – alle automatischen Tests (Parser, Einheiten, Datenbank, Rechenmodi, Praxisfunktionen, PWA-Dateien, Abnahmetests).
- `check-substances` – prüft jede Formel der Startliste mit dem Parser, CAS-Prüfziffern, Dichten/Gehalte, Hydrat-Benennung, mehrdeutige Aliase; `--md` schreibt `VERIFIZIEREN.md`.
- `verify-pubchem` – vergleicht (mit Internet) die Summenformel jeder CAS-Nummer mit PubChem → `PUBCHEM-ABGLEICH.md`.
- `node tools/update-sw.js` – trägt alle App-Dateien in die Offline-Liste des Service Workers ein (nach dem Hinzufügen neuer Dateien).
- `node tools/make-icons.js` – erzeugt die App-Icons neu.

## Projektstruktur

```
index.html, manifest.webmanifest, sw.js   App-Hülle, Manifest, Service Worker (offline)
css/app.css                               Gestaltung (Dark/Light, Touch)
js/core/                                  Rechenkern – ohne Oberfläche, in Node testbar
  elements.js        Atommassen (IUPAC), Isotope
  formula.js         Formel-Parser, Molare Masse
  numbers.js         Zahlen lesen/formatieren (sig. Stellen, Dezimalkomma)
  units.js           Einheiten, Umrechnung zwischen Konzentrationsarten
  substances-seed.js Startliste der Stoffdatenbank
  substance-db.js    Stoffdatenbank (Suche, eigene Stoffe, Import/Export)
  modes/             Rechenmodi A–F (einwaage, verduennung, konzentriert, reihe, umrechner, istd)
  practice.js        Plausibilitätswarnungen + Gerätevorschläge
  devices.js         Messkolben/Pipetten, Rundung
  uncertainty.js     Messunsicherheit (Fehlerfortpflanzung)
  solutions.js, history.js, expiry.js   Lösungsverwaltung, Verlauf, Ablauf-Ampel
  export.js, pdf.js  Text- und PDF-Export
  backup.js, settings.js, storage.js, pubchem.js
js/ui/                                    Oberfläche
  app.js             Start, Navigation, Service-Worker-Registrierung
  features.js        Praxisfunktionen (Warnungen, PDF, Lösungen, Verlauf)
  components.js      Eingabefelder, Stoffauswahl
  forms/             Formulare der Modi A–F
  views/             Ansichten Rechner, Stoffe, Lösungen, Verlauf, Einstellungen
tests/                                    automatische Tests (node --test)
tools/                                    Prüfskripte, lokaler Server, Icons
```

Eine neue Funktion ergänzen: Rechenlogik als Modul in `js/core/modes/` (liefert das gemeinsame Ergebnisformat aus `modes/common.js`), in `modes/index.js` eintragen, Formular in `js/ui/forms/`, in `js/ui/views/calc.js` registrieren, Test in `tests/` – fertig.

## Wichtige Hinweise

- **Die Werte der Stoff-Startliste (CAS-Nummern, Dichten, Gehalte) wurden aus dem Gedächtnis eingetragen.** Formeln und CAS-Nummern wurden automatisch gegen PubChem abgeglichen (209 von 213 bestätigt), Dichten und Gehalte nicht. Siehe `VERIFIZIEREN.md`.
- Annahmen bei unklaren Anforderungen: `ANNAHMEN.md`. Arbeitsstand: `FORTSCHRITT.md`.
- Ergebnisse vor der Verwendung im Labor plausibilisieren.
