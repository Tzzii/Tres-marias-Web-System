import { pool } from '../../db.js';
import { parseJson } from '../../lib/json.js';

function project(row) {
  return (
    row && {
      id: row.id,
      revision: Number(row.revision),
      status: row.status,
      context: parseJson(row.context),
      options: parseJson(row.options, []),
      noFitReasons: parseJson(row.no_fit_reasons, []),
      catalogFingerprint: row.catalog_fingerprint,
      inputFingerprint: row.input_fingerprint,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
      selectedOptionId: row.selected_option_id,
      submittedRef: row.submitted_ref
    }
  );
}

export async function findOwned(customerId, id, conn = pool, lock = false) {
  const [[row]] = await conn.query(
    'SELECT * FROM package_proposals WHERE customer_id = ? AND id = ?' + (lock ? ' FOR UPDATE' : ''),
    [customerId, id]
  );
  return project(row);
}

export async function findRequest(customerId, requestId, conn = pool) {
  const [[row]] = await conn.query('SELECT * FROM package_proposals WHERE customer_id = ? AND request_id = ?', [
    customerId,
    requestId
  ]);
  return project(row);
}

export async function findSubmittedReservation(customerId, ref, conn = pool) {
  const [[row]] = await conn.query('SELECT ref, created_at FROM reservations WHERE customer_id = ? AND ref = ?', [
    customerId,
    ref
  ]);
  return row ? { reservationRef: row.ref, submittedAt: Number(row.created_at) } : null;
}

// The unique owner/request key claims generation before any provider call, including simultaneous requests on different workers.
export async function claim(row) {
  try {
    await pool.query(
      `INSERT INTO package_proposals (id, customer_id, request_id, input_fingerprint, catalog_fingerprint,
        context, options, no_fit_reasons, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', 'pending', ?, ?)`,
      [
        row.id,
        row.customerId,
        row.requestId,
        row.inputFingerprint,
        row.catalogFingerprint,
        JSON.stringify(row.context),
        row.createdAt,
        row.expiresAt
      ]
    );
    return true;
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    return false;
  }
}

export async function finish(id, { status, options, noFitReasons }, conn = pool) {
  await conn.query(
    "UPDATE package_proposals SET status = ?, options = ?, no_fit_reasons = ? WHERE id = ? AND status = 'pending'",
    [status, JSON.stringify(options), JSON.stringify(noFitReasons), id]
  );
}

export async function selectOption(conn, id, optionId) {
  await conn.query('UPDATE package_proposals SET selected_option_id = ? WHERE id = ?', [optionId, id]);
}
