import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const manifest = read('package.json');
const lock = read('package-lock.json');
const packages = ['package.json'];
for (const folder of ['apps', 'packages']) {
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const file = `${folder}/${entry.name}/package.json`;
    if (entry.isDirectory() && fs.existsSync(path.join(root, file))) packages.push(file);
  }
}

assert.equal(lock.version, manifest.version, 'Lockfile system version');
const workspaces = new Map(packages.map((file) => [read(file).name, manifest.version]));
for (const file of packages) {
  const pkg = read(file);
  const key = file === 'package.json' ? '' : file.replace('/package.json', '');
  assert.equal(pkg.version, manifest.version, `${file}: system version`);
  assert.equal(lock.packages[key]?.version, pkg.version, `${file}: lockfile version`);
  for (const [dependency, version] of Object.entries(pkg.dependencies || {})) {
    if (!workspaces.has(dependency)) continue;
    assert.equal(version, workspaces.get(dependency), `${file}: ${dependency} reference`);
    assert.equal(lock.packages[key].dependencies[dependency], version, `${file}: locked ${dependency} reference`);
  }
}
const documented = fs.readFileSync(path.join(root, 'README.md'), 'utf8').match(/\*\*System version: ([\d.]+)\*\*/)?.[1];
assert.equal(documented, manifest.version, 'README system version');
console.log(
  `System version ${manifest.version} is consistent across all ${packages.length} manifests, workspace dependencies, the lockfile, and README.`
);
