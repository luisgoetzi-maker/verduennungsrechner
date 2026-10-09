// Laborgeräte: Messkolben, Kolbenhubpipetten, Vollpipetten.
// Rundung von Pipettiervolumina und Gerätevorschläge.

(function () {
  'use strict';
  const { DEFAULT_SETTINGS } = VR.use('core/settings.js');

/**
 * Praktische Einstellauflösung einer Pipette in Abhängigkeit vom Volumen (in L).
 *   < 10 µL: 0,1 µL | 10–100 µL: 0,5 µL | 100–1000 µL: 1 µL | 1–10 mL: 10 µL | ab 10 mL: 0,1 mL
 */
function pipetteResolution(L) {
  const uL = L * 1e6;
  if (uL < 10) return 0.1e-6;
  if (uL < 100) return 0.5e-6;
  if (uL < 1000) return 1e-6;
  if (uL < 10000) return 10e-6;
  return 0.1e-3;
}

/** Rundet ein Volumen (L) auf die praktische Einstellauflösung. */
function roundToPipette(L) {
  if (!(L > 0)) return L;
  const res = pipetteResolution(L);
  const r = Math.round(L / res) * res;
  return Number((r > 0 ? r : res).toPrecision(12));
}

/** Kleinster Messkolben ≥ V (L). */
function suggestFlask(L, settings = DEFAULT_SETTINGS) {
  const mL = L * 1000;
  const flasks = settings.flasksML || DEFAULT_SETTINGS.flasksML;
  const exact = flasks.find((x) => Math.abs(x - mL) / x < 1e-6);
  if (exact) return { kind: 'flask', mL: exact, exact: true, text: `Messkolben ${exact} mL` };
  const bigger = flasks.find((x) => x > mL);
  if (bigger) return { kind: 'flask', mL: bigger, exact: false, text: `kein passender Messkolben – nächster: ${bigger} mL` };
  return { kind: 'flask', mL: null, exact: false, tooLarge: true, max: flasks[flasks.length - 1], text: `größer als der größte Messkolben (${flasks[flasks.length - 1]} mL)` };
}

function fmt(x) {
  return String(Number(x.toPrecision(4))).replace('.', ',');
}

/**
 * Gerätevorschlag für ein abzumessendes Volumen (L).
 * Kolbenhubpipetten werden im Bereich 10–100 % ihres Nennvolumens empfohlen.
 */
function suggestPipette(L, settings = DEFAULT_SETTINGS) {
  const uL = L * 1e6;
  const pips = (settings.pipettesUL || DEFAULT_SETTINGS.pipettesUL).slice().sort((a, b) => a - b);
  const vols = (settings.volPipettesML || DEFAULT_SETTINGS.volPipettesML).slice().sort((a, b) => a - b);
  const maxPip = pips[pips.length - 1];
  // Vollpipette mit genau passendem Volumen
  const vp = vols.find((v) => Math.abs(v * 1000 - uL) / (v * 1000) < 1e-6);
  if (vp) return { kind: 'volpipette', mL: vp, text: `Vollpipette ${fmt(vp)} mL` };
  const pip = pips.find((p) => uL <= p * (1 + 1e-9) && uL >= p * 0.1 * (1 - 1e-9));
  if (pip) return { kind: 'pipette', uL: pip, text: `Kolbenhubpipette ${fmt(pip)} µL (eingestellt ${fmt(uL)} µL)` };
  if (uL < pips[0] * 0.1) {
    return { kind: 'tooSmall', text: `unterhalb des Arbeitsbereichs der kleinsten Pipette (${fmt(pips[0] * 0.1)}–${fmt(pips[0])} µL)` };
  }
  if (uL > maxPip) {
    const strokes = Math.ceil(uL / maxPip - 1e-9);
    if (strokes <= 5) {
      const rest = uL - (strokes - 1) * maxPip;
      const restPip = pips.find((p) => rest <= p * (1 + 1e-9) && rest >= p * 0.1 * (1 - 1e-9)) || maxPip;
      const text = strokes === 1 ? `Kolbenhubpipette ${fmt(maxPip)} µL`
        : `${strokes - 1} × ${fmt(maxPip)} µL + ${fmt(rest)} µL (Pipette ${fmt(restPip)} µL)`;
      return { kind: 'combo', strokes, text };
    }
    return { kind: 'large', text: `Messpipette, Messzylinder oder Einwaage (${fmt(uL / 1000)} mL)` };
  }
  return { kind: 'pipette', uL: maxPip, text: `Kolbenhubpipette ${fmt(maxPip)} µL` };
}

  VR.provide('core/devices.js', { pipetteResolution, roundToPipette, suggestFlask, suggestPipette });
}());
