// Runs after npm installation outside the source checkout. All keys are disposable.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { callWallet, readCapability } from '@c4roa0/agentpay-wallet';
import { Phase0Wallet, initializeCapabilities } from '@c4roa0/agentpay-wallet/local';

const cli = fileURLToPath(import.meta.resolve('@c4roa0/agentpay-wallet/cli'));
const bin = join(process.cwd(), 'node_modules/.bin/agentpay-wallet');
const version = spawnSync(bin, ['--version'], {encoding:'utf8'});
assert.equal(version.status, 0);
assert.equal(version.stdout.trim(), process.argv[2]);
const help = spawnSync(bin, ['--help'], {encoding:'utf8'});
assert.equal(help.status, 0);
assert.match(help.stdout, /agentpay-wallet init DATA_DIR/);
await assert.rejects(import('@c4roa0/agentpay-wallet/lib/keystore.js'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});

const data = await mkdtemp(join(tmpdir(), 'wallet-public-ipc-'));
const password = 'disposable package acceptance secret';
let child;
async function start() {
  child = spawn(process.execPath, [cli, 'serve', data], {stdio:['ignore','pipe','pipe']});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Wallet startup timed out')), 10000);
    let output='';
    const fail = () => { clearTimeout(timer); reject(Error('Wallet exited before ready')); };
    child.once('error', fail);
    child.once('exit', fail);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('"ready":true')) {
        clearTimeout(timer); child.off('exit', fail); child.off('error', fail); resolve();
      }
    });
  });
}
async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await done; } finally { clearTimeout(timer); }
}
try {
  const local = await Phase0Wallet.initialize(data, password);
  const address = await local.address();
  await initializeCapabilities(data);
  const admin = await readCapability(data, 'admin');
  const agent = await readCapability(data, 'agent');
  const socket = join(data, 'wallet.sock');
  await start();
  assert.equal((await callWallet(socket, agent, 'status')).locked, true);
  assert.equal((await callWallet(socket, agent, 'getAddress')).address, address);
  await assert.rejects(callWallet(socket, 'invalid-token', 'status'));
  await assert.rejects(callWallet(socket, agent, 'unlock', {password}));
  await assert.rejects(callWallet(socket, agent, 'signMessage', {message:'not permitted'}));
  await callWallet(socket, admin, 'unlock', {password});
  assert.equal((await callWallet(socket, agent, 'status')).locked, false);
  await stop();
  await start();
  assert.equal((await callWallet(socket, agent, 'getAddress')).address, address);
  assert.equal((await callWallet(socket, agent, 'status')).locked, true);
  console.log('PASS: installed public client, rejected capabilities/generic signing, restart keeps key and locks.');
} finally {
  await stop();
  await rm(data, {recursive:true, force:true});
}
