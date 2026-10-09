// Einstellungen mit Standardwerten.

export const DEFAULT_SETTINGS = Object.freeze({
  sig: 4, // signifikante Stellen in Ergebnissen
  theme: 'dark', // 'dark' | 'light' | 'system'
  textKeyboard: false, // Mengenfelder mit Text- statt Zifferntastatur (für Eingaben wie "5 µg/mL")
  // Plausibilitätsgrenzen
  minPipetteUL: 10, // Pipettiervolumen darunter -> Warnung
  maxStepFactor: 1000, // Verdünnungsfaktor pro Schritt darüber -> Warnung
  minMassMg: 10, // Einwaage darunter -> Warnung
  // verfügbare Geräte
  flasksML: [10, 25, 50, 100, 250, 500, 1000], // Messkolben
  pipettesUL: [10, 100, 1000], // Kolbenhubpipetten (Nennvolumen)
  volPipettesML: [1, 2, 5, 10, 20, 25, 50, 100], // Vollpipetten
  roundPipette: true, // Pipettiervolumina auf Geräteauflösung runden (Verdünnungsreihe)
  expiryWarnDays: 14, // Ampel gelb, wenn Ablauf in weniger als X Tagen
  historyMax: 50,
});

const KEY = 'settings';

export function loadSettings(storage) {
  const saved = storage.get(KEY) || {};
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...saved });
}

export function saveSettings(storage, settings) {
  const clean = sanitizeSettings(settings);
  storage.set(KEY, clean);
  return clean;
}

function numList(v, fallback) {
  const arr = Array.isArray(v) ? v : String(v ?? '').split(/[;,\s]+/);
  const nums = [...new Set(arr.map((x) => Number(String(x).replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0))].sort((a, b) => a - b);
  return nums.length ? nums : [...fallback];
}

export function sanitizeSettings(s) {
  const d = DEFAULT_SETTINGS;
  const int = (v, lo, hi, def) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };
  const pos = (v, def) => {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    sig: int(s.sig, 2, 8, d.sig),
    theme: ['dark', 'light', 'system'].includes(s.theme) ? s.theme : d.theme,
    textKeyboard: !!s.textKeyboard,
    minPipetteUL: pos(s.minPipetteUL, d.minPipetteUL),
    maxStepFactor: pos(s.maxStepFactor, d.maxStepFactor),
    minMassMg: pos(s.minMassMg, d.minMassMg),
    flasksML: numList(s.flasksML, d.flasksML),
    pipettesUL: numList(s.pipettesUL, d.pipettesUL),
    volPipettesML: numList(s.volPipettesML, d.volPipettesML),
    roundPipette: s.roundPipette !== false,
    expiryWarnDays: int(s.expiryWarnDays, 0, 365, d.expiryWarnDays),
    historyMax: int(s.historyMax, 5, 500, d.historyMax),
  };
}
