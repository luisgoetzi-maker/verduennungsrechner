// Übersicht der Rechenmodi (Reihenfolge = Reihenfolge der Tabs).

(function () {
  'use strict';
  const { calcEinwaage } = VR.use('core/modes/einwaage.js');
  const { calcVerduennung } = VR.use('core/modes/verduennung.js');
  const { calcKonzentriert, calcKonzentriertMehrere } = VR.use('core/modes/konzentriert.js');
  const { calcReihe } = VR.use('core/modes/reihe.js');
  const { calcUmrechner } = VR.use('core/modes/umrechner.js');
  const { calcIstd, calcIstdMehrere } = VR.use('core/modes/istd.js');
  const { calcMischung, calcEinwaageMehrere, hasExtraSubstances } = VR.use('core/modes/mischung.js');
  const { activeExtras } = VR.use('core/modes/common.js');

/** Einwaage: ein Stoff wie bisher, mehrere Stoffe (＋) als gemeinsame Lösung. */
function calcEinwaageAuto(input, settings) {
  return hasExtraSubstances(input) ? calcEinwaageMehrere(input, settings) : calcEinwaage(input, settings);
}

/** Konzentrierte Lösung: mit ＋ mehrere konzentrierte Lösungen in einem Ansatz. */
function calcKonzentriertAuto(input, settings) {
  return activeExtras(input).length ? calcKonzentriertMehrere(input, settings) : calcKonzentriert(input, settings);
}

/** Interner Standard: mit ＋ mehrere IS-Lösungen je Probe. */
function calcIstdAuto(input, settings) {
  return activeExtras(input).length ? calcIstdMehrere(input, settings) : calcIstd(input, settings);
}

const MODES = [
  { id: 'einwaage', key: 'A', label: 'Einwaage', title: 'Einwaage berechnen', calc: calcEinwaageAuto },
  { id: 'verduennung', key: 'B', label: 'Verdünnung', title: 'Verdünnung c₁·V₁ = c₂·V₂', calc: calcVerduennung },
  { id: 'konzentriert', key: 'C', label: 'Konz. Lösung', title: 'Konzentrierte Lösung', calc: calcKonzentriertAuto },
  { id: 'reihe', key: 'D', label: 'Reihe', title: 'Verdünnungs-/Kalibrierreihe', calc: calcReihe },
  { id: 'umrechner', key: 'E', label: 'Umrechner', title: 'Einheiten umrechnen', calc: calcUmrechner },
  { id: 'istd', key: 'F', label: 'Int. Standard', title: 'Interner Standard (Spiking)', calc: calcIstdAuto },
  { id: 'mischung', key: 'G', label: 'Mischung', title: 'Mischstandard (mehrere Stoffe)', calc: calcMischung },
];

const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m]));

  VR.provide('core/modes/index.js', { calcEinwaage, calcVerduennung, calcKonzentriert, calcReihe, calcUmrechner, calcIstd, calcMischung, calcEinwaageAuto, calcKonzentriertAuto, calcIstdAuto, MODES, MODE_BY_ID });
}());
