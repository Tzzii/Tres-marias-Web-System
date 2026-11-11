/** Server-only Abstract transport. Each instance keeps an independent bounded verdict cache and quota cooldown. */
export function createAbstractLookup({ endpoint, parameter, apiKey, readVerdict }) {
  const cache = new Map();
  const pending = new Map();
  const cacheTtl = 15 * 60 * 1000;
  const cacheLimit = 500;
  let activeKey = '';
  let generation = 0;
  let retryAt = 0;

  async function request(value, key, requestGeneration) {
    let response;
    let result;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ [parameter]: value }),
        redirect: 'error',
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        const cooldown = response.status === 429 ? 60_000 : [403, 422].includes(response.status) ? 3_600_000 : 0;
        if (cooldown && generation === requestGeneration) retryAt = Math.max(retryAt, Date.now() + cooldown);
        return;
      }
      result = await response.json();
    } catch {
      // Never expose upstream responses, request data, or credentials in client errors/logs.
      return;
    }
    const verdict = readVerdict(result, value);
    if (typeof verdict !== 'boolean') return;
    if (generation === requestGeneration) {
      if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
      cache.set(value, { verdict, expiresAt: Date.now() + cacheTtl });
    }
    return verdict;
  }

  return async (value) => {
    const key = apiKey();
    if (activeKey !== key) {
      activeKey = key;
      generation++;
      cache.clear();
      pending.clear();
      retryAt = 0;
    }
    if (!key) return;
    const cached = cache.get(value);
    if (cached && cached.expiresAt > Date.now()) return cached.verdict;
    cache.delete(value);
    if (Date.now() < retryAt) return;
    let task = pending.get(value);
    if (!task) {
      task = request(value, key, generation);
      pending.set(value, task);
    }
    try {
      return await task;
    } finally {
      if (pending.get(value) === task) pending.delete(value);
    }
  };
}
