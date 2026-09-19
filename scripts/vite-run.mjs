/**
 * Runs Vite for one app: node scripts/vite-run.mjs <dev|build|preview> <client|admin>
 *
 * Why this wrapper exists: Rollup (the bundler behind Vite) reads everything after
 * a "#" in a path as a URL fragment, so builds fail in a folder named
 * "capstone website #2". When the project path contains "#", Vite is pointed at a
 * directory junction in the system temp folder whose path has no "#". When the
 * path is clean (for example after renaming the folder, or on a deploy server)
 * Vite runs directly and the junction is never created.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , command = 'dev', app = 'client'] = process.argv;

if (!['dev', 'build', 'preview'].includes(command)) {
  console.error(`Unknown command "${command}". Use dev, build or preview.`);
  process.exit(1);
}
if (!['client', 'admin'].includes(app)) {
  console.error(`Unknown app "${app}". Use client or admin.`);
  process.exit(1);
}

function resolveWorkspace() {
  if (!PROJECT_ROOT.includes('#')) return PROJECT_ROOT;

  const digest = crypto.createHash('sha1').update(PROJECT_ROOT).digest('hex').slice(0, 10);
  const link = path.join(os.tmpdir(), `tres-marias-${digest}`);

  if (fs.existsSync(link)) {
    const stats = fs.lstatSync(link);
    if (stats.isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(PROJECT_ROOT)) return link;
    fs.rmSync(link, { recursive: true, force: true });
  }

  fs.symlinkSync(PROJECT_ROOT, link, 'junction');
  console.log(`[vite-run] Project path contains "#", so Vite runs through: ${link}`);
  return link;
}

const workspace = resolveWorkspace();
const appDir = path.join(workspace, 'apps', app);
// Vite itself must also load through the junction, or it serves its own client from the "#" path
const viteBin = path.join(workspace, 'node_modules', 'vite', 'bin', 'vite.js');

const args = workspace === PROJECT_ROOT ? [viteBin] : ['--preserve-symlinks', '--preserve-symlinks-main', viteBin];
if (command !== 'dev') args.push(command);
args.push('--config', path.join(appDir, 'vite.config.js'));

// The dev server's dependency optimizer (esbuild) reports output paths relative to the
// *real* working directory, while Vite compares them against the junction path. Running
// dev / preview from a neutral directory keeps both sides identical. Builds run in place.
const cwd = command === 'build' ? appDir : os.tmpdir();
const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', env: { ...process.env, TM_APP_DIR: appDir } });
child.on('exit', (code) => process.exit(code === null ? 1 : code));
