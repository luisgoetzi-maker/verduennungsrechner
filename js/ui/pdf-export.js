// PDF-Export einer Berechnung (Download).

import { toast, download } from './dom.js';
import { makePdf } from '../core/pdf.js';

/** PDF aus dem Text einer Berechnung erzeugen und herunterladen. */
export function downloadPdf(text, title, ts = Date.now()) {
  const lines = String(text).split('\n');
  const head = lines[0] && lines[0].startsWith('Verdünnungsrechner') ? lines.shift() : `Verdünnungsrechner – ${title}`;
  const bytes = makePdf(lines, { title: head, footer: 'Erstellt mit dem Verdünnungsrechner – Werte vor Verwendung prüfen' });
  const d = new Date(ts);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const safe = String(title).toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '');
  download(`berechnung-${safe}-${stamp}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
  toast('PDF wird gespeichert (Ordner „Downloads“).');
}
