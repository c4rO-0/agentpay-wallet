/**
 * Replacement authorization and retained history; controlled RPC does not submit real transactions.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { Interface } from "ethers";
import { Phase0Wallet } from "../src/wallet.js";
import { POLICY_ABI } from "../src/policy-migration.js";
import { validateRenewal } from "../src/policy-renewal.js";
const at = (n: number) => "0x" + n.toString(16).padStart(40, "0"),
  id = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const source = {
  version: "agentpay.safe-module.v1",
  chainId: 31337,
  module: at(1),
  safe: at(2),
  delegate: at(3),
  factory: at(4),
  registry: at(5),
  token: at(6),
  policyId: id(1),
  maxAmount: "10",
  validUntil: 1000,
  registryRpcUrl: "http://127.0.0.1:8547",
};
test("renewal preserves identity and rejects an unrevoked active source or expired target", () => {
  const target = {
    ...source,
    policyId: id(2),
    maxAmount: "20",
    validUntil: 3000,
  };
  assert.equal(
    validateRenewal(source, target, 2000).destination.maxAmount,
    "20",
  );
  for (const field of ["safe", "delegate", "registry", "token"])
    assert.throws(
      () => validateRenewal(source, { ...target, [field]: at(9) }, 2000),
      /Renewal must preserve/,
    );
  for (const field of ["module", "factory"]) {
    assert.throws(
      () => validateRenewal(source, { ...target, [field]: at(9) }, 2000),
      /Revoke/,
    );
    assert.equal(
      validateRenewal(source, { ...target, [field]: at(9) }, 2000, true)
        .destination[field as "module" | "factory"],
      at(9),
    );
  }
  assert.throws(
    () => validateRenewal({ ...source, validUntil: 2500 }, target, 2000),
    /Revoke the active old permission/,
  );
  assert.throws(
    () => validateRenewal(source, { ...target, validUntil: 1500 }, 2000),
    /new permission has expired/,
  );
});
test("Wallet verifies chain fixtures, preserves key/history, and replays renewal from a prepared pending journal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "renew-wallet-"));
  const now = Math.floor(Date.now() / 1000),
    abi = new Interface(POLICY_ABI),
    safe = new Interface([
      "function isModuleEnabled(address) view returns(bool)",
    ]);
  let delegate = at(3),
    spent = "0",
    enabled = true,
    oldRevoked = true,
    newFactory = source.factory;
  const rpc = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const c = JSON.parse(raw);
    let result: unknown;
    switch (c.method) {
      case "eth_chainId":
        result = "0x7a69";
        break;
      case "eth_getCode":
        result = "0x6000";
        break;
      case "eth_getBlockByNumber":
        result = {
          number: "0x20",
          hash: id(32),
          parentHash: id(31),
          timestamp: "0x" + now.toString(16),
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
          c.params[0].data.startsWith(
            safe.getFunction("isModuleEnabled")!.selector,
          )
        )
          result = safe.encodeFunctionResult("isModuleEnabled", [enabled]);
        else {
          const isNew =
            abi.decodeFunctionData("policies", c.params[0].data)[1] === id(2);
          result = abi.encodeFunctionResult("policies", [
            delegate,
            source.token,
            isNew ? newFactory : source.factory,
            source.registry,
            isNew ? "20" : "10",
            "100",
            isNew ? spent : "40",
            1,
            isNew ? now + 3600 : now + 600,
            isNew ? false : oldRevoked,
          ]);
        }
        break;
      default:
        res.writeHead(400);
        res.end();
        return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: c.id, result }));
  });
  await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
  try {
    const wallet = await Phase0Wallet.initialize(dir, "fixture-secret");
    delegate = await wallet.address();
    const address = rpc.address();
    if (!address || typeof address === "string") throw Error();
    const old = {
      ...source,
      validUntil: now + 600,
      delegate,
      registryRpcUrl: `http://127.0.0.1:${address.port}`,
    };
    await wallet.bindPolicy(old);
    const key = await readFile(join(dir, "session.keystore.json"), "utf8");
    const request = {
      expectedPolicyId: id(1),
      target: {
        chainId: 31337,
        rpcUrl: old.registryRpcUrl,
        module: old.module,
        safe: old.safe,
        policyId: id(2),
      },
    };
    await assert.rejects(wallet.renewPolicy(request), /LOCKED/);
    await wallet.unlock("fixture-secret");
    oldRevoked = false;
    await assert.rejects(
      wallet.renewPolicy(request),
      /Revoke the active old permission/,
    );
    oldRevoked = true;
    spent = "1";
    await assert.rejects(
      wallet.renewPolicy(request),
      /RENEWAL_TARGET_ALREADY_USED/,
    );
    spent = "0";
    enabled = false;
    await assert.rejects(
      wallet.renewPolicy(request),
      /RESTORE_MODULE_DISABLED/,
    );
    enabled = true;
    await assert.rejects(
      wallet.renewPolicy({ ...request, expectedPolicyId: id(9) }),
      /RENEWAL_SOURCE_CONFLICT/,
    );
    newFactory = at(9);
    await wallet.renewPolicy(request);
    assert.equal(wallet.policy?.policyId, id(2));
    assert.equal(wallet.policy?.factory, newFactory);
    assert.equal(
      await readFile(join(dir, "session.keystore.json"), "utf8"),
      key,
    );
    assert.equal(
      JSON.parse(
        await readFile(join(dir, "policy-renewals", id(1) + ".json"), "utf8"),
      ).source.policyId,
      id(1),
    );
    // Stored-state regression fixture, not a crash injected into the write operation.
    // The normal successful renewal above is executed through the Wallet API.
    const journal = JSON.parse(
      await readFile(join(dir, "policy-renewal.json"), "utf8"),
    );
    await writeFile(
      join(dir, "policy-renewal.json"),
      JSON.stringify({ ...journal, state: "pending" }),
      { mode: 0o600 },
    );
    const reopened = await Phase0Wallet.open(dir);
    await reopened.unlock("fixture-secret");
    await reopened.renewPolicy(request);
    assert.equal(reopened.status().policyMigrationPending, undefined);
    await reopened.renewPolicy(request);
    assert.equal(reopened.policy?.policyId, id(2));
  } finally {
    await new Promise<void>((r) => rpc.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("renewal is admin-only; agent token cannot replace a Policy", async () => {
  const {
    initializeCapabilities,
    startWalletServer,
    readCapability,
    callWallet,
  } = await import("../src/ipc.js");
  const dir = await mkdtemp(join(tmpdir(), "renew-auth-"));
  let server: Awaited<ReturnType<typeof startWalletServer>> | undefined;
  try {
    await Phase0Wallet.initialize(dir, "fixture-test-secret");
    await initializeCapabilities(dir);
    server = await startWalletServer(dir);
    const agent = await readCapability(dir, "agent"),
      admin = await readCapability(dir, "admin");
    await assert.rejects(
      callWallet(server.socketPath, agent, "renewPolicy", {}),
      (e: any) => e.code === "METHOD_NOT_ALLOWED",
    );
    await assert.rejects(
      callWallet(server.socketPath, admin, "renewPolicy", {}),
      (e: any) => e.code === "LOCKED",
    );
  } finally {
    await server?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
