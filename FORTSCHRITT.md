# Fortschritt

Diese Datei hält den aktuellen Stand fest, damit nach einem Abbruch nahtlos weitergearbeitet werden kann.

## Stand

- [x] Etappe 1: Rechenkern (Parser, Einheiten, Stoffdatenbank) + Tests – 41 Tests grün
- [x] Etappe 2: Rechenmodi A–F mit Oberfläche – 67 Tests grün, im Browser geprüft (Mobilansicht, offline)
- [x] Etappe 3: Praxisfunktionen (Warnungen, Geräte, Lösungen, Verlauf, Export, Messunsicherheit) – 83 Tests grün, im Browser geprüft

## Etappe 1 – erledigt

| Modul | Datei | Tests |
|---|---|---|
| Atommassen (118 Elemente + Isotope) | `js/core/elements.js` | `tests/formula.test.js` |
| Formel-Parser | `js/core/formula.js` | `tests/formula.test.js` |
| Zahlen lesen/formatieren | `js/core/numbers.js` | `tests/numbers.test.js` |
| Einheiten | `js/core/units.js` | `tests/units.test.js` |
| Stoffdatenbank | `js/core/substance-db.js`, `js/core/substances-seed.js` | `tests/substance-db.test.js` |
| Prüfskript Startliste | `js/core/substance-check.js`, `tools/check-substances.js` | ebenda |
| PubChem (optional) | `js/core/pubchem.js`, `tools/verify-pubchem.js` | Formelvergleich getestet |
| Speicher-Adapter | `js/core/storage.js` | indirekt |
| Abnahmetests | – | `tests/acceptance.test.js` |

PubChem-Abgleich (209 von 213 CAS-Nummern bestätigt) → `PUBCHEM-ABGLEICH.md`; Prüfliste → `VERIFIZIEREN.md`.

## Etappe 2 – erledigt

| Bereich | Dateien | Tests |
|---|---|---|
| Rechenmodi A–F | `js/core/modes/*.js` | `tests/modes.test.js` |
| Geräte/Rundung | `js/core/devices.js` | indirekt (Reihe, IS) |
| Text-Export | `js/core/export.js` | – |
| Backup | `js/core/backup.js` | – |
| Oberfläche | `index.html`, `css/app.css`, `js/ui/**` | im Browser geprüft |
| PWA | `manifest.webmanifest`, `sw.js`, `icons/*`, `tools/update-sw.js` | `tests/pwa.test.js` |

Jeder Modus liefert `checks` (Volumina, Massen, Faktoren) – Etappe 3 wertet sie für Warnungen und Gerätevorschläge aus (`js/ui/features.js` ist der Einhängepunkt).

## Etappe 3 – erledigt

| Bereich | Dateien | Tests |
|---|---|---|
| Plausibilität + Geräte | `js/core/practice.js`, `js/core/devices.js` | `tests/practice.test.js` |
| Messunsicherheit | `js/core/uncertainty.js` | ebenda |
| Lösungen (Ampel) | `js/core/solutions.js`, `js/core/expiry.js`, `js/ui/views/solutions.js` | ebenda |
| Verlauf | `js/core/history.js`, `js/ui/views/history.js` | ebenda |
| PDF/Text-Export | `js/core/pdf.js`, `js/core/export.js`, `js/ui/pdf-export.js` | ebenda |
| Backup (gesamt) | `js/core/backup.js` | ebenda |
| Einbindung | `js/ui/features.js` | im Browser geprüft |

## Offene Punkte / Ideen

- Werte der Startliste (Dichten, Gehalte) und Gerätetoleranzen gegen SDB/Zertifikate prüfen → `VERIFIZIEREN.md`.
- Test auf dem echten Gerät (Galaxy S24 FE): Installation, Offline-Start, PDF-Download, Backup-Import.
- Optional: Etikettendruck, Mehrsprachigkeit, Unsicherheit der Molaren Masse/Temperatur.

## Befehle

```
npm test                      # alle Tests
node tools/check-substances.js --md
node tools/verify-pubchem.js  # braucht Internet
node tools/update-sw.js       # Offline-Dateiliste nach neuen Dateien
node tools/serve.js           # lokaler Server (Port 8080)
```

## Log

- 2026-10-09: Projekt angelegt (Git-Repo, Ordnerstruktur).
- 2026-10-09: Etappe 1 fertig, Tests grün, Commit.
- 2026-10-09: Etappe 2 fertig (Modi + UI + PWA), Tests grün, Commit.
- 2026-10-09: Etappe 3 fertig (Praxisfunktionen), Tests grün, README, Commit.
- 2026-10-09: Fix: Leere Seite beim Öffnen per Doppelklick (file://) – Hinweis in index.html, start.bat, serve.js --open; Version 1.0.1.
