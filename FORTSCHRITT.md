# Fortschritt

Diese Datei hält den aktuellen Stand fest, damit nach einem Abbruch nahtlos weitergearbeitet werden kann.

## Stand

- [x] Etappe 1: Rechenkern (Parser, Einheiten, Stoffdatenbank) + Tests – 41 Tests grün
- [ ] Etappe 2: Rechenmodi A–F mit Oberfläche
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

## Nächste Schritte

- Etappe 2: `js/core/modes/*.js` (Rechenmodi A–F, mit `checks` für Etappe 3), dann UI (`index.html`, `css/app.css`, `js/ui/*`), Manifest, Service Worker, Icons.

## Befehle

```
npm test                      # alle Tests
node tools/check-substances.js --md
node tools/verify-pubchem.js  # braucht Internet
```

## Log

- 2026-10-09: Projekt angelegt (Git-Repo, Ordnerstruktur).
- 2026-10-09: Etappe 1 fertig, Tests grün, Commit.
