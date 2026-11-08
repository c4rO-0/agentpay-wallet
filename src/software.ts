/** Capture package identity once, before an update can replace files on disk.
 * This is a local compatibility report, not attestation or payment authority.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(require.resolve('@c4roa0/agentpay-wallet/package.json'), 'utf8'));
function installedProtocolVersion(): string {
  // Resolve the public export from Wallet itself, including nested npm dependencies.
  let directory = dirname(require.resolve('@c4roa0/agentpay-protocol/schema'));
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      if (pkg.name !== '@c4roa0/agentpay-protocol' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
        throw Error('Installed Protocol package identity is invalid.');
      }
      return pkg.version;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) throw Error('Installed Protocol package metadata is missing.');
    directory = parent;
  }
}
export const walletSoftware = Object.freeze({
  name: '@c4roa0/agentpay-wallet',
  version: String(manifest.version),
  interfaceVersion: 1,
  protocolVersion: installedProtocolVersion(),
});
