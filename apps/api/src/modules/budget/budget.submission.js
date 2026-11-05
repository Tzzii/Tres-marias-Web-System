import { z } from 'zod';
import { normalizeBudgetSelection, estimateBudget } from '@tm/shared/src/domain/budget.js';
import { budgetBookableAddons, readBudgetPolicy } from '@tm/shared/src/domain/budgetPolicy.js';
import { packageItemsFor } from '@tm/shared/src/domain/packageItems.js';
import { selectionChanges } from '@tm/shared/src/domain/budgetRequest.js';
import { ApiError } from '../../lib/ApiError.js';
import { budgetCatalogFingerprint } from '../../lib/budgetCatalogFingerprint.js';
import { findBudgetProposal } from './budget.repo.js';
import * as catalogRepo from '../catalog/catalog.repo.js';
import { DEFAULT_PRICE_PER_PLATE, DEFAULT_SIX_HOUR_FEE } from '@tm/shared/src/services/config.js';

const id = z.string().min(1).max(40);
export const budgetRequestBody = z
  .object({
    budget: z.number().int().min(1).max(10000000),
    preferences: z.string().trim().max(500).default(''),
    protectedAddonIds: z.array(id).max(100).default([]),
    proposalId: id.optional(),
    reviewedCatalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
export const addonSelectionBody = z
  .object({ addonIds: z.array(id).max(100), addonQty: z.record(id, z.number().int().min(1).max(99)).default({}) })
  .strict();

/** Read the same public pricing projection on the reservation transaction's connection. */
export async function readBudgetCatalog(db) {
  const [packages, addons, rate, duration] = await Promise.all([
    catalogRepo.listPackages({}, db),
    catalogRepo.listAddons({}, db),
    catalogRepo.getPricePerPlate(db),
    catalogRepo.getSixHourFee(db)
  ]);
  const catalog = {
    packages,
    addons,
    pricePerPlate: Number(rate) || DEFAULT_PRICE_PER_PLATE,
    sixHourFee: Number(duration ?? DEFAULT_SIX_HOUR_FEE)
  };
  return { ...catalog, budgetCatalogFingerprint: budgetCatalogFingerprint(catalog) };
}
export function validateServiceDependencies(selection, catalog) {
  const selected = new Set(selection.addonIds);
  for (const a of budgetBookableAddons(catalog).filter((a) => selected.has(a.id))) {
    const policy = readBudgetPolicy(a.budgetPolicy, a, catalog).policy;
    if (policy?.requires.some((id) => !selected.has(id)))
      throw new ApiError('INVALID', `${a.name} needs its required additional services. Review the selection.`, {
        field: 'addonIds'
      });
  }
}
export function budgetLines(selection, catalog) {
  const byId = new Map(budgetBookableAddons(catalog).map((a) => [a.id, a]));
  return selection.addonIds.map((id) => {
    const a = byId.get(id);
    const quantity = selection.addonQty[id] || 1;
    const unitPrice = typeof a.price === 'number' && Number.isFinite(a.price) ? a.price : null;
    return {
      id,
      name: a.name,
      description: a.description || '',
      quantity,
      unitPrice,
      total: unitPrice === null ? null : unitPrice * quantity
    };
  });
}
const eventKey = (c) => JSON.stringify([c.serviceType, c.packageId, c.guests, c.date, c.startTime, c.endTime]);
export async function buildBudgetRequestSnapshot({
  request,
  fields,
  customerId,
  catalog,
  db,
  at = Date.now(),
  findProposal = findBudgetProposal
}) {
  if (request == null) return null;
  const parsed = budgetRequestBody.safeParse(request);
  if (!parsed.success || fields.serviceType !== 'Buffet and Catering')
    throw new ApiError('INVALID', 'Use a valid buffet budget request.', { field: 'budgetRequest' });
  const data = parsed.data;
  const fingerprint = budgetCatalogFingerprint(catalog);
  if (fingerprint !== data.reviewedCatalogFingerprint)
    throw new ApiError(
      'CATALOG_CHANGED',
      'Prices or service inclusions changed. Review the refreshed estimate and submit again; AI regeneration is optional.',
      { field: 'budgetRequest' }
    );
  let selection;
  try {
    selection = normalizeBudgetSelection(fields, catalog);
  } catch (e) {
    throw new ApiError('INVALID', e.message, { field: 'addonIds' });
  }
  validateServiceDependencies(selection, catalog);
  const offered = budgetBookableAddons(catalog);
  if (
    data.protectedAddonIds.some(
      (id) =>
        !selection.addonIds.includes(id) && !offered.some((a) => a.parentId === id && selection.addonIds.includes(a.id))
    )
  )
    throw new ApiError('INVALID', 'Protect only selected additional services.', { field: 'budgetRequest' });
  const context = {
    serviceType: fields.serviceType,
    packageId: fields.packageId,
    guests: fields.guests,
    date: fields.date,
    startTime: fields.startTime,
    endTime: fields.endTime,
    occasion: fields.occasion,
    budget: data.budget,
    preferences: data.preferences,
    protectedAddonIds: selection.addonIds.filter(
      (id) =>
        data.protectedAddonIds.includes(id) ||
        data.protectedAddonIds.includes(offered.find((a) => a.id === id)?.parentId)
    ),
    selection
  };
  const estimate = estimateBudget(context, { catalog });
  let proposal = null;
  let changes = [];
  if (data.proposalId) {
    const original = await findProposal(data.proposalId, customerId, { db, now: at });
    if (
      !original ||
      original.customerId !== customerId ||
      original.expiresAt <= at ||
      original.catalogFingerprint !== fingerprint ||
      eventKey(original.context) !== eventKey(context)
    )
      throw new ApiError(
        'PROPOSAL_STALE',
        'The saved budget review expired or no longer matches this event. Review again, or submit without linking that recommendation.',
        { field: 'budgetRequest', allowManual: true }
      );
    proposal = {
      id: original.id,
      generatedAt: original.createdAt,
      originalSelection: original.originalSelection,
      originalEstimate: original.originalEstimate,
      originalLines: budgetLines(original.originalSelection, catalog)
    };
    changes = selectionChanges(original.originalSelection, selection).map((c) => ({
      ...c,
      name: offered.find((a) => a.id === c.id)?.name || c.id
    }));
  }
  const pkg = catalog.packages.find((p) => p.id === fields.packageId);
  return structuredClone({
    version: 1,
    submittedAt: at,
    budget: data.budget,
    preferences: data.preferences,
    protectedAddonIds: context.protectedAddonIds,
    context,
    selection,
    estimate,
    lines: budgetLines(selection, catalog),
    inclusions: {
      packageId: pkg.id,
      packageName: pkg.name,
      items: packageItemsFor(pkg, fields.guests),
      ulamCount: 4,
      menu: fields.menu,
      pricePerPlate: catalog.pricePerPlate,
      sixHourFee: catalog.sixHourFee
    },
    catalogFingerprint: fingerprint,
    proposal,
    changes
  });
}
