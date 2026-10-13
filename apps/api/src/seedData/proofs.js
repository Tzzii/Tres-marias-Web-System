import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/** Attach an explicitly marked local demo PNG to sample bank payments, when supplied. */
export async function prepareSampleProofs(rows) {
  const fixture = new URL('./sample/demo-bank-proof.png', import.meta.url);
  const proof = await readFile(fixture).catch((err) => (err.code === 'ENOENT' ? null : Promise.reject(err)));
  if (!proof) return;
  const key = 'proofs/demo-customer-bank-proof.png';
  await mkdir(path.join(config.storage.uploadDir, 'proofs'), { recursive: true });
  await writeFile(path.join(config.storage.uploadDir, key), proof);
  for (const payment of rows.payments.filter((p) => p.method === 'bank')) {
    payment.proof_key = key;
    payment.proof_mime = 'image/png';
    payment.proof_size = proof.length;
  }
}
