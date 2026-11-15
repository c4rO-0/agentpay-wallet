/** One service owns a data directory until all of its in-flight work has ended.
 * The persistent lock file is never unlinked: replacing its inode defeats locking.
 * OS descriptor locks release on process exit, including SIGKILL; no PID recovery.
 */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ensurePrivateDirectory } from "./files.js";
import { WalletError } from "./errors.js";
const require = createRequire(import.meta.url);

export async function acquireServiceOwner(dataDir: string) {
  await ensurePrivateDirectory(dataDir);
  const handle = await open(
    join(dataDir, "service-owner.lock"),
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      info.uid !== process.getuid?.() ||
      info.mode & 0o077
    )
      throw new WalletError(
        "UNSAFE_FILE",
        "Wallet ownership file is unsafe; inspect this data directory.",
      );
    let tryLock: (fd: number) => boolean;
    try {
      ({ tryLock } = require("fs-native-extensions") as {
        tryLock: (fd: number) => boolean;
      });
    } catch {
      throw new WalletError(
        "LOCK_UNAVAILABLE",
        "Wallet file locking is unavailable. Reinstall the matching Wallet package before starting.",
      );
    }
    if (!tryLock(handle.fd))
      throw new WalletError(
        "WALLET_ALREADY_RUNNING",
        "A Wallet already owns this data directory. Use its running service or stop it before restarting.",
      );
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}
