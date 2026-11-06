/**
 * Disposable key backup import and original Policy restoration with controlled chain state.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  symlink,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { Interface } from "ethers";
import {
  normalizeRestoreTarget,
  restoredPolicy,
} from "../src/policy-restore.js";
import { importSessionKey, publishNewKey } from "../src/key-import.js";
import {
  Phase0Wallet,
  initializeCapabilities,
  startWalletServer,
  callWallet,
  readCapability,
  POLICY_ABI,
} from "../src/index.js";
const at = (n: number) => `0x${n.toString(16).padStart(40, "0")}`,
  id = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const input = {
  chainId: 31337,
  rpcUrl: "http://127.0.0.1:8547",
  module: at(1),
  safe: at(2),
  policyId: id(1),
};
const terms = {
  delegate: at(3),
  token: at(4),
  factory: at(5),
  registry: at(6),
  maxPerPayment: "10",
  totalBudget: "100",
  spent: "40",
  validAfter: 1,
  validUntil: 2000000000,
  revoked: false,
};
test("restore preserves original identity, expiry, per-payment cap and spent budget", () => {
  const target = normalizeRestoreTarget(input, at(3));
  const result = restoredPolicy(target, terms, 100, true);
  assert.equal(result.remainingBudget, "60");
  assert.equal(result.policy.policyId, id(1));
  assert.equal(result.policy.maxAmount, "10");
  assert.equal(result.policy.validUntil, terms.validUntil);
  assert.equal(
    restoredPolicy(target, { ...terms, spent: "100" }, 100, true)
      .remainingBudget,
    "0",
  );
  for (const [change, code] of [
    [{ delegate: at(0) }, "RESTORE_POLICY_NOT_FOUND"],
    [{ delegate: at(7) }, "POLICY_KEY_MISMATCH"],
    [{ revoked: true }, "RESTORE_POLICY_REVOKED"],
    [{ validUntil: 100 }, "RESTORE_POLICY_EXPIRED"],
    [{ validAfter: 101 }, "RESTORE_POLICY_NOT_ACTIVE"],
    [{ spent: "101" }, "RESTORE_TERMS_INVALID"],
  ] as const) {
    assert.throws(
      () => restoredPolicy(target, { ...terms, ...change }, 100, true),
      (e: any) => e.code === code,
    );
  }
  assert.throws(
    () => restoredPolicy(target, terms, 100, false),
    /RESTORE_MODULE_DISABLED/,
  );
  assert.throws(
    () => normalizeRestoreTarget({ ...input, spent: "0" }, at(3)),
    /RESTORE_TARGET_INVALID/,
  );
});
test("key import verifies encrypted backup, refuses overwrites and unsafe paths; IPC restore verifies chain and admin authority", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wallet-restore-"));
  let ipc: Awaited<ReturnType<typeof startWalletServer>> | undefined;
  const abi = new Interface(POLICY_ABI),
    safeAbi = new Interface([
      "function isModuleEnabled(address) view returns(bool)",
    ]);
  let chain = "0x7a69",
    enabled = true,
    missing = false;
  const original = { ...terms };
  const methods: string[] = [];
  const rpc = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const c = JSON.parse(raw);
    methods.push(c.method);
    let result: unknown;
    switch (c.method) {
      case "eth_chainId":
        result = chain;
        break;
      case "eth_getCode":
        result = missing ? "0x" : "0x6000";
        break;
      case "eth_getBlockByNumber":
        result = {
          number: "0x20",
          hash: id(32),
          parentHash: id(31),
          timestamp: "0x6b49d200",
          nonce: "0x0000000000000000",
          difficulty: "0x0",
          gasLimit: "0x100000",
          gasUsed: "0x0",
          miner: at(1),
          extraData: "0x",
          transactions: [],
        };
        break;
      case "eth_call":
        if (
          c.params[0].to.toLowerCase() === input.module &&
          abi
            .decodeFunctionData("policies", c.params[0].data)[0]
            .toLowerCase() !== input.safe
        ) {
          result = abi.encodeFunctionResult("policies", [
            at(0),
            at(0),
            at(0),
            at(0),
            0,
            0,
            0,
            0,
            0,
            false,
          ]);
          break;
        }
        result = c.params[0].data.startsWith(
          safeAbi.getFunction("isModuleEnabled")!.selector,
        )
          ? safeAbi.encodeFunctionResult("isModuleEnabled", [enabled])
          : abi.encodeFunctionResult("policies", [
              original.delegate,
              original.token,
              original.factory,
              original.registry,
              original.maxPerPayment,
              original.totalBudget,
              original.spent,
              original.validAfter,
              original.validUntil,
              original.revoked,
            ]);
        break;
      default:
        res.writeHead(400);
        res.end();
        return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: c.id, result }));
  });
  await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
  try {
    const rawDir = join(dir, "raw");
    await importSessionKey(rawDir, {
      privateKey: id(9),
      password: "test-restore-password",
    });
    const rawWallet = await Phase0Wallet.open(rawDir);
    await rawWallet.unlock("test-restore-password");
    assert.equal(rawWallet.backend.locked, false);
    const secret = "test-restore-password";
    const source = await Phase0Wallet.initialize(join(dir, "source"), secret);
    const key = join(dir, "source", "session.keystore.json");
    const originalBytes = await readFile(key, "utf8");
    const restored = join(dir, "restored");
    await assert.rejects(
      importSessionKey(restored, {
        file: key,
        password: "wrong-password-value",
      }),
      (e: any) => e.code === "UNLOCK_FAILED",
    );
    await importSessionKey(restored, { file: key, password: secret });
    assert.equal(
      await readFile(join(restored, "session.keystore.json"), "utf8"),
      originalBytes,
    );
    assert.equal(
      (await stat(join(restored, "session.keystore.json"))).mode & 0o777,
      0o600,
    );
    await assert.rejects(
      importSessionKey(restored, { file: key, password: secret }),
      /RESTORE_DIRECTORY_NOT_EMPTY/,
    );
    await assert.rejects(
      publishNewKey(join(restored, "session.keystore.json"), "overwrite"),
      /KEY_EXISTS/,
    );
    await symlink(join(dir, "source"), join(dir, "symlink"));
    await assert.rejects(
      importSessionKey(join(dir, "symlink"), { file: key, password: secret }),
      /UNSAFE_DIRECTORY/,
    );
    const unsafe = join(dir, "unsafe.json");
    await writeFile(unsafe, originalBytes, { mode: 0o644 });
    await assert.rejects(
      importSessionKey(join(dir, "other"), { file: unsafe, password: secret }),
      /UNSAFE_FILE/,
    );
    const bad = JSON.parse(originalBytes);
    bad.Crypto = bad.Crypto || bad.crypto;
    bad.Crypto.kdfparams.n = 1073741824;
    await writeFile(unsafe, JSON.stringify(bad), { mode: 0o600 });
    await (await import("node:fs/promises")).chmod(unsafe, 0o600);
    await assert.rejects(
      importSessionKey(join(dir, "other"), { file: unsafe, password: secret }),
      /RESTORE_KEYSTORE_PARAMETERS/,
    );
    await initializeCapabilities(restored);
    ipc = await startWalletServer(restored);
    const admin = await readCapability(restored, "admin"),
      agent = await readCapability(restored, "agent");
    const address = rpc.address();
    if (!address || typeof address === "string") throw Error();
    const target = { ...input, rpcUrl: `http://127.0.0.1:${address.port}` };
    original.delegate = await source.address();
    for (const method of ["previewPolicyRestore", "restorePolicy"])
      await assert.rejects(
        callWallet(ipc.socketPath, agent, method, { target }),
        (e: any) => e.code === "METHOD_NOT_ALLOWED",
      );
    await assert.rejects(
      callWallet(ipc.socketPath, admin, "restorePolicy", { target }),
      (e: any) => e.code === "LOCKED",
    );
    await callWallet(ipc.socketPath, admin, "unlock", { password: secret });
    chain = "0x1";
    await assert.rejects(
      callWallet(ipc.socketPath, admin, "restorePolicy", { target }),
      (e: any) => e.code === "MIGRATION_CHAIN_MISMATCH",
    );
    chain = "0x7a69";
    enabled = false;
    await assert.rejects(
      callWallet(ipc.socketPath, admin, "restorePolicy", { target }),
      /RESTORE_MODULE_DISABLED/,
    );
    enabled = true;
    missing = true;
    await assert.rejects(
      callWallet(ipc.socketPath, admin, "restorePolicy", { target }),
      /RESTORE_CONTRACT_MISSING/,
    );
    missing = false;
    await assert.rejects(
      callWallet(ipc.socketPath, admin, "restorePolicy", {
        target: { ...target, safe: at(7) },
      }),
      /RESTORE_POLICY_NOT_FOUND/,
    );
    await callWallet(ipc.socketPath, admin, "previewPolicyRestore", { target });
    await assert.rejects(readFile(join(restored, "policy.json")), {
      code: "ENOENT",
    });
    await callWallet(ipc.socketPath, admin, "restorePolicy", { target });
    const bound = await readFile(join(restored, "policy.json"), "utf8");
    await callWallet(ipc.socketPath, admin, "restorePolicy", { target });
    assert.equal(await readFile(join(restored, "policy.json"), "utf8"), bound);
    await assert.rejects(
      callWallet(ipc.socketPath, admin, "restorePolicy", {
        target: { ...target, policyId: id(2) },
      }),
      (e: any) => e.code === "POLICY_ALREADY_BOUND",
    );
    await ipc.close();
    ipc = await startWalletServer(restored);
    await callWallet(ipc.socketPath, admin, "unlock", { password: secret });
    await callWallet(ipc.socketPath, admin, "restorePolicy", { target });
    original.revoked = true;
    await assert.rejects(
      callWallet(ipc.socketPath, admin, "restorePolicy", { target }),
      /RESTORE_POLICY_REVOKED/,
    );
    assert.equal(await readFile(join(restored, "policy.json"), "utf8"), bound);
    assert.equal(
      await readFile(join(restored, "session.keystore.json"), "utf8"),
      originalBytes,
    );
    assert.ok(
      methods.every((m) =>
        [
          "eth_chainId",
          "eth_getCode",
          "eth_getBlockByNumber",
          "eth_call",
        ].includes(m),
      ),
    );
  } finally {
    await ipc?.close();
    await new Promise<void>((r) => rpc.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
