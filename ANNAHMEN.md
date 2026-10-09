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

## Etappe 2: Rechenmodi und Oberfläche

22. **Live-Berechnung statt „Berechnen“-Knopf:** Ergebnisse erscheinen beim Tippen (ca. 0,2 s Verzögerung). Die letzten Eingaben je Modus bleiben gespeichert („Formular leeren“ setzt zurück).
23. **Tastatur:** Mengenfelder öffnen standardmäßig den Ziffernblock (schneller im Labor), die Einheit wählt man daneben. Freitext wie „5 µg/mL“ funktioniert trotzdem (z. B. beim Einfügen) und ist im Umrechner (E) und in der Zielliste der Reihe (D) Standard. In den Einstellungen lässt sich die Text-Tastatur für alle Mengenfelder einschalten.
24. **Signifikante Stellen:** Standard 4, einstellbar 2–6. Nullen am Ende werden weggelassen („100“ statt „100,0“). Molare Massen werden immer mit mindestens zwei Nachkommastellen gezeigt. Gerechnet wird intern immer mit voller Genauigkeit; gerundet wird nur die Anzeige.
25. **A · Einwaage – Bezugsform:** Die Zielkonzentration kann sich auf den Stoff wie eingewogen (inkl. Kristallwasser), die wasserfreie Form, ein Element (z. B. 1000 mg/L Cu aus CuSO₄·5H₂O) oder eine beliebige Formel (z. B. PFOS-Anion aus dem K-Salz) beziehen. Standard: wie eingewogen.
26. **A · Einwaage – Reinheit:** Leeres Feld = Wert aus der Datenbank, sonst 100 %. Bei % (V/V) wird die Reinheit nicht berücksichtigt (Hinweis).
27. **A · Einwaage – Menge als Masse:** Bei % (m/m) und ppm kann die Ansatzmenge als Masse (g) angegeben werden („10 g Salz + 190 g Wasser“). Bei Molalität wird eine eingegebene Masse als Masse des Lösungsmittels verwendet.
28. **A · Flüssigkeiten:** Ist im Stoffeintrag eine Dichte hinterlegt und der Stoff flüssig, steht das abzumessende Volumen an erster Stelle, die Masse darunter.
29. **B · Verdünnung:** Statt „ein Feld leer lassen“ wählt man oben, welche Größe gesucht ist (V₁ als Standard) – das ist auf dem Handy eindeutiger. c₁ und c₂ dürfen verschiedene Einheiten haben; über Größenarten hinweg (z. B. mg/L ↔ mmol/L) werden Molare Masse usw. abgefragt. Der Verdünnungsfaktor wird als „F = 10 (1 + 9)“ angegeben, weil „1:10“ im Labor mehrdeutig ist.
30. **C · Konzentrierte Lösung:** Die Sicherheitsregel „Erst das Wasser, dann die Säure“ wird bei Säuren ab 10 % Gehalt angezeigt, ein Wärmehinweis bei Laugen ab 20 %.
31. **D · Reihe:** Pipettiervolumina werden standardmäßig auf eine praktische Einstellauflösung gerundet (< 10 µL: 0,1 µL; 10–100 µL: 0,5 µL; 100–1000 µL: 1 µL; 1–10 mL: 10 µL; darüber 0,1 mL); die Spalte „tatsächlich“ zeigt die Konzentration mit dem gerundeten Volumen. Seriell gibt es zwei Varianten: „jeder Standard auf V auffüllen“ (Spalte „Rest“ zeigt, was nach der Entnahme übrig bleibt) oder „Entnahme ausgleichen“ (größeres Ansatzvolumen, damit jedem Standard V bleibt). Die Tabelle zeigt Konzentrationen in der Einheit der Zielliste.
32. **D · Zwischenverdünnung:** Wird vorgeschlagen, sobald ein Standard < 10 µL Stammlösung oder einen Faktor > 1000 bräuchte: Faktor 10ⁿ, Kolben aus der Geräteliste. Per Häkchen wird sie in den Plan übernommen (nur die betroffenen Standards werden daraus hergestellt).
33. **E · Umrechner:** Die Zusammenfassung zeigt je Größenart die „lesbarste“ Einheit (Zahlenwert zwischen 1 und 1000) in der Reihenfolge Masse → ppm → Stoffmenge, wie im Beispiel der Aufgabenstellung. Mit * markierte Werte beruhen auf der Annahme ρ = 1 g/mL.
34. **F · Interner Standard:** Zwei Varianten: IS wird zur Probe gegeben (Volumen addiert sich; exakte Formel V = c·V_Probe/(c_IS − c), die Näherung ohne Volumenzunahme wird zum Vergleich gezeigt) oder Probe wird nach Zugabe auf ein festes Endvolumen aufgefüllt. „Anzahl Proben“ soll Kalibrierstandards, Blanks und QCs einschließen; Reserve standardmäßig 10 %. Ist das Zugabevolumen < 10 µL, wird eine Arbeitslösung 1:10ⁿ vorgeschlagen.
35. **Navigation:** Untere Leiste (Rechner, Stoffe, Mehr); die sechs Modi als Tabs oben. Adressen wie `#rechner/reihe` lassen sich als Lesezeichen bzw. App-Verknüpfung (langes Drücken auf das App-Icon) nutzen.
36. **PDF-Export** folgt in Etappe 3; in Etappe 2 gibt es „Kopieren“ (Rechenweg als Text) und – sofern das Gerät es anbietet – „Teilen“.

## Etappe 3: Praxisfunktionen

37. **Plausibilitätsgrenzen** (einstellbar unter „Mehr“): Pipettiervolumen < 10 µL, Verdünnungsfaktor > 1000 in einem Schritt (mit Vorschlag zur Aufteilung, z. B. 1:10 000 → erst 1:100, dann 1:100), Zielvolumen größer als der größte *verfügbare* Messkolben (Liste einstellbar, Standard 10–1000 mL), Einwaage < 10 mg.
38. **Gerätevorschläge:** Kolbenhubpipetten werden im Bereich 10–100 % ihres Nennvolumens empfohlen (10/100/1000 µL einstellbar). Passt ein Volumen genau auf eine Vollpipette (1, 2, 5, 10, 20, 25, 50, 100 mL), wird diese vorgeschlagen. Über 1000 µL: bis zu 5 Hübe der 1000-µL-Pipette, sonst Messpipette/Messzylinder/Wägung. Gibt es keinen passenden Messkolben, wird der nächstgrößere mit hochgerechnetem Ansatz genannt. Waage: Analysenwaage (0,1 mg) bis 100 g.
39. **Messunsicherheit** (aufklappbar, nur Abschätzung): Toleranzen aus DIN EN ISO 1042 (Messkolben Klasse A), DIN EN ISO 648 (Vollpipetten Klasse A) und ISO 8655-2 (Kolbenhubpipetten) – **aus dem Gedächtnis**, siehe `VERIFIZIEREN.md`. Rechteckverteilung (u = Toleranz/√3), bei Kolbenhubpipetten zusätzlich die zufällige Abweichung. Die Toleranz am Nennvolumen wird absolut auch für Teilvolumina verwendet (konservativ). Waage u = 0,1 mg. Unsicherheit der Stammlösung bzw. Reinheit kann eingegeben werden. Erweiterte Unsicherheit mit k = 2. Temperatur, Bedienereinfluss und Unsicherheit der Molaren Masse sind nicht enthalten. Seriell kumuliert sich die Unsicherheit von Standard zu Standard.
40. **Lösungsverwaltung:** Ampel grün = gültig, gelb = läuft in ≤ 14 Tagen ab (einstellbar), rot = abgelaufen, grau = kein Ablaufdatum. Beim Start erscheint ein Hinweis, wenn Lösungen abgelaufen sind. Haltbarkeit per Schnellknopf (+1 Woche … +1 Jahr) oder in Tagen. „Etikett kopieren“ liefert einen kurzen Etikett-Text.
41. **„Als Lösung speichern“** gibt es bei Einwaage, Verdünnung und beim Herstellen aus konzentrierter Lösung; Name/Konzentration und der Rechenweg werden übernommen.
42. **Verlauf:** Eine Berechnung wird automatisch gespeichert, sobald das Ergebnis 2,5 s unverändert bleibt. Weitere Änderungen innerhalb von 5 Minuten im selben Modus ersetzen den Eintrag (kein „Tipp-Verlauf“), identische Eingaben werden nicht doppelt gespeichert. Es bleiben die letzten 50 Einträge. „Öffnen“ stellt die Eingaben im Rechner wieder her.
43. **PDF-Export:** eigener kleiner PDF-Erzeuger (A4, Schrift Courier, damit Tabellen ausgerichtet bleiben, ohne externe Bibliothek). Weil PDF-Standardschriften keine hochgestellten Zeichen kennen, steht dort `10^-8` statt `10⁻⁸`, `c2` statt `c₂`, `rho` statt `ρ`. Alternativ „Drucken“ → „Als PDF speichern“ von Chrome (Druckansicht ohne Menüs). „Kopieren“ liefert den Text zum Einfügen ins elektronische Laborjournal.
44. **Backup:** Die Backup-Datei enthält Stoffe, Lösungen, Verlauf und Einstellungen.
45. **Git-Autor:** Weil auf dem PC kein globaler Git-Name eingerichtet war, habe ich im Repository lokal `luisg` / `(GitHub-noreply-Adresse)` gesetzt (nur für dieses Projekt).

## Nachtrag

46. **Start am PC:** Die App muss über einen (lokalen) Webserver geöffnet werden, weil Browser JavaScript-Module beim direkten Öffnen der Datei (`file://`) blockieren. Dafür gibt es `start.bat` (startet `tools/serve.js` und öffnet den Browser). Wird `index.html` trotzdem direkt geöffnet, zeigt die Seite einen Hinweis statt einer leeren Fläche.
