/**
 * Fixed-purpose connection proofs and real IPC capability separation; no live Market account is used.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeMarketConnection,
  signMarketConnection,
} from "../src/market-connection.js";
import { SETTLEMENT_REQUEST_TYPES } from "../src/settlement-request.js";
import { verifyTypedData, keccak256, toUtf8Bytes } from "ethers";
import { Phase0Wallet } from "../src/wallet.js";
import {
  initializeCapabilities,
  startWalletServer,
  callWallet,
  readCapability,
} from "../src/ipc.js";
const payload = {
  marketOrigin: "https://market.example",
  accountId: "alice",
  challengeId: "1".repeat(64),
  nonce: "2".repeat(64),
  label: "Work PC",
  expiresAtMs: 1100000,
};
test("connection proof has fixed fields, purpose, nickname and bounded expiry", async () => {
  const calls: any[] = [];
  const wallet: any = {
    async signSettlementRequest(input: any, now: any) {
      calls.push([input, now]);
      return { request: input };
    },
  };
  const result = await signMarketConnection(wallet, payload, 1000);
  assert.deepEqual(result.payload, payload);
  assert.equal(calls[0][0].action, "market.connect");
  assert.equal(calls[0][0].validBefore, 1060);
  assert.equal(
    calls[0][0].payloadHash,
    "0x24148a962ea5dd145458972cab826c553df80666d87e5a40346d3333a4853591",
  );
  await signMarketConnection(
    wallet,
    { ...payload, label: "Home laptop" },
    1000,
  );
  assert.notEqual(calls[0][0].payloadHash, calls[1][0].payloadHash);
  for (const patch of [
    { marketOrigin: "http://example.com" },
    { marketOrigin: "https://market.example/path" },
    { label: "\nWork" },
    { label: "" },
    { label: "a".repeat(65) },
    { label: "PC\u202e" },
    { label: "PC\u0085" },
    { label: "PC\u200b" },
    { label: "ﷺ".repeat(10) },
    { accountId: "bad\naccount" },
    { nonce: "bad" },
    { action: "delivery.confirm" },
  ])
    assert.throws(() => normalizeMarketConnection({ ...payload, ...patch }));
  await assert.rejects(() =>
    signMarketConnection(wallet, { ...payload, expiresAtMs: 1000000 }, 1000),
  );
  await assert.rejects(() =>
    signMarketConnection(wallet, { ...payload, expiresAtMs: 2000000 }, 1000),
  );
  await signMarketConnection(
    wallet,
    { ...payload, expiresAtMs: 1600999 },
    1000,
  ); // Millisecond remainder and small host skew are safe; signature still lasts at most 60s.
});
test("admin connects through real IPC with a verifiable proof; Agent cannot discover or sign the connection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wallet-market-ipc-"));
  let server;
  try {
    await Phase0Wallet.initialize(dir, "fixture secret");
    await initializeCapabilities(dir);
    server = await startWalletServer(dir);
    const agent = await readCapability(dir, "agent"),
      admin = await readCapability(dir, "admin");
    for (const method of ["marketConnectionScope", "signMarketConnection"])
      await assert.rejects(
        () => callWallet(server!.socketPath, agent, method, payload),
        { code: "METHOD_NOT_ALLOWED" },
      );
    await assert.rejects(
      () => callWallet(server!.socketPath, admin, "marketConnectionScope"),
      { code: "POLICY_UNBOUND" },
    );
    await assert.rejects(
      () =>
        callWallet(server!.socketPath, admin, "signMarketConnection", {
          ...payload,
          expiresAtMs: Date.now() + 60000,
        }),
      { code: "POLICY_UNBOUND" },
    );
    await assert.rejects(
      () =>
        callWallet(server!.socketPath, admin, "signMarketConnection", {
          text: "sign anything",
        }),
      { code: "INVALID_FIELDS" },
    );
    const { address } = (await callWallet(
      server.socketPath,
      admin,
      "getAddress",
    )) as { address: string };
    const now = Math.floor(Date.now() / 1000);
    const policy = {
      version: "agentpay.safe-module.v1",
      chainId: 31337,
      module: "0x" + "1".repeat(40),
      safe: "0x" + "2".repeat(40),
      delegate: address,
      policyId: "0x" + "3".repeat(64),
      factory: "0x" + "4".repeat(40),
      registry: "0x" + "5".repeat(40),
      token: "0x" + "6".repeat(40),
      registryRpcUrl: "http://127.0.0.1:1",
      maxAmount: "10",
      validUntil: now - 1,
    };
    await callWallet(server.socketPath, admin, "bindPolicy", { policy });
    const challenge = { ...payload, expiresAtMs: (now + 120) * 1000 };
    await assert.rejects(
      callWallet(server.socketPath, admin, "signMarketConnection", challenge),
      { code: "LOCKED" },
    );
    await callWallet(server.socketPath, admin, "unlock", {
      password: "fixture secret",
    });
    // Expired spending permission still permits this fixed-purpose proof. No chain writes occur.
    const proof = (await callWallet(
      server.socketPath,
      admin,
      "signMarketConnection",
      challenge,
    )) as {
      payload: typeof payload;
      authorization: { request: Record<string, any>; signature: string };
    };
    assert.deepEqual(proof.payload, challenge);
    const { request, signature } = proof.authorization;
    assert.equal(request.action, "market.connect");
    assert.equal(request.safe.toLowerCase(), policy.safe);
    assert.equal(request.policyId, policy.policyId);
    assert.equal(
      request.payloadHash,
      keccak256(toUtf8Bytes(JSON.stringify(challenge))),
    );
    const checkedAt = Math.floor(Date.now() / 1000);
    assert.ok(Number(request.validBefore) > now);
    assert.ok(
      Number(request.validBefore) <=
        Math.min(checkedAt + 60, challenge.expiresAtMs / 1000),
    );
    assert.equal(
      verifyTypedData(
        {
          name: "AgentPay Settlement Request",
          version: "1",
          chainId: 31337,
          verifyingContract: policy.module,
        },
        SETTLEMENT_REQUEST_TYPES,
        request,
        signature,
      ),
      address,
    );
    const bound = (await callWallet(server.socketPath, admin, "status")) as {
      policyId: string;
    };
    assert.equal(bound.policyId, policy.policyId);
  } finally {
    await server?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Wallet nicknames retain multilingual text and emoji joiners", () => {
  for(const label of ["工作电脑", "Home 👩‍💻", "a".repeat(64)])
    assert.equal(normalizeMarketConnection({...payload,label}).label,label);
});
