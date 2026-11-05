import { ApiError } from '../../lib/ApiError.js';

// Includes nested ranking calls. Failed/unknown calls retain their reserved cost.
export function capTurnSpend(spend, { maxMicro = 250000, maxCalls = 7 } = {}) {
  let charged = 0,
    calls = 0;
  const reservations = new Map();
  return {
    async reserve(kind, amount) {
      const upper = Math.ceil(amount);
      if (!Number.isSafeInteger(upper) || upper < 1 || calls >= maxCalls || charged + upper > maxMicro)
        throw new ApiError(
          'RATE_LIMITED',
          'This AI request reached its processing limit. Simplify the request or contact the team.'
        );
      // Increment before awaiting the durable ledger to protect overlapping nested work too.
      charged += upper;
      calls++;
      const id = await spend.reserve(kind, upper);
      reservations.set(id, upper);
      return id;
    },
    async settle(id, actual, usage) {
      await spend.settle(id, actual, usage);
      if (!reservations.has(id)) return;
      const upper = reservations.get(id);
      reservations.delete(id);
      if (Number.isSafeInteger(actual) && actual >= 0) charged += actual - upper;
    }
  };
}
