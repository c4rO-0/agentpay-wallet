// Exercise only installed public entries, in a project with no sibling repositories.
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'wallet-package-'));
function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', timeout: 180000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || '');
    throw Error(`${command} exited ${result.status}`);
  }
  return result.stdout;
}
try {
  run(process.execPath, ['scripts/build-package.mjs'], root);
  const [packed] = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir], root, true));
  for (const {path} of packed.files) {
    assert.match(path, /^(lib\/[^/]+\.(js|d\.ts)|bin\/agentpay-wallet\.mjs|package\.json|README\.md|LICENSE|CHANGELOG\.md|doc\/(usage|README)\.md|doc\/reference\/(local-ipc|public-package)\.md)$/);
    assert.notEqual(path, 'lib/server-process.js');
  }
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({private: true, type: 'module', dependencies: {[pkg.name]: `file:${join(dir, packed.filename)}`}}));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], dir);
  await copyFile(join(root, 'scripts/package-consumer.mjs'), join(dir, 'consumer.mjs'));
  run(process.execPath, ['consumer.mjs', pkg.version], dir);
  console.log('PASS: independent tarball install, CLI and real IPC lifecycle; no chain or payment.');
} finally {
  await rm(dir, {recursive: true, force: true});
}
