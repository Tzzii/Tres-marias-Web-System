import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

/**
 * Hashing for passwords and one-time codes (bcrypt). Only hashes are stored: a plain password or
 * code never reaches the database or a log line. The seeder (src/seed.js) hashes the sample
 * accounts' passwords with the same function, so every hash in the database has the same cost.
 */

/** bcrypt cost for every stored password and code: 2^10 rounds, roughly 70 ms per hash on a laptop. */
export const BCRYPT_ROUNDS = 10;

// Hash of a random value no one knows, made once at start-up (about 70 ms): checkSecret compares
// against it when the account does not exist, so that case costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), BCRYPT_ROUNDS);

/** Hash a new password or code for storing. */
export const hashSecret = (plain) => bcrypt.hash(String(plain), BCRYPT_ROUNDS);

/**
 * True when `plain` matches `hash`. With no hash (an email with no account) it still runs one full
 * bcrypt comparison, against the dummy hash, and returns false: a wrong email then takes as long as
 * a wrong password, so response times do not reveal which emails have accounts (§8 Phase 3 gotcha).
 * bcrypt reads only the first 72 bytes of a password; the route schemas cap passwords at 200 characters.
 */
export async function checkSecret(plain, hash) {
  const matches = await bcrypt.compare(String(plain ?? ''), hash || DUMMY_HASH);
  return Boolean(hash) && matches;
}

/**
 * A new one-time code of `length` digits (6 for sign-in and reset codes), e.g. "048213".
 * crypto.randomInt is a cryptographically secure generator, unlike Math.random; the padding keeps
 * the leading zeros, so every one of the 10^length codes is equally likely.
 */
export function newCode(length) {
  return String(crypto.randomInt(0, 10 ** length)).padStart(length, '0');
}
