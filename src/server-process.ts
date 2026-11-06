/**
 * Minimal subprocess entry used by local process tests. Production-facing
 * standalone commands live in cli.ts; startup intentionally leaves Wallet locked.
 */
import { startWalletServer } from "./ipc.js";

const dataDir = process.argv[2];
if (!dataDir) {
  process.stderr.write("wallet data directory is required\n");
  process.exitCode = 2;
} else {
  const handle = await startWalletServer(dataDir);
  process.stdout.write("READY\n");
  const stop = async () => {
    await handle.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => {
    void stop();
  });
  process.once("SIGINT", () => {
    void stop();
  });
}
