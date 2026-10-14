import { existsSync } from 'node:fs';

const SAMPLE = new URL('./sample/sample.js', import.meta.url);

export const NO_SAMPLE_DATA =
  'The sample data is not on this computer: apps/api/src/seedData/sample/ is kept out of GitHub. ' +
  'Copy that folder from the computer that has it, or run npm run seed:starter for the business data only.';

export async function loadSampleSeed() {
  if (!existsSync(SAMPLE)) return null;
  const { buildSampleSeed } = await import(SAMPLE.href);
  return buildSampleSeed;
}
