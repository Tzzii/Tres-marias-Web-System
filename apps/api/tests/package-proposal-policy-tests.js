import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPackageProposalRules, validatePackageProposalRules } from '@tm/shared/src/domain/packageProposal.js';
import { budgetCatalog } from './helpers/budget-fixtures.js';

function rules() {
  return {
    enabled: true,
    recipes: [
      {
        id: 'plates',
        name: 'Plate setup',
        serviceTypes: ['Catering only'],
        minGuests: 50,
        maxGuests: 300,
        cateringSetupPrice: 12000,
        components: [{ packageId: 'p', itemIndex: 0, itemName: 'Plates', mode: 'perGuests', qty: 1, perGuests: 1 }],
        optionalAddonIds: ['stage', 'helpers']
      }
    ]
  };
}

test('new settings grant no approval and existing complete recipes can be saved', () => {
  const catalog = budgetCatalog();
  assert.deepEqual(validatePackageProposalRules(null, catalog).rules, defaultPackageProposalRules());
  assert.equal(defaultPackageProposalRules().enabled, false);
  assert.equal(validatePackageProposalRules(rules(), catalog).rules.recipes[0].cateringSetupPrice, 12000);
});

test('rules reject stale source indexes, names, hidden packages, and duplicated required items', () => {
  for (const edit of [
    (r) => {
      r.components[0].itemIndex = 4;
    },
    (r) => {
      r.components[0].itemName = 'Different item';
    },
    (r) => {
      r.components[0].packageId = 'missing';
    },
    (r, catalog) => {
      catalog.packages[0].visible = false;
    },
    (r) => {
      r.components.push(r.components[0]);
    },
    (r) => {
      r.components = [];
    }
  ]) {
    const raw = rules(),
      catalog = budgetCatalog();
    edit(raw.recipes[0], catalog);
    assert.ok(validatePackageProposalRules(raw, catalog).problem);
  }
});

test('unsupported scaling, unapproved prices, incompatible dependencies and addons fail closed', () => {
  for (const edit of [
    (r) => {
      r.cateringSetupPrice = null;
    },
    (r) => {
      r.cateringSetupPrice = -10;
    },
    (r) => {
      r.components[0].mode = 'inferred';
    },
    (r) => {
      r.components[0].qty = 0;
    },
    (r) => {
      r.components[0].perGuests = 0;
    },
    (r) => {
      r.components[0].qty = 100000;
    },
    (r) => {
      r.optionalAddonIds.push('sound');
    },
    (r, c) => {
      c.addons[0].budgetPolicy.requires = ['premium'];
    },
    (r, c) => {
      c.addons[1].archived = true;
    },
    (r) => {
      r.maxGuests = 701;
    },
    (r) => {
      r.serviceTypes = ['Equipment Rental'];
    },
    (r) => {
      r.extraGuestsCharge = 1000;
    }
  ]) {
    const raw = rules(),
      catalog = budgetCatalog();
    edit(raw.recipes[0], catalog);
    assert.ok(validatePackageProposalRules(raw, catalog).problem);
  }
});
