import { existsSync } from 'node:fs';

/**
 * The sample data lives in seedData/sample/, which .gitignore keeps on the developer's computer: GitHub
 * and the live server have no copy (2026-10-08). seed:api and db:roundtrip load it through here;
 * seed:starter never does.
 */
const SAMPLE = new URL('./sample/sample.js', import.meta.url);

/** What a script prints when this computer has no sample data. */
export const NO_SAMPLE_DATA =
  'The sample data is not on this computer: apps/api/src/seedData/sample/ is kept out of GitHub. ' +
  'Copy that folder from the computer that has it, or run npm run seed:starter for the business data only.';

/**
 * buildSampleSeed(business) from seedData/sample/sample.js, or null when the folder is not here.
 * An error inside a sample file that is here still throws, so a broken file is never taken for a missing one.
 */
export async function loadSampleSeed() {
  if (!existsSync(SAMPLE)) return null;
  const { buildSampleSeed } = await import(SAMPLE.href);
  return buildSampleSeed;
}
