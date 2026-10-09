# Annahmen

Hier stehen alle Annahmen, die ich bei unklaren Anforderungen getroffen habe – jeweils mit Begründung. Wenn etwas nicht passt, lässt es sich meist an einer Stelle im Code ändern (Datei in Klammern).

## Etappe 1: Rechenkern

### Formel-Parser (`js/core/formula.js`, `js/core/elements.js`)

1. **Atommassen:** IUPAC/CIAAW-Standardatomgewichte (Stand 2021). Für Elemente mit Intervall-Angabe (H, Li, B, C, N, O, Mg, Si, S, Cl, Ar, Br, Tl, Pb) nehme ich die von der IUPAC empfohlenen *konventionellen* Werte (z. B. H = 1,008; C = 12,011; Cl = 35,45). Damit ergeben sich genau die Werte aus den Abnahmetests.
2. **Radioaktive Elemente ohne Standardatomgewicht** (Tc, Pm, Po … Og): Massenzahl des langlebigsten Isotops, mit Warnung.
3. **Hydrat-Trennzeichen:** `·`, `•`, `∙`, `⋅`, `.` und `*`. Ein Punkt gehört nur dann zu einer Zahl, wenn er *am Anfang eines Formelteils* zwischen Ziffern steht (`CaSO4.0.5H2O` = Hemihydrat). **Dezimale Indizes innerhalb der Formel** (nichtstöchiometrisch, z. B. `Fe0.95O`) werden **nicht** unterstützt, weil sie mit `CuSO4.5H2O` verwechselbar wären.
4. **Faktoren** (Zahl vor einem Formelteil) sind nur am Anfang eines Formelteils erlaubt, auch als Dezimalzahl oder Bruch (`0,5`, `1/2`, `½`). Eine Zahl ganz am Anfang der Formel wird als Faktor gelesen (mit Hinweis).
5. **Isotope** schreibt man `[13C]`, `^13C` oder `¹³C`, außerdem `D` (Deuterium) und `T` (Tritium). Die Schreibweise „13C“ ohne Klammer ist mehrdeutig (Faktor 13?) und wird als Faktor gelesen – mit Hinweis. Hinterlegt sind die Massen der gängigen Markierungsisotope (²H, ³H, ¹³C, ¹⁴C, ¹⁵N, ¹⁸O, ³⁴S, ³⁷Cl …); für andere Isotope muss die Molare Masse manuell eingegeben werden.
6. **Ladungen** werden erkannt, ändern aber die Molare Masse nicht (Elektronenmasse < 0,0006 g/mol je Ladung, wie bei PubChem und in Tabellenwerken). Eindeutige Schreibweisen: `SO4^2-`, `SO4(2-)`, `SO4 2-`, `SO₄²⁻`. Für die mehrdeutige Kurzform ohne `^` gelten Faustregeln, die in der App immer als Hinweis angezeigt werden:
   - einatomig: `Fe3+` → Fe³⁺
   - nach Klammer: `[Fe(CN)6]4-` → Ladung 4−
   - mehrstellige Zahl: `SO42-` → SO₄²⁻ (letzte Ziffer = Ladung)
   - einstellige Zahl: `NH4+` → NH₄⁺ (Ziffer = Index)
7. **Klammern:** `( )`, `[ ]`, `{ }` beliebig verschachtelt; `[13C]` (Ziffern direkt nach `[`) ist eine Isotopenmarkierung, keine Klammer.

### Einheiten (`js/core/units.js`, `js/core/numbers.js`)

8. **Zahlen:** Dezimalkomma und Dezimalpunkt werden akzeptiert. Kommen beide vor, ist das zuletzt stehende Zeichen das Dezimaltrennzeichen (`1.000,5` = 1000,5). Kommt nur ein Punkt oder Komma einmal vor, ist es das Dezimaltrennzeichen – **`1.000` ist also 1, nicht 1000.** Tausendertrennzeichen bitte weglassen (oder Leerzeichen verwenden).
9. **Präfixe:** zusätzlich zu p, n, µ (auch `u`, `μ`, `mc`), m, k, M habe ich f (femto), c (centi) und d (dezi, für dL) aufgenommen.
10. **„%“ ohne Zusatz ist mehrdeutig** → die App fragt nach (m/m, m/V oder V/V), statt zu raten.
11. **ppm/ppb/ppt** sind als **Massenanteile** definiert (mg/kg, µg/kg, ng/kg). Wird in eine volumenbezogene Einheit umgerechnet und ist keine Lösungsdichte angegeben, rechnet die App mit 1 g/mL (verdünnte wässrige Lösung) und zeigt den geforderten Hinweis an. Bei `mg/kg`, `% (m/m)` usw. wird die Dichte dagegen **immer abgefragt**, weil diese Einheiten typischerweise für konzentrierte Lösungen verwendet werden. **ppt = parts per trillion** (10⁻¹²), nicht „parts per thousand“.
12. **% (V/V)** bezieht sich auf das Endvolumen der Lösung (Komponente abmessen, auf Volumen auffüllen). Die Umrechnung in g/L nutzt die Dichte des *reinen* Stoffes. Hinweis zur Nicht-Additivität wird angezeigt.
13. **Normalität (eq/L, N):** c(eq) = z · c. Die Wertigkeit z ist bei einigen Säuren/Basen in der Datenbank hinterlegt (z. B. H₂SO₄: 2), bei reaktionsabhängigen Stoffen (H₃PO₄, KMnO₄) bewusst nicht – dann fragt die App nach.
14. **Molalität (mol/kg)** bezieht sich auf 1 kg Lösungsmittel. Umrechnung in mol/L braucht Molare Masse und Dichte der Lösung.

### Stoffdatenbank (`js/core/substance-db.js`, `js/core/substances-seed.js`)

15. **Speicherung:** `localStorage` des Browsers (bleibt lokal auf dem Gerät). Die Startliste ist Teil des Programmcodes; eigene Stoffe, Änderungen an Einträgen der Startliste und „gelöschte“ (ausgeblendete) Einträge werden getrennt gespeichert. So kann ich die Startliste in einem Update verbessern, ohne Ihre Änderungen zu überschreiben.
16. **Startliste:** 216 Einträge (etwas mehr als die gewünschten ca. 150), davon 32 PFAS bzw. isotopenmarkierte interne Standards.
17. **Dichte** = Dichte des Produkts bei 20 °C (bei konzentrierten Säuren/Laugen also die der Lösung). **Reinheit/Gehalt** = Massenanteil in % (m/m). Bei Feststoffen ist die Reinheit meist leer (= 100 %) – bitte den Wert vom Etikett/Zertifikat der jeweiligen Charge eintragen. Ausnahme: KOH-Plätzchen (85 %).
18. **Ammoniaklösung** ist mit der Formel NH₃ und der CAS-Nummer von NH₃ (7664-41-7) eingetragen, weil sich der Gehalt (25 %) auf NH₃ bezieht. Die CAS-Nummer der Lösung (1336-21-6) steht in den Notizen.
19. **Suche:** findet Name, Aliase, Formel (auch in anderer Schreibweise, z. B. `C2H4O2` → Essigsäure), CAS-Nummer; Umlaute werden vereinheitlicht (`Schwefelsaeure` findet `Schwefelsäure`), Oxidationsstufen wie `(II)` werden ignoriert.
20. **Backup-Datei** enthält alle sichtbaren Stoffe (inkl. Startliste) plus die Liste der ausgeblendeten Einträge – so ist die Datei auch für Menschen lesbar und vollständig. Beim Import gibt es „Zusammenführen“ und „Ersetzen“.
21. **PubChem-Abfrage** liefert die Summenformel in Hill-Notation; bei Hydraten geht dabei die Schreibweise `·5H2O` verloren (Molare Masse stimmt trotzdem). Ergebnisse werden nur nach Bestätigung gespeichert.
