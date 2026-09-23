import { config } from '../../config.js';
import localDriver from './local.driver.js';

/**
 * The only file-storage entry point the app imports: storage.put(key, buffer), storage.stream(key), storage.remove(key).
 * STORAGE_DRIVER in apps/api/.env picks the driver; "local" (a folder on this server) is the only one for now,
 * and a cloud driver would keep the same three methods. Not used yet in Phase 0 (payment proofs arrive in Phase 8).
 */
const drivers = { local: localDriver };

export const storage = drivers[config.storage.driver];
