# Fortschritt

Diese Datei hält den aktuellen Stand fest, damit nach einem Abbruch nahtlos weitergearbeitet werden kann.

## Stand

- [x] Etappe 1: Rechenkern (Parser, Einheiten, Stoffdatenbank) + Tests – 41 Tests grün
- [x] Etappe 2: Rechenmodi A–F mit Oberfläche – 67 Tests grün, im Browser geprüft (Mobilansicht, offline)
- [ ] Etappe 3: Praxisfunktionen (Warnungen, Geräte, Lösungen, Verlauf, Export, Messunsicherheit)

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

## Nächste Schritte

- Etappe 3: `js/core/practice.js` (Plausibilität + Geräte aus `checks`), `js/core/uncertainty.js`, `js/core/solutions.js`, `js/core/history.js`, `js/core/pdf.js`; UI: `js/ui/features.js`, Ansichten Lösungen/Verlauf.

## Befehle

```
npm test                      # alle Tests
node tools/check-substances.js --md
node tools/verify-pubchem.js  # braucht Internet
```

## Log

- 2026-10-09: Projekt angelegt (Git-Repo, Ordnerstruktur).
- 2026-10-09: Etappe 1 fertig, Tests grün, Commit.
- 2026-10-09: Etappe 2 fertig (Modi + UI + PWA), Tests grün, Commit.
