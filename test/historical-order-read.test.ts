/**
 * Historical read authority must neither replace the current binding nor authorize new purchases.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { Interface } from "ethers";
import { Phase0Wallet, POLICY_ABI } from "../src/index.js";
const addr = (n: number) => "0x" + n.toString(16).padStart(40, "0"),
  id = (n: number) => "0x" + n.toString(16).padStart(64, "0");
test("historical reads verify original delegate and scope without rebinding or permitting writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "historical-read-")),
    abi = new Interface(POLICY_ABI);
  let delegate = "",
    revoked = false,
    chain = "0x7a69";
  const rpc = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const q = JSON.parse(raw);
    let result: unknown;
    if (q.method === "eth_chainId") result = chain;
    else if (q.method === "eth_getBlockByNumber")
      result = {
        number: "0x20",
        hash: id(32),
        parentHash: id(31),
        timestamp: "0x64",
        nonce: "0x0000000000000000",
        difficulty: "0x0",
        gasLimit: "0x100000",
        gasUsed: "0x0",
        miner: addr(1),
        extraData: "0x",
        transactions: [],
      };
    else if (q.method === "eth_call")
      result = abi.encodeFunctionResult("policies", [
        delegate,
        addr(4),
        addr(5),
        addr(6),
        10,
        100,
        0,
        1,
        50,
        revoked,
      ]);
    else {
      res.writeHead(400);
      res.end();
      return;
    }
    res.end(JSON.stringify({ jsonrpc: "2.0", id: q.id, result }));
  });
  await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
  try {
    const created = await Phase0Wallet.initialize(
      dir,
      "historical-test-password",
    );
    delegate = await created.address();
    const address = rpc.address();
    if (!address || typeof address === "string") throw Error();
    const policy = {
      version: "agentpay.safe-module.v1",
      chainId: 31337,
      module: addr(1),
      safe: addr(2),
      delegate,
      policyId: id(2),
      factory: addr(5),
      registry: addr(6),
      token: addr(4),
      registryRpcUrl: `http://127.0.0.1:${address.port}`,
      maxAmount: "10",
      validUntil: 2000,
    };
    await created.bindPolicy(policy);
    const wallet = await Phase0Wallet.open(dir);
    await wallet.unlock("historical-test-password");
    const before = await readFile(join(dir, "policy.json"), "utf8");
    const scope = {
      network: "eip155:31337",
      module: addr(1),
      safe: addr(2),
      policyId: id(1),
    };
    const request = {
      action: "order.read",
      payloadHash: id(4),
      requestNonce: id(5),
      validBefore: 160,
    };
    const proof = await wallet.signHistoricalOrderRead(request, scope, 100);
    assert.equal(proof.request.policyId, id(1));
    assert.equal(wallet.status().policyId, id(2));
    assert.equal(await readFile(join(dir, "policy.json"), "utf8"), before);
    await assert.rejects(
      wallet.signHistoricalOrderRead(
        { ...request, action: "order.prepare" },
        scope,
        100,
      ),
      { code: "INVALID_ACTION" },
    );
    for (const patch of [
      { safe: addr(9) },
      { module: addr(9) },
      { network: "eip155:1" },
    ])
      await assert.rejects(
        wallet.signHistoricalOrderRead(request, { ...scope, ...patch }, 100),
        { code: "RECOVERY_SCOPE_INVALID" },
      );
    revoked = true;
    await wallet.signHistoricalOrderRead(
      { ...request, requestNonce: id(88) },
      scope,
      100,
    );
    revoked = false;
    delegate = addr(9);
    await assert.rejects(wallet.signHistoricalOrderRead(request, scope, 100), {
      code: "RECOVERY_POLICY_UNAVAILABLE",
    });
    chain = "0x1";
    await assert.rejects(wallet.signHistoricalOrderRead(request, scope, 100), {
      code: "MIGRATION_CHAIN_MISMATCH",
    });
  } finally {
    await new Promise<void>((r) => rpc.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
