// Standard short-context USD rates, verified 2026-11-05 against official model pages.
// A dollar per million tokens equals a microdollar per token. Conservatively
// price cached inputs at the uncached rate; these limits are not an invoice.
export const TEXT_MODEL_RATES = Object.freeze({
  'gpt-6-luna': Object.freeze({ input: 0.1, output: 0.5 }),
  'gpt-6.1-sol': Object.freeze({ input: 2, output: 10 })
});

export function textCostMicro(model, inputTokens, outputTokens) {
  if (!Object.hasOwn(TEXT_MODEL_RATES, model)) throw new Error('Unsupported AI text model.');
  const rate = TEXT_MODEL_RATES[model];
  return Math.ceil(inputTokens * rate.input + outputTokens * rate.output);
}
