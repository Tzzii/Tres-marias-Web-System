
export function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : value;
  if (typeof text !== 'string') return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function toJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}
