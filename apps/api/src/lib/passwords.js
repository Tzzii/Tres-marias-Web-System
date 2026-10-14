import crypto from 'node:crypto';
import bcrypt from 'bcrypt';


export const BCRYPT_ROUNDS = 10;

const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), BCRYPT_ROUNDS);

export const hashSecret = (plain) => bcrypt.hash(String(plain), BCRYPT_ROUNDS);

export async function checkSecret(plain, hash) {
  const matches = await bcrypt.compare(String(plain ?? ''), hash || DUMMY_HASH);
  return Boolean(hash) && matches;
}

export function newCode(length) {
  return String(crypto.randomInt(0, 10 ** length)).padStart(length, '0');
}
