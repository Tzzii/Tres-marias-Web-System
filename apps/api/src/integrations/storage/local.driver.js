import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

const ROOT = config.storage.uploadDir;
const ROOT_PREFIX = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

function resolveKey(key) {
  if (typeof key !== 'string' || key === '' || key.includes('\0')) throw new Error('Bad storage key.');
  const file = path.resolve(ROOT, key);
  if (!file.startsWith(ROOT_PREFIX)) throw new Error('Bad storage key.');
  return file;
}

export default {
  name: 'local',

  async put(key, buffer) {
    const file = resolveKey(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer, { flag: 'wx' });
    return key;
  },

  stream(key) {
    return createReadStream(resolveKey(key));
  },

  async remove(key) {
    const file = resolveKey(key);
    await unlink(file).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
};
