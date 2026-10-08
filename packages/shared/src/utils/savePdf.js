import { askWhereToSave, writeTo } from './saveFile.js';

/**
 * Saving part of a page as a real PDF file, without the browser's print window (the "Save PDF" buttons).
 *
 * The element is drawn into a picture (html2canvas-pro) and placed on A4 pages (jsPDF). The picture looks
 * exactly like the screen, peso signs and logo included, but its text can't be selected or searched.
 */

const A4 = { short: 210, long: 297 }; // A4 sides, in millimetres
const MARGIN = { side: 15, top: 15, bottom: 18 }; // the footer sits inside the bottom margin
const MM_PER_PX = 25.4 / 96; // one CSS pixel on paper: the same size the print window prints it
const LAYOUT_WIDTH = 1024; // window width of the copy, so a phone gets the same two-column layout as a computer
const MAX_PIXELS = 16000000; // phones refuse to draw a bigger picture, so a very long element is drawn finer

/**
 * The A4 page for 'portrait' or 'landscape', in millimetres, and how much of the element fits on it in px:
 * `contentPx` is the width the element is laid out at (680 px portrait, 1009 px landscape) and `pagePx` the
 * height of the element one page holds (997 px portrait, 668 px landscape).
 */
function pageSize(orientation) {
  const [width, height] = orientation === 'landscape' ? [A4.long, A4.short] : [A4.short, A4.long];
  return {
    width,
    height,
    contentPx: Math.floor((width - 2 * MARGIN.side) / MM_PER_PX),
    pagePx: Math.floor((height - MARGIN.top - MARGIN.bottom) / MM_PER_PX)
  };
}

// The footer is written in the PDF's own font, which has no ₱ or emoji: those characters are left out
const footerText = (text) => text.replace(/[^\x20-\x7e\xa0-\xff]/g, '').trim();

/**
 * The table head drawn again at the top of a page that starts `start` px down the element: the one whose
 * table goes on below `start`, past its head. null when the page starts outside every such table.
 * `repeats` holds { top, bottom, end }: the head's top and bottom and its table's bottom, in px.
 */
export function repeatedHead(repeats, start) {
  return repeats.find((r) => start >= r.bottom && start < r.end - 2) || null;
}

/**
 * Where each page ends, in px from the top of the element. A page holds `pageHeight`, less the height of a
 * table head drawn again at its top (`repeats`, see repeatedHead); its end moves up to the nearest point that
 * cuts through no blocked span (a line of text, a picture, a table row, a kept block), so no line is ever cut
 * in half. A span taller than a page can't be kept whole and is ignored. If keeping the spans whole would
 * leave a page less than half full, that page is cut full instead.
 * `blocked` holds [top, bottom] pairs. Spans that touch (table rows, edge to edge) must not overlap: a cut
 * moved up to one row's top would then cut the row above it, and so on up the table. A span running less
 * than half a pixel past a cut doesn't count, as rows measured edge to edge can differ by a rounding error.
 * The last end is `total`.
 */
export function pageBreaks(total, pageHeight, blocked, repeats = []) {
  const ends = [];
  let start = 0;
  for (;;) {
    const head = repeatedHead(repeats, start);
    const room = pageHeight - (head ? head.bottom - head.top : 0);
    if (total - start <= room) break;
    const full = start + room;
    let end = full;
    for (;;) {
      // Spans that begin on this page and run past the cut
      const crossing = blocked.filter(([top, bottom]) => top > start && top < end && bottom - end > 0.5 && bottom - top < room);
      if (!crossing.length) break;
      end = Math.min(...crossing.map(([top]) => top));
    }
    if (end < start + room / 2) end = full;
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
 * - The element is copied and laid out at the A4 content width (680 px portrait, 1009 px with `orientation:
 *   'landscape'`) as on a computer screen, whatever the device; its own padding is dropped, because the page
 *   margins (15 mm) take its place.
 * - Pages break between lines, never through one; a block marked `data-pdf-keep` stays on one page when it fits.
 * - A table head marked `data-pdf-repeat` (a <thead>) is drawn again at the top of every page its table runs
 *   onto, as a printed table repeats it, and never ends a page without the first row under it.
 * - Every page has a footer: `footer` on the left (e.g. "Tres Marias Catering Services · Quotation-RES-1024")
 *   and "Page 1 of 2" on the right. `title` becomes the PDF's title in the file's properties.
 * - Both libraries load on the first save, so they never slow down opening the portals.
 * Throws when the browser can't draw the picture; the caller then points the user to Print.
 */
export async function saveElementAsPdf(element, fileName, { title, footer = '', orientation = 'portrait' } = {}) {
  // Ask where to save before the slow part: the browser only opens its window right after a click
  const target = await askWhereToSave(fileName);
  if (!target) return false;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);

  const page = pageSize(orientation);
  // Text styles the element inherits from where it sits (a dialog, the page), copied onto its new wrapper
  const inherited = getComputedStyle(element.parentElement || element);
  let blocked = []; // spans a page break must not cut, in px from the element's top (measured on the copy)
  const repeats = []; // table heads drawn again on the pages their tables run onto (see repeatedHead)

  // Draw at twice the size for sharp text, or finer for an element so long a phone couldn't hold the picture
  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (page.contentPx * Math.max(element.scrollHeight, 1))));
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
        width: `${page.contentPx}px`,
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
      // ...pictures, rules and kept blocks...
      copy.querySelectorAll('img, svg, hr, [data-pdf-keep]').forEach((el) => add(el.getBoundingClientRect(), 1));
      // ...and table rows, with no margin: they sit edge to edge, so a margin would overlap the next row (see pageBreaks)
      copy.querySelectorAll('tr').forEach((el) => add(el.getBoundingClientRect(), 0));
      // Table heads to repeat (only one well under a page tall, so a page always has room for rows), each
      // kept together with the first row under it
      copy.querySelectorAll('[data-pdf-repeat]').forEach((el) => {
        const head = el.getBoundingClientRect();
        const table = (el.closest('table') || el.parentElement).getBoundingClientRect();
        if (!head.height || head.height > page.pagePx / 4) return;
        repeats.push({ top: head.top - origin, bottom: head.bottom - origin, end: table.bottom - origin });
        const next = el.nextElementSibling;
        const first = next && (next.firstElementChild || next);
        if (first) spans.push([head.top - origin, first.getBoundingClientRect().bottom - origin]);
      });
      blocked = spans;
    }
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });
  if (title) pdf.setProperties({ title });
  const width = page.contentPx * MM_PER_PX;
  const left = (page.width - width) / 2;
  const ends = pageBreaks(canvas.height / scale, page.pagePx, blocked, repeats);
  ends.forEach((end, i) => {
    // This page's strip of the picture on white: the repeated table head first, when the page starts inside a table
    const start = i ? ends[i - 1] : 0;
    const head = repeatedHead(repeats, start);
    const headFrom = head ? Math.round(head.top * scale) : 0;
    const headHeight = head ? Math.round(head.bottom * scale) - headFrom : 0;
    const from = Math.round(start * scale);
    const bodyHeight = Math.max(1, Math.min(Math.round(end * scale), canvas.height) - from);
    const strip = document.createElement('canvas');
    strip.width = canvas.width;
    strip.height = headHeight + bodyHeight;
    const ctx = strip.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, strip.width, strip.height);
    if (head) ctx.drawImage(canvas, 0, headFrom, strip.width, headHeight, 0, 0, strip.width, headHeight);
    ctx.drawImage(canvas, 0, from, strip.width, bodyHeight, 0, headHeight, strip.width, bodyHeight);
    if (i) pdf.addPage();
    pdf.addImage(strip.toDataURL('image/jpeg', 0.95), 'JPEG', left, MARGIN.top, width, (strip.height / scale) * MM_PER_PX);

    // Footer: a hairline, then the footer text on the left and the page number on the right
    const lineY = page.height - MARGIN.bottom + 5;
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
