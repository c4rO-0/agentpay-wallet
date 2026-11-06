/**
 * Private local-file helpers. Key publication and transition journals add
 * their own exclusivity/directory-sync requirements at the calling boundary.
 */
import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { WalletError } from "./errors.js";

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o077) !== 0
  ) {
    throw new WalletError(
      "UNSAFE_DIRECTORY",
      "wallet directory must be a private directory",
    );
  }
}

export async function assertPrivateFile(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    throw new WalletError(
      "UNSAFE_FILE",
      "wallet file permissions are not private",
    );
  }
}

export async function atomicWritePrivate(
  path: string,
  content: string,
): Promise<void> {
  const parent = dirname(path);
  await ensurePrivateDirectory(parent);
  const temporary = join(parent, `.tmp-${randomBytes(16).toString("hex")}`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await chmod(path, 0o600);
}

export async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
