import { EventEmitter } from 'node:events';

// Only an invalidation signal. Never put records, account IDs, tokens or write payloads on this bus.
const changes = new EventEmitter();
export const publishChange = () => changes.emit('change');
export function onChange(listener) {
  changes.on('change', listener);
  return () => changes.off('change', listener);
}
