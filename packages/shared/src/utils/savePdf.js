import { askWhereToSave, writeTo } from './saveFile.js';

/**
 * Saving part of a page as a real PDF file, without the browser's print window (the "Save PDF" buttons).
 *
 * The element is drawn into a picture (html2canvas-pro) and placed on A4 pages (jsPDF). The picture looks
 * exactly like the screen, peso signs and logo included, but its text can't be selected or searched.
 */

const PAGE = { width: 210, height: 297 }; // A4 portrait, in millimetres
const MARGIN = { side: 15, top: 15, bottom: 18 }; // the footer sits inside the bottom margin
const MM_PER_PX = 25.4 / 96; // one CSS pixel on paper: the same size the print window prints it
const CONTENT_PX = Math.floor((PAGE.width - 2 * MARGIN.side) / MM_PER_PX); // 680 px, the width the element is laid out at
const PAGE_PX = Math.floor((PAGE.height - MARGIN.top - MARGIN.bottom) / MM_PER_PX); // 997 px of the element fit on one page
const LAYOUT_WIDTH = 1024; // window width of the copy, so a phone gets the same two-column layout as a computer
const MAX_PIXELS = 16000000; // phones refuse to draw a bigger picture, so a very long element is drawn finer

// The footer is written in the PDF's own font, which has no ₱ or emoji: those characters are left out
const footerText = (text) => text.replace(/[^\x20-\x7e\xa0-\xff]/g, '').trim();

/**
 * Where each page ends, in px from the top of the element. A page holds `pageHeight`; its end moves up to
 * the nearest point that cuts through no blocked span (a line of text, a picture, a table row, a kept block),
 * so no line is ever cut in half. A span taller than a page can't be kept whole and is ignored. If keeping
 * the spans whole would leave a page less than half full, that page is cut full instead.
 * `blocked` holds [top, bottom] pairs. The last end is `total`.
 */
export function pageBreaks(total, pageHeight, blocked) {
  const ends = [];
  let start = 0;
  while (total - start > pageHeight) {
    const full = start + pageHeight;
    let end = full;
    for (;;) {
      // Spans that begin on this page and run past the cut
      const crossing = blocked.filter(([top, bottom]) => top > start && top < end && bottom > end && bottom - top < pageHeight);
      if (!crossing.length) break;
      end = Math.min(...crossing.map(([top]) => top));
    }
    if (end < start + pageHeight / 2) end = full;
    ends.push(end);
    start = end;
  }
  ends.push(total);
  return ends;
}

/**
 * Save `element` as an A4 PDF called `fileName`, no print window.
 * - First, right after the click, the computer's "Save as" window opens where the browser allows it, so the
 *   user picks the folder and name (utils/saveFile.js); other browsers download it the usual way. Cancel
 *   there stops everything: nothing is drawn and the promise resolves to false. Otherwise it resolves to
 *   true once the file is saved.
 * - The element is copied and laid out at the A4 content width (680 px) as on a computer screen, whatever
 *   the device; its own padding is dropped, because the page margins (15 mm) take its place.
 * - Pages break between lines, never through one; a block marked `data-pdf-keep` stays on one page when it fits.
 * - Every page has a footer: `footer` on the left (e.g. "Tres Marias Catering Services · Quotation-RES-1024")
 *   and "Page 1 of 2" on the right. `title` becomes the PDF's title in the file's properties.
 * - Both libraries load on the first save, so they never slow down opening the portals.
 * Throws when the browser can't draw the picture; the caller then points the user to Print.
 */
export async function saveElementAsPdf(element, fileName, { title, footer = '' } = {}) {
  // Ask where to save before the slow part: the browser only opens its window right after a click
  const target = await askWhereToSave(fileName);
  if (!target) return false;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);

  // Text styles the element inherits from where it sits (a dialog, the page), copied onto its new wrapper
  const inherited = getComputedStyle(element.parentElement || element);
  let blocked = []; // spans a page break must not cut, in px from the element's top (measured on the copy)

  // Draw at twice the size for sharp text, or finer for an element so long a phone couldn't hold the picture
  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (CONTENT_PX * Math.max(element.scrollHeight, 1))));
  const canvas = await html2canvas(element, {
    scale,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: LAYOUT_WIDTH,
    // Runs on the copy before it is drawn: move it out of its dialog to the top left of the copied page,
    // at the page width, and measure where the breaks may not go
    onclone: (doc, copy) => {
      const wrapper = doc.createElement('div');
      Object.assign(wrapper.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: `${CONTENT_PX}px`,
        background: '#ffffff',
        color: inherited.color,
        fontFamily: inherited.fontFamily,
        fontSize: inherited.fontSize,
        fontWeight: inherited.fontWeight,
        lineHeight: inherited.lineHeight,
        letterSpacing: inherited.letterSpacing
      });
      Object.assign(copy.style, { position: 'static', left: 'auto', top: 'auto', width: 'auto', margin: '0', padding: '0', transform: 'none' });
      wrapper.appendChild(copy);
      doc.body.appendChild(wrapper);

      const origin = copy.getBoundingClientRect().top;
      const spans = [];
      const add = (rect, pad) => rect.height > 0 && spans.push([rect.top - origin - pad, rect.bottom - origin + pad]);
      // Every line of text (one rectangle per wrapped line)...
      const range = doc.createRange();
      const walker = doc.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) add(rect, 2);
      }
      // ...and pictures, rules, table rows and kept blocks
      copy.querySelectorAll('img, svg, hr, tr, [data-pdf-keep]').forEach((el) => add(el.getBoundingClientRect(), 1));
      blocked = spans;
    }
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  if (title) pdf.setProperties({ title });
  const width = CONTENT_PX * MM_PER_PX;
  const left = (PAGE.width - width) / 2;
  const ends = pageBreaks(canvas.height / scale, PAGE_PX, blocked);
  ends.forEach((end, i) => {
    // This page's strip of the picture, on white
    const from = Math.round((i ? ends[i - 1] : 0) * scale);
    const strip = document.createElement('canvas');
    strip.width = canvas.width;
    strip.height = Math.max(1, Math.min(Math.round(end * scale), canvas.height) - from);
    const ctx = strip.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, strip.width, strip.height);
    ctx.drawImage(canvas, 0, from, strip.width, strip.height, 0, 0, strip.width, strip.height);
    if (i) pdf.addPage();
    pdf.addImage(strip.toDataURL('image/jpeg', 0.95), 'JPEG', left, MARGIN.top, width, (strip.height / scale) * MM_PER_PX);

    // Footer: a hairline, then the footer text on the left and the page number on the right
    const lineY = PAGE.height - MARGIN.bottom + 5;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.2);
    pdf.line(left, lineY, left + width, lineY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    if (footer) pdf.text(footerText(footer), left, lineY + 5);
    pdf.text(`Page ${i + 1} of ${ends.length}`, left + width, lineY + 5, { align: 'right' });
  });
  await writeTo(target, pdf.output('blob'));
  return true;
}
