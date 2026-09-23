import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

// Absolute upload folder (apps/api/uploads by default, worked out by config.js). It is outside every public
// folder: files are only ever streamed back through an authenticated route.
const ROOT = config.storage.uploadDir;
const ROOT_PREFIX = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

/**
 * Absolute path for a storage key such as "proofs/pay-0023.jpg". Throws for any key that would land
 * outside ROOT ("../x", "a/../../x", "/etc/x", "C:\x", "", or the folder itself), so no caller can
 * read, write or delete another file on the server by mistake or on purpose.
 */
function resolveKey(key) {
  if (typeof key !== 'string' || key === '' || key.includes('\0')) throw new Error('Bad storage key.');
  const file = path.resolve(ROOT, key);
  if (!file.startsWith(ROOT_PREFIX)) throw new Error('Bad storage key.');
  return file;
}

/** Storage driver that keeps files in a folder on this server (STORAGE_DRIVER=local). */
export default {
  name: 'local',

  /** Save a new file and return its key. Never overwrites: an existing key fails with EEXIST. */
  async put(key, buffer) {
    const file = resolveKey(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer, { flag: 'wx' });
    return key;
  },

  /** A read stream of the file; a missing file shows up as the stream's 'error' event (ENOENT). */
  stream(key) {
    return createReadStream(resolveKey(key));
  },

  /** Delete the file. A file that is already gone is fine; any other failure (e.g. permissions) is thrown. */
  async remove(key) {
    const file = resolveKey(key);
    await unlink(file).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
};
