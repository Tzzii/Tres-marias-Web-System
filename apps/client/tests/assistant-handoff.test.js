import test from 'node:test';
import assert from 'node:assert/strict';
import { carryAssistantPhotos } from '../src/lib/assistantBookingHandoff.js';

const source = {
  conversationId: 'conversation',
  draftRevision: 7,
  referencePhotos: [{ index: 0, name: 'New reference.png' }]
};
const options = (overrides = {}) => ({
  api: { read: async () => source, photo: async () => new Blob(['photo bytes'], { type: 'image/png' }) },
  read: () => ({
    form: {
      venueName: 'Existing venue',
      referencePhotos: [{ name: 'Old reference.png', dataUrl: 'data:image/png;base64,b2xk' }]
    }
  }),
  save: () => true,
  ...overrides
});

test('manual-form handoff carries actual private photos while preserving unrelated saved form details', async () => {
  let saved;
  await carryAssistantPhotos(
    source,
    'customer',
    options({
      save: (id, form) => {
        saved = { id, form };
        return true;
      }
    })
  );
  assert.equal(saved.id, 'customer');
  assert.equal(saved.form.venueName, 'Existing venue');
  assert.equal(saved.form.referencePhotos.length, 2);
  assert.equal(saved.form.referencePhotos[0].name, 'Old reference.png');
  assert.equal(saved.form.referencePhotos[1].dataUrl, 'data:image/png;base64,cGhvdG8gYnl0ZXM=');
});

test('photo handoff cannot silently lose attachments for guests, full storage, changed plans or too many photos', async () => {
  await assert.rejects(() => carryAssistantPhotos(source, null, options()), /sign in/i);
  await assert.rejects(() => carryAssistantPhotos(source, 'customer', options({ save: () => false })), /storage/i);
  await assert.rejects(
    () =>
      carryAssistantPhotos(
        source,
        'customer',
        options({ api: { read: async () => ({ ...source, draftRevision: 8 }) } })
      ),
    /changed/i
  );
  await assert.rejects(
    () =>
      carryAssistantPhotos(
        source,
        'customer',
        options({
          read: () => ({
            form: {
              referencePhotos: Array.from({ length: 5 }, (_, i) => ({
                name: `existing-${i}`,
                dataUrl: 'data:image/png;base64,b2xk'
              }))
            }
          })
        })
      ),
    /five/i
  );
});
