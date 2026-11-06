/**
 * Import an original key without replacing another identity. Backup parsing
 * is bounded before decryption; secret input never belongs in audit metadata.
 */
import { constants } from "node:fs";
import { lstat, open, readdir, link, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Wallet, getAddress } from "ethers";
import { ensurePrivateDirectory } from "./files.js";
import { WalletError } from "./errors.js";
function fail(code: string): never {
  throw new WalletError(code, code);
}
// Publish a complete encrypted file without overwriting a competing init/import.
export async function publishNewKey(path: string, json: string) {
  const temporary = path + "." + randomUUID() + ".tmp";
  const h = await open(temporary, "wx", 0o600);
  try {
    try {
      await h.writeFile(json);
      await h.sync();
    } finally {
      await h.close();
    }
    await link(temporary, path);
    const parent = await open(
      dirname(path),
      constants.O_RDONLY | constants.O_DIRECTORY,
    );
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") fail("KEY_EXISTS");
    throw e;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function importSessionKey(
  dataDir: string,
  source:
    | { file: string; password: string }
    | { privateKey: string; password: string },
) {
  try {
    const before = await lstat(dataDir);
    if (
      !before.isDirectory() ||
      before.isSymbolicLink() ||
      before.uid !== process.getuid?.()
    )
      fail("UNSAFE_DIRECTORY");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (source.password.length < 12) fail("WEAK_UNLOCK_SECRET");
  await ensurePrivateDirectory(dataDir);
  const st = await lstat(dataDir);
  if (st.uid !== process.getuid?.()) fail("UNSAFE_DIRECTORY");
  const files = await readdir(dataDir);
  if (files.some((name) => !["agent.token", "admin.token"].includes(name)))
    fail("RESTORE_DIRECTORY_NOT_EMPTY");
  let json: string, address: string;
  if ("file" in source) {
    const h = await open(
      source.file,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const info = await h.stat();
      if (
        !info.isFile() ||
        info.uid !== process.getuid?.() ||
        info.mode & 0o077 ||
        info.size > 131072
      )
        fail("UNSAFE_FILE");
      json = await h.readFile("utf8");
    } finally {
      await h.close();
    }
    // Bound work before decrypting untrusted backup parameters on small machines.
    try {
      const parsed = JSON.parse(json),
        crypto = parsed.Crypto || parsed.crypto,
        k = crypto?.kdfparams;
      if (
        crypto?.kdf !== "scrypt" ||
        !k ||
        !Number.isInteger(k.n) ||
        k.n < 2 ||
        k.n > 131072 ||
        (k.n & (k.n - 1)) !== 0 ||
        k.r !== 8 ||
        k.p !== 1 ||
        k.dklen !== 32
      )
        fail("RESTORE_KEYSTORE_PARAMETERS");
      const w = await Wallet.fromEncryptedJson(json, source.password);
      address = getAddress(w.address);
      if (
        getAddress("0x" + String(parsed.address).replace(/^0x/, "")) !== address
      )
        fail("INVALID_KEYSTORE");
    } catch (e) {
      if (e instanceof WalletError) throw e;
      fail("UNLOCK_FAILED");
    }
  } else {
    if (!/^0x[0-9a-fA-F]{64}$/.test(source.privateKey))
      fail("INVALID_SESSION_KEY");
    if (source.password.length < 12) fail("WEAK_UNLOCK_SECRET");
    let w: Wallet;
    try {
      w = new Wallet(source.privateKey);
    } catch {
      fail("INVALID_SESSION_KEY");
    }
    address = w.address;
    json = await w.encrypt(source.password);
  }
  await publishNewKey(join(dataDir, "session.keystore.json"), json);
  return { address, locked: true };
}
