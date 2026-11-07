#!/usr/bin/env node
// Public command entry; resolving this path never depends on a sibling checkout.
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
} else if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
  console.log(`AgentPay Wallet

Run a local Wallet independently, or use AgentPay User for guided setup.

  agentpay-wallet init DATA_DIR      Create a Wallet; asks for an unlock secret
  agentpay-wallet serve DATA_DIR     Run in the foreground, initially locked
  agentpay-wallet status DATA_DIR    Check the running Wallet
  agentpay-wallet unlock DATA_DIR    Unlock using hidden terminal input
  agentpay-wallet lock DATA_DIR      Lock without revoking on-chain permission
  agentpay-wallet --version          Show the installed package version

Keep DATA_DIR outside the program installation. Example:
  agentpay-wallet init "$HOME/.local/share/agentpay-wallet"

Initialization does not grant spending permission.
See the package README for integration and the complete command reference.`);
} else {
  await import('../lib/cli.js');
}
