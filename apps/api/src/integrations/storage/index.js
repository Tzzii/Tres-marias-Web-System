import { config } from '../../config.js';
import localDriver from './local.driver.js';

const drivers = { local: localDriver };

export const storage = drivers[config.storage.driver];
