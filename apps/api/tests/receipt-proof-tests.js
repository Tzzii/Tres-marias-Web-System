import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageBreaks, pdfPageLayout } from '../../../packages/shared/src/utils/savePdf.js';

test('a receipt and its bank proof stay together on one page without enlarging a short receipt', () => {
  assert.deepEqual(pdfPageLayout(800, 1000, [], [], true), { ends: [800], scale: 1 });
  assert.deepEqual(pdfPageLayout(1450, 1000, [[650, 1450]], [], true), { ends: [1450], scale: 1000 / 1450 });
});

test('long receipt contents scale proportionally and remain within the printable page', () => {
  const total = 2500;
  const layout = pdfPageLayout(total, 1000, [], [], true);
  assert.deepEqual(layout.ends, [total]);
  assert.equal(total * layout.scale, 1000);
  assert.equal(layout.scale, 0.4);
});

test('documents without bank proof retain their existing pagination and table headings', () => {
  assert.deepEqual(pageBreaks(500, 1000, []), [500]);
  assert.deepEqual(pageBreaks(2500, 1000, [[900, 1100]]), [900, 1900, 2500]);
  assert.deepEqual(pageBreaks(2500, 1000, [], [{ top: 100, bottom: 150, end: 2400 }]), [1000, 1950, 2500]);
  assert.deepEqual(pdfPageLayout(2500, 1000, [[900, 1100]]), { ends: [900, 1900, 2500], scale: 1 });
});
