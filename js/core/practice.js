// Praxisprüfung eines Ergebnisses: Plausibilitätswarnungen und passende
// Standardgeräte. Wertet die `checks` aus, die jeder Rechenmodus liefert:
//   {type:'pipette', L, label}  abzumessendes Volumen
//   {type:'flask', L}           Zielvolumen (Messkolben)
//   {type:'mass', g, label}     Einwaage
//   {type:'factor', F}          Verdünnungsfaktor eines Schritts

(function () {
  'use strict';
  const { DEFAULT_SETTINGS } = VR.use('core/settings.js');
  const { suggestFlask, suggestPipette } = VR.use('core/devices.js');
  const { formatNumber } = VR.use('core/numbers.js');
  const { formatAuto } = VR.use('core/units.js');

const n = (x, s = 3) => formatNumber(x, s);

/** Kurzform eines Gerätevorschlags für Tabellen. */
function shortDevice(d) {
  switch (d.kind) {
    case 'pipette': return `Pip. ${String(d.uL).replace('.', ',')} µL`;
    case 'volpipette': return `Vollpip. ${String(d.mL).replace('.', ',')} mL`;
    case 'tooSmall': return 'zu klein';
    case 'combo': return d.text.replace(/ \(Pipette .*\)$/, '');
    default: return 'Messpipette';
  }
}

/** Vorschlag für eine Aufteilung eines großen Faktors in zwei Schritte. */
function splitFactor(F) {
  const k = Math.ceil(Math.log10(F) / 2 - 1e-9);
  const F1 = 10 ** k;
  return [F1, F / F1];
}

/**
 * @param {object} R Ergebnis eines Rechenmodus
 * @param {object} settings
 * @returns {{warnings: Array<{level, text}>, devices: Array<{label, text}>}}
 */
function evaluatePractice(R, settings = DEFAULT_SETTINGS) {
  const S = { ...DEFAULT_SETTINGS, ...settings };
  const warnings = [];
  const devices = [];
  if (!R || !R.ok) return { warnings, devices };
  const minL = S.minPipetteUL * 1e-6;
  // Reihe und Mischung: Hinweise und Geräte stehen je Zeile in der Tabelle
  const series = R.table && (R.table.type === 'series' || R.table.type === 'mix');
  const seen = new Set();
  const once = (key, fn) => { if (!seen.has(key)) { seen.add(key); fn(); } };

  for (const c of R.checks || []) {
    switch (c.type) {
      case 'pipette': {
        if (!(c.L > 0)) break;
        if (series) break; // Reihe: Gerät steht in der Tabelle
        const d = suggestPipette(c.L, S);
        devices.push({ label: c.label || 'Abmessen', text: d.text });
        if (c.L < minL * (1 - 1e-9)) {
          warnings.push({ level: 'warn', text: `Pipettiervolumen ${formatAuto(c.L, 'volume', 3)}${c.label ? ` (${c.label})` : ''} liegt unter ${n(S.minPipetteUL)} µL – sehr ungenau. Größeres Volumen ansetzen oder vorher zwischenverdünnen.` });
        }
        break;
      }
      case 'factor': {
        if (series) break; // Reihe: in den Zeilenhinweisen
        if (c.F > S.maxStepFactor * (1 + 1e-9)) {
          once('factor', () => {
            const [F1, F2] = splitFactor(c.F);
            warnings.push({ level: 'warn', text: `Verdünnungsfaktor ${n(c.F)} in einem Schritt (über 1:${n(S.maxStepFactor)}). Zwischenverdünnung empfohlen, z. B. erst 1:${n(F1)}, dann 1:${n(F2)}.` });
          });
        }
        break;
      }
      case 'flask': {
        if (!(c.L > 0)) break;
        once(`flask-${c.L}`, () => {
          const fl = suggestFlask(c.L, S);
          if (fl.tooLarge) {
            warnings.push({ level: 'warn', text: `Zielvolumen ${formatAuto(c.L, 'volume', 4)} ist größer als der größte verfügbare Messkolben (${n(fl.max, 4)} mL). In Teilmengen ansetzen oder ein größeres Gefäß verwenden.` });
          } else if (fl.exact) {
            devices.push({ label: 'Auffüllen', text: fl.text });
          } else {
            let scaled = '';
            if (R.values && R.values.V1 && R.values.V2 && Math.abs(R.values.V2 - c.L) < 1e-12) {
              scaled = `: dann ${formatAuto((R.values.V1 * fl.mL) / 1000 / c.L, 'volume', 4)} Stammlösung auf ${n(fl.mL, 4)} mL`;
            }
            devices.push({ label: 'Auffüllen', text: `kein Messkolben mit ${formatAuto(c.L, 'volume', 4)} – nächster: ${n(fl.mL, 4)} mL${scaled || ' (Ansatz hochrechnen) oder Messzylinder/Wägung'}` });
          }
        });
        break;
      }
      case 'mass': {
        if (!(c.g > 0)) break;
        if (series) break;
        const mg = c.g * 1000;
        devices.push({ label: c.label || 'Einwaage', text: mg < 100000 ? 'Analysenwaage (Ablesbarkeit 0,1 mg)' : 'Präzisionswaage (0,01 g)' });
        if (mg < S.minMassMg * (1 - 1e-9)) {
          warnings.push({ level: 'warn', text: `Einwaage ${formatAuto(c.g, 'massq', 3)} liegt unter ${n(S.minMassMg)} mg – relativer Wägefehler groß. Größeres Volumen ansetzen oder eine konzentriertere Stammlösung herstellen und verdünnen.` });
        }
        break;
      }
      default:
        break;
    }
  }

  if (series && R.table.type === 'series') {
    for (const r of R.table.rows) r.device = shortDevice(suggestPipette(r.V, S));
  }
  if (series && R.table.type === 'mix') {
    for (const r of R.table.rows) {
      r.device = r.kind === 'stock' || r.Vp ? shortDevice(suggestPipette(r.kind === 'stock' ? r.V : r.Vp, S)) : 'Analysenwaage';
    }
  }
  return { warnings, devices };
}

  VR.provide('core/practice.js', { shortDevice, splitFactor, evaluatePractice });
}());
