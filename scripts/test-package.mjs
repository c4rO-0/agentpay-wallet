// Exercise only installed public entries, in a project with no sibling repositories.
import { mkdtemp, readFile, writeFile, copyFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const output = process.argv[2];
if (process.argv.length > 3) throw Error('Usage: node scripts/test-package.mjs [ARTIFACT_DIRECTORY]');
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
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], root, true));
  for (const {path} of packed.files) {
    assert.match(path, /^(lib\/[^/]+\.(js|d\.ts)|bin\/agentpay-wallet\.mjs|package\.json|README\.md|LICENSE|CHANGELOG\.md|doc\/(usage|README)\.md|doc\/reference\/(local-ipc|public-package)\.md)$/);
    assert.notEqual(path, 'lib/server-process.js');
  }
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({private: true, type: 'module', dependencies: {[pkg.name]: `file:${join(dir, packed.filename)}`}}));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], dir);
  // Type-check a real consumer against the installed declarations, not source paths.
  await writeFile(join(dir, 'consumer.mts'), `
import { callWallet, readCapability, WalletError } from '@c4roa0/agentpay-wallet';
import { Phase0Wallet, initializeCapabilities, type Phase0Policy } from '@c4roa0/agentpay-wallet/local';
export async function inspect(data: string, policy: Phase0Policy) {
  const wallet = await Phase0Wallet.open(data);
  await initializeCapabilities(data);
  const token: string = await readCapability(data, 'agent');
  const reply: unknown = await callWallet(data + '/wallet.sock', token, 'status');
  return { address: await wallet.address(), reply, policy, error: WalletError };
}
`);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '--strict', '--module', 'NodeNext', '--target', 'ES2022', 'consumer.mts'], dir);
  await copyFile(join(root, 'scripts/package-consumer.mjs'), join(dir, 'consumer.mjs'));
  run(process.execPath, ['consumer.mjs', pkg.version], dir);
  if (output) {
    const destination = resolve(output);
    await mkdir(destination, {recursive: true});
    await copyFile(join(dir, packed.filename), join(destination, packed.filename));
    console.log(`Verified archive: ${join(destination, packed.filename)}`);
  }
  console.log('PASS: independent tarball install, public declarations, CLI and real IPC lifecycle; no chain or payment.');
} finally {
  await rm(dir, {recursive: true, force: true});
}
