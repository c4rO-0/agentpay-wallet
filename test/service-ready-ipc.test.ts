/**
 * Agent-facing readiness through real IPC without exposing signing material; remote responses are fixtures.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyTypedData } from "ethers";
import {
  callWallet,
  initializeCapabilities,
  Phase0Wallet,
  readCapability,
  SETTLEMENT_REQUEST_TYPES,
  startWalletServer,
  WalletError,
} from "../src/index.js";

test("Agent capability requests service readiness through fixed Wallet IPC without receiving signing material", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "agentpay-service-ready-ipc-"));
  const password = "service-ready-test-secret";
  const orderId = `0x${"11".repeat(32)}`;
  const requestHash = `0x${"22".repeat(32)}`;
  let observed: Record<string, any> | null = null;
  let invalidExpiry = false;
  const settlement = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    observed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      (observed as Record<string, any>).authorization.request.action ===
      "order.prepare"
    ) {
      response.writeHead(422, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: false,
          error: {
            code: "POLICY_PROFILE_MISMATCH",
            message: "Wallet policy does not match Settlement profile",
          },
        }),
      );
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        result: {
          state: "ready",
          authorizationId: "asa_test",
          orderId,
          requestHash,
          providerId: "provider-fixture",
          skillId: `0x${"aa".repeat(32)}`,
          profileHash: `0x${"bb".repeat(32)}`,
          maxUsageUnits: "1",
          expiresAt: invalidExpiry
            ? "2026-09-27T09:05:00"
            : "2026-09-27T09:05:00.000Z",
          authorization: "opaque-one-time-value",
        },
        notices: [],
      }),
    );
  });
  await new Promise<void>((resolve) =>
    settlement.listen(0, "127.0.0.1", resolve),
  );
  const address = settlement.address();
  if (!address || typeof address === "string")
    throw new Error("Settlement test server failed");
  const settlementUrl = `http://127.0.0.1:${address.port}`;
  let walletServer: Awaited<ReturnType<typeof startWalletServer>> | null = null;
  try {
    const wallet = await Phase0Wallet.initialize(dataDir, password);
    const delegate = await wallet.address();
    await wallet.bindPolicy({
      version: "agentpay.safe-module.v1",
      chainId: 31337,
      module: `0x${"33".repeat(20)}`,
      safe: `0x${"44".repeat(20)}`,
      delegate,
      policyId: `0x${"55".repeat(32)}`,
      factory: `0x${"66".repeat(20)}`,
      registry: `0x${"77".repeat(20)}`,
      registryRpcUrl: "http://127.0.0.1:8547",
      token: `0x${"88".repeat(20)}`,
      maxAmount: "1000000",
      validUntil: Math.floor(Date.now() / 1000) + 3600,
    });
    await initializeCapabilities(dataDir);
    walletServer = await startWalletServer(dataDir);
    const agentToken = await readCapability(dataDir, "agent");
    const adminToken = await readCapability(dataDir, "admin");
    await assert.rejects(
      () =>
        callWallet(
          walletServer!.socketPath,
          agentToken,
          "requestSettlementServiceReady",
          { settlementUrl, orderId, requestHash },
        ),
      (error) => error instanceof WalletError && error.code === "LOCKED",
    );
    await callWallet(walletServer.socketPath, adminToken, "unlock", {
      password,
    });
    const result = (await callWallet(
      walletServer.socketPath,
      agentToken,
      "requestSettlementServiceReady",
      { settlementUrl, orderId, requestHash },
    )) as Record<string, any>;
    const captured = observed as unknown as Record<string, any>;
    assert.equal(result.result.authorization, "opaque-one-time-value");
    assert.deepEqual(captured.payload, { orderId, requestHash });
    assert.equal(captured.authorization.request.action, "service.ready");
    assert.equal(
      await verifyTypedData(
        captured.authorization.request.safe
          ? {
              name: "AgentPay Settlement Request",
              version: "1",
              chainId: 31337,
              verifyingContract: `0x${"33".repeat(20)}`,
            }
          : {},
        SETTLEMENT_REQUEST_TYPES,
        captured.authorization.request,
        captured.authorization.signature,
      ),
      delegate,
    );
    assert.equal("privateKey" in result, false);
    assert.equal("signature" in result, false);
    assert.equal(
      result.result.expiresAtMs,
      Date.parse("2026-09-27T09:05:00.000Z"),
    );
    invalidExpiry = true;
    await assert.rejects(
      () =>
        callWallet(
          walletServer!.socketPath,
          agentToken,
          "requestSettlementServiceReady",
          { settlementUrl, orderId, requestHash },
        ),
      (error) =>
        error instanceof WalletError &&
        error.code === "SETTLEMENT_RESPONSE_INVALID",
    );
    invalidExpiry = false;
    await assert.rejects(
      () =>
        callWallet(
          walletServer!.socketPath,
          agentToken,
          "prepareSettlementOrder",
          {
            settlementUrl,
            orderRequestId: `0x${"99".repeat(32)}`,
            skillId: `0x${"aa".repeat(32)}`,
            profileHash: `0x${"bb".repeat(32)}`,
            requestHash: `0x${"cc".repeat(32)}`,
            requestedMaxUsageUnits: "1",
          },
        ),
      (error) =>
        error instanceof WalletError &&
        error.code === "POLICY_PROFILE_MISMATCH" &&
        error.settlementCode === "POLICY_PROFILE_MISMATCH" &&
        error.message === "Wallet policy does not match Settlement profile",
    );
    await assert.rejects(
      () =>
        callWallet(
          walletServer!.socketPath,
          agentToken,
          "signSettlementRequest",
          {},
        ),
      (error) =>
        error instanceof WalletError && error.code === "METHOD_NOT_ALLOWED",
    );
  } finally {
    if (walletServer) await walletServer.close();
    await new Promise<void>((resolve, reject) =>
      settlement.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(dataDir, { recursive: true, force: true });
  }
});
