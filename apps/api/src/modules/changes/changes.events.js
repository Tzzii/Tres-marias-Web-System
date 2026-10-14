import { EventEmitter } from 'node:events';

const changes = new EventEmitter();
export const publishChange = () => changes.emit('change');
export function onChange(listener) {
  changes.on('change', listener);
  return () => changes.off('change', listener);
}
