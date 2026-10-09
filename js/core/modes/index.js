// Übersicht der Rechenmodi (Reihenfolge = Reihenfolge der Tabs).
import { calcEinwaage } from './einwaage.js';
import { calcVerduennung } from './verduennung.js';
import { calcKonzentriert } from './konzentriert.js';
import { calcReihe } from './reihe.js';
import { calcUmrechner } from './umrechner.js';
import { calcIstd } from './istd.js';
import { calcMischung } from './mischung.js';

export const MODES = [
  { id: 'einwaage', key: 'A', label: 'Einwaage', title: 'Einwaage berechnen', calc: calcEinwaage },
  { id: 'verduennung', key: 'B', label: 'Verdünnung', title: 'Verdünnung c₁·V₁ = c₂·V₂', calc: calcVerduennung },
  { id: 'konzentriert', key: 'C', label: 'Konz. Lösung', title: 'Konzentrierte Lösung', calc: calcKonzentriert },
  { id: 'reihe', key: 'D', label: 'Reihe', title: 'Verdünnungs-/Kalibrierreihe', calc: calcReihe },
  { id: 'umrechner', key: 'E', label: 'Umrechner', title: 'Einheiten umrechnen', calc: calcUmrechner },
  { id: 'istd', key: 'F', label: 'Int. Standard', title: 'Interner Standard (Spiking)', calc: calcIstd },
  { id: 'mischung', key: 'G', label: 'Mischung', title: 'Mischstandard (mehrere Stoffe)', calc: calcMischung },
];

export const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m]));

export { calcEinwaage, calcVerduennung, calcKonzentriert, calcReihe, calcUmrechner, calcIstd, calcMischung };
