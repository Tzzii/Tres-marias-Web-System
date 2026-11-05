import { pool } from '../../db.js';
import { toJson, parseJson } from '../../lib/json.js';

export async function insertBudgetProposal(proposal, db = pool) {
  await db.query(
    `INSERT INTO budget_proposals
    (id, customer_id, context, original_selection, original_estimate, candidates, input_fingerprint, catalog_fingerprint, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      proposal.id,
      proposal.customerId,
      toJson(proposal.context),
      toJson(proposal.originalSelection),
      toJson(proposal.originalEstimate),
      toJson(proposal.candidates),
      proposal.inputFingerprint,
      proposal.catalogFingerprint,
      proposal.createdAt,
      proposal.expiresAt
    ]
  );
}

export async function findBudgetProposal(id, customerId, { now = Date.now(), db = pool } = {}) {
  const [[row]] = await db.query('SELECT * FROM budget_proposals WHERE id = ? AND customer_id = ? AND expires_at > ?', [
    id,
    customerId,
    now
  ]);
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    context: parseJson(row.context),
    originalSelection: parseJson(row.original_selection),
    originalEstimate: parseJson(row.original_estimate),
    candidates: parseJson(row.candidates, []),
    inputFingerprint: row.input_fingerprint,
    catalogFingerprint: row.catalog_fingerprint,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at)
  };
}
