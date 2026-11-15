/**
 * Trusted in-process encryption/signing primitive, not the Agent-facing API.
 * IPC and Wallet validation must remain in front of its general typed-data method.
 */
import { readFile } from "node:fs/promises";
import { getAddress, Wallet } from "ethers";
import { publishNewKey } from "./key-import.js";
import { WalletError } from "./errors.js";
import { assertPrivateFile, exists, removeIfPresent } from "./files.js";

export class JsonKeystoreBackend {
  readonly path: string;
  #wallet: Wallet | null = null;
  // Decryption yields to other commands. Only the latest uncancelled attempt may
  // install a signer; lock/destruction invalidate attempts already in flight.
  #unlockGeneration = 0;
  #destroying = false;

  constructor(path: string) {
    this.path = path;
  }

  get locked(): boolean {
    return this.#wallet === null;
  }

  async create(
    password: string,
  ): Promise<{ address: string; encryptionMs: number; rssDeltaBytes: number }> {
    if (await exists(this.path))
      throw new WalletError("KEY_EXISTS", "session key already exists");
    assertPassword(password);
    let generated: Wallet | ReturnType<typeof Wallet.createRandom> | undefined =
      Wallet.createRandom();
    const wallet = new Wallet(generated.privateKey);
    generated = undefined;
    const started = performance.now();
    const rssBefore = process.memoryUsage().rss;
    const json = await wallet.encrypt(password);
    const encryptionMs = Math.round(performance.now() - started);
    const rssDeltaBytes = Math.max(0, process.memoryUsage().rss - rssBefore);
    await publishNewKey(this.path, json);
    return { address: wallet.address, encryptionMs, rssDeltaBytes };
  }

  // Locked metadata is useful for display; restore requires unlocking to prove key possession.
  async address(): Promise<string> {
    if (this.#wallet) return this.#wallet.address;
    const json = await this.#readKeystore();
    try {
      const parsed = JSON.parse(json) as { address?: unknown };
      if (typeof parsed.address !== "string")
        throw new Error("missing address");
      return getAddress(`0x${parsed.address.replace(/^0x/, "")}`);
    } catch {
      throw new WalletError("INVALID_KEYSTORE", "keystore metadata is invalid");
    }
  }

  async unlock(
    password: string,
  ): Promise<{ address: string; decryptionMs: number; rssDeltaBytes: number }> {
    assertPassword(password);
    if (this.#destroying)
      throw new WalletError(
        "KEY_BUSY",
        "Key deletion is in progress; check Wallet status.",
      );
    const generation = ++this.#unlockGeneration;
    const started = performance.now();
    const rssBefore = process.memoryUsage().rss;
    try {
      const json = await this.#readKeystore();
      const wallet = await Wallet.fromEncryptedJson(json, password);
      if (generation !== this.#unlockGeneration || this.#destroying)
        throw new WalletError(
          "UNLOCK_CANCELLED",
          "Unlock was cancelled by a later Wallet operation. Unlock again only when ready.",
        );
      this.#wallet = new Wallet(wallet.privateKey);
      return {
        address: this.#wallet.address,
        decryptionMs: Math.round(performance.now() - started),
        rssDeltaBytes: Math.max(0, process.memoryUsage().rss - rssBefore),
      };
    } catch (error) {
      if (generation !== this.#unlockGeneration)
        throw new WalletError(
          "UNLOCK_CANCELLED",
          "Unlock was cancelled by a later Wallet operation. Unlock again only when ready.",
        );
      if (error instanceof WalletError) throw error;
      throw new WalletError("UNLOCK_FAILED", "keystore unlock failed");
    }
  }

  // Release the decrypted object. JavaScript cannot promise physical memory erasure.
  lock(): void {
    this.#unlockGeneration++;
    this.#wallet = null;
  }

  async signTypedData(
    domain: Parameters<Wallet["signTypedData"]>[0],
    types: Parameters<Wallet["signTypedData"]>[1],
    value: Parameters<Wallet["signTypedData"]>[2],
  ): Promise<string> {
    if (!this.#wallet) throw new WalletError("LOCKED", "wallet is locked");
    return this.#wallet.signTypedData(domain, types, value);
  }

  async destroy(): Promise<string> {
    const address = await this.address();
    this.#destroying = true;
    this.lock();
    try {
      await removeIfPresent(this.path);
      return address;
    } finally {
      this.lock();
      this.#destroying = false;
    }
  }

  async #readKeystore(): Promise<string> {
    if (!(await exists(this.path)))
      throw new WalletError("KEY_MISSING", "session key is missing");
    await assertPrivateFile(this.path);
    return readFile(this.path, "utf8");
  }
}

function assertPassword(password: string): void {
  if (typeof password !== "string" || password.length < 12) {
    throw new WalletError(
      "WEAK_UNLOCK_SECRET",
      "unlock secret must contain at least 12 characters",
    );
  }
}
