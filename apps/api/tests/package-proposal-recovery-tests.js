import test from 'node:test';
import assert from 'node:assert/strict';
import { readOwnedPackageProposal } from '../src/modules/package-proposals/packageProposal.read.js';
import { assistantPackageProposalDraft, proposalOccasionFields } from '@tm/shared/src/domain/assistantBooking.js';
import { OCCASIONS } from '@tm/shared/src/services/config.js';

const row = {
  id: 'proposal',
  revision: 2,
  status: 'ready',
  selectedOptionId: 'recipe/base',
  options: [{ id: 'recipe/base' }],
  submittedRef: 'TM-SAVED',
  context: {},
  expiresAt: 100,
  createdAt: 1
};

test('owner-scoped submitted read recovers the exact saved selection after expiry without current catalog/provider work', async () => {
  const calls = [];
  const result = await readOwnedPackageProposal('owner', 'proposal', {
    clock: () => 500,
    findOwned: async (customer, id) => {
      calls.push(['proposal', customer, id]);
      return row;
    },
    findSubmittedReservation: async (customer, ref) => {
      calls.push(['reservation', customer, ref]);
      return { reservationRef: ref, submittedAt: 90 };
    }
  });
  assert.deepEqual(calls, [
    ['proposal', 'owner', 'proposal'],
    ['reservation', 'owner', 'TM-SAVED']
  ]);
  assert.deepEqual(result.submission, {
    reservationRef: 'TM-SAVED',
    submittedAt: 90,
    packageProposalRef: { proposalId: 'proposal', optionId: 'recipe/base', revision: 2 }
  });
  assert.equal(result.options, row.options);
});

test('another owner, missing bound reservation and inconsistent selected option cannot recover a booking', async () => {
  let reservationReads = 0;
  const reservation = async () => {
    reservationReads++;
    return { reservationRef: 'TM-SAVED', submittedAt: 90 };
  };
  await assert.rejects(
    () =>
      readOwnedPackageProposal('other-owner', 'proposal', {
        findOwned: async (customer) => (customer === 'owner' ? row : null),
        findSubmittedReservation: reservation
      }),
    { code: 'NOT_FOUND' }
  );
  await assert.rejects(
    () =>
      readOwnedPackageProposal('owner', 'proposal', {
        findOwned: async () => ({ ...row, selectedOptionId: 'unknown' }),
        findSubmittedReservation: reservation
      }),
    { code: 'PROPOSAL_STALE' }
  );
  assert.equal(reservationReads, 0);
  await assert.rejects(
    () =>
      readOwnedPackageProposal('owner', 'proposal', {
        findOwned: async () => row,
        findSubmittedReservation: async () => null
      }),
    { code: 'NOT_FOUND' }
  );
});

test('expiry remains enforced for unsubmitted proposals and live reads confer no selection or booking rights', async () => {
  const unsubmitted = { ...row, submittedRef: null };
  await assert.rejects(
    () => readOwnedPackageProposal('owner', 'proposal', { findOwned: async () => unsubmitted, clock: () => 100 }),
    { code: 'PROPOSAL_STALE' }
  );
  const fresh = await readOwnedPackageProposal('owner', 'proposal', {
    findOwned: async () => unsubmitted,
    clock: () => 99
  });
  assert.equal(fresh.submission, null);
});

test('dedicated selection maps Other text and supported occasions before cleaning while keeping event and venue answers', () => {
  const previous = {
    eventName: 'Saved event',
    venueName: 'Saved venue',
    venueAddress: '123 Main St',
    city: 'Malvar',
    accessNotes: 'Use side entrance',
    occasion: 'Other',
    occasionOther: 'Old text'
  };
  const context = {
    serviceType: 'Catering only',
    guests: 80,
    budget: 20000,
    occasion: 'Baby shower',
    preferences: 'Keep guest seating',
    eventName: 'Earlier proposal event name'
  };
  const option = { menu: {}, styling: {}, addonIds: [], addonQty: {} };
  const reference = { proposalId: 'proposal', revision: 2, optionId: 'recipe/base' };
  const other = assistantPackageProposalDraft(previous, context, option, reference);
  assert.equal(other.occasion, 'Other');
  assert.equal(other.occasionOther, 'Baby shower');
  assert.deepEqual(proposalOccasionFields('Other'), { occasion: 'Other', occasionOther: 'Other' });
  for (const key of ['eventName', 'venueName', 'venueAddress', 'city', 'accessNotes'])
    assert.equal(other[key], previous[key]);
  assert.deepEqual(other.packageProposalRef, reference);
  for (const occasion of OCCASIONS.filter((value) => value !== 'Other')) {
    assert.deepEqual(proposalOccasionFields(occasion), { occasion, occasionOther: '' });
    const supported = assistantPackageProposalDraft(previous, { ...context, occasion }, option, reference);
    assert.equal(supported.occasion, occasion);
    assert.equal(supported.occasionOther, '');
  }
});
