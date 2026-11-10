/**
 * Scoped cancellation, response validation and IPC server recreation; no real refund is executed.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyTypedData } from "ethers";
import {
  Phase0Wallet,
  initializeCapabilities,
  startWalletServer,
  callWallet,
  readCapability,
  SETTLEMENT_REQUEST_TYPES,
  normalizeWalletActionPayload,
  hashWalletActionPayload,
} from "../src/index.js";
const b32 = (n: string) => "0x" + n.repeat(64);
const orderId = b32("a"),
  cancellationId = b32("b");
const closure = {
  version: "agentpay.order-closure.v1",
  state: "requested",
  reason: "user_cancel",
  requestedAtMs: 1792677004000,
  completedAtMs: null,
  transactionHash: null,
  errorCode: null,
};
test("cancellation validates exact fields before signing; both identifiers bind its payload hash", () => {
  assert.deepEqual(
    normalizeWalletActionPayload("order.cancel", { orderId, cancellationId }),
    { orderId, cancellationId },
  );
  for (const value of [
    null,
    [],
    { orderId },
    { orderId, cancellationId, signature: "caller-supplied" },
    { orderId: "short", cancellationId },
  ])
    assert.throws(() => normalizeWalletActionPayload("order.cancel", value));
  assert.notEqual(
    hashWalletActionPayload("order.cancel", { orderId, cancellationId }),
    hashWalletActionPayload("order.cancel", {
      orderId: b32("c"),
      cancellationId,
    }),
  );
  assert.notEqual(
    hashWalletActionPayload("order.cancel", { orderId, cancellationId }),
    hashWalletActionPayload("order.cancel", {
      orderId,
      cancellationId: b32("d"),
    }),
  );
});
test("real Wallet IPC preserves cancellation identity across server recreation; malformed replies fail closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wallet-order-cancel-")),
    password = "test-only-unlock-secret";
  let calls = 0,
    mode = "valid",
    captured: any;
  const http = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    captured = JSON.parse(body);
    calls++;
    if (mode === "maintenance") {
      res.writeHead(503,{"content-type":"application/json","retry-after":"60"});
      res.end(JSON.stringify({ok:false,error:{code:"SERVICE_MAINTENANCE",message:"maintenance"}}));return;
    }
    if (mode === "accepted") {
      res.writeHead(409);
      res.end(
        JSON.stringify({
          ok: false,
          error: {
            code: "ORDER_ALREADY_ACCEPTED",
            message: "Already accepted",
          },
        }),
      );
      return;
    }
    const result: any = {
      orderId: mode === "wrong-order" ? b32("c") : orderId,
      duplicate: calls > 1,
      closure: { ...closure },
    };
    if (mode === "private") result.closure.rawTransaction = "private";
    if (mode === "bad-time") result.closure.requestedAtMs = "2026-10-22";
    if (mode === "payment") result.paymentRequired = { amount: "1" };
    res.end(JSON.stringify({ ok: true, result, notices: [] }));
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const address = http.address();
  if (!address || typeof address === "string") throw Error();
  let server: Awaited<ReturnType<typeof startWalletServer>> | null = null;
  try {
    const wallet = await Phase0Wallet.initialize(dir, password),
      delegate = await wallet.address();
    const module = "0x" + "3".repeat(40);
    await wallet.bindPolicy({
      version: "agentpay.safe-module.v1",
      chainId: 31337,
      module,
      safe: "0x" + "4".repeat(40),
      delegate,
      policyId: b32("5"),
      factory: "0x" + "6".repeat(40),
      registry: "0x" + "7".repeat(40),
      registryRpcUrl: "http://127.0.0.1:1",
      token: "0x" + "8".repeat(40),
      maxAmount: "1000000",
      validUntil: Math.floor(Date.now() / 1000) + 3600,
    });
    await initializeCapabilities(dir);
    server = await startWalletServer(dir);
    const agent = await readCapability(dir, "agent"),
      admin = await readCapability(dir, "admin");
    const params = {
      settlementUrl: `http://127.0.0.1:${address.port}`,
      orderId,
      cancellationId,
    };
    await assert.rejects(
      callWallet(server.socketPath, agent, "cancelSettlementOrder", params),
      (e: any) => e.code === "LOCKED",
    );
    assert.equal(calls, 0);
    await callWallet(server.socketPath, admin, "unlock", { password });
    await assert.rejects(
      callWallet(server.socketPath, agent, "cancelSettlementOrder", {
        ...params,
        amount: "1",
      }),
      (e: any) => e.code === "INVALID_FIELDS",
    );
    assert.equal(calls, 0);
    const result: any = await callWallet(
      server.socketPath,
      agent,
      "cancelSettlementOrder",
      params,
    );
    assert.equal(result.result.closure.state, "requested");
    assert.deepEqual(captured.payload, { orderId, cancellationId });
    assert.equal(captured.authorization.request.action, "order.cancel");
    assert.equal(
      captured.authorization.request.payloadHash,
      hashWalletActionPayload("order.cancel", captured.payload),
    );
    assert.equal(
      verifyTypedData(
        {
          name: "AgentPay Settlement Request",
          version: "1",
          chainId: 31337,
          verifyingContract: module,
        },
        SETTLEMENT_REQUEST_TYPES,
        captured.authorization.request,
        captured.authorization.signature,
      ),
      delegate,
    );
    await assert.rejects(
      callWallet(server.socketPath, agent, "signSettlementRequest", {}),
      (e: any) => e.code === "METHOD_NOT_ALLOWED",
    );
    await server.close();
    server = await startWalletServer(dir);
    await callWallet(server.socketPath, admin, "unlock", { password });
    const retried: any = await callWallet(
      server.socketPath,
      agent,
      "cancelSettlementOrder",
      params,
    );
    // Duplicate is a fixture response, not proof of upstream refund idempotency.
    assert.equal(retried.result.duplicate, true);
    assert.deepEqual(captured.payload, { orderId, cancellationId });
    for (mode of ["wrong-order", "private", "bad-time", "payment"])
      await assert.rejects(
        callWallet(server.socketPath, agent, "cancelSettlementOrder", params),
        (e: any) => e.code === "SETTLEMENT_RESPONSE_INVALID",
      );
    mode = "maintenance";
    const beforeMaintenance=calls;
    await assert.rejects(callWallet(server.socketPath,agent,"cancelSettlementOrder",params),
      (e:any)=>e.code==="SERVICE_MAINTENANCE"&&e.settlementCode==="SERVICE_MAINTENANCE"&&e.message.includes("same request"));
    assert.equal(calls,beforeMaintenance+1,"maintenance must not automatically replay a write");
    assert.deepEqual(captured.payload,{orderId,cancellationId});
    mode="valid";
    await callWallet(server.socketPath,agent,"cancelSettlementOrder",params);
    assert.deepEqual(captured.payload,{orderId,cancellationId},"explicit retry keeps original identity");
    mode = "accepted";
    await assert.rejects(
      callWallet(server.socketPath, agent, "cancelSettlementOrder", params),
      (e: any) =>
        e.code === "ORDER_ALREADY_ACCEPTED" &&
        e.settlementCode === "ORDER_ALREADY_ACCEPTED",
    );
  } finally {
    if (server) await server.close();
    http.closeAllConnections();
    await new Promise<void>((r) => http.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  }
});
