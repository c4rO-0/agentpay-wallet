/**
 * Order timestamp normalization and request identity; public legacy/current fixtures share one normalized result.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import {
  callSettlementWalletApi,
  hashWalletActionPayload,
} from "../src/settlement-http.js";
import type { Phase0Wallet } from "../src/wallet.js";
const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "../fixtures/agentpay-native-service-v1/records.json",
      import.meta.resolve("@agentpay/types"),
    ),
    "utf8",
  ),
);
const epoch = JSON.parse(
  readFileSync(
    new URL(
      "../fixtures/agentpay-participant-order-v2/records.json",
      import.meta.resolve("@agentpay/types"),
    ),
    "utf8",
  ),
);

test("Wallet negotiates timestamp v2, accepts explicit v1 adapter, and preserves request hash", async () => {
  let responseOrder = fixtures.buyerOrder;
  let captured: Record<string, unknown> | undefined;
  const server = createServer((request, response) => {
    assert.equal(
      request.headers.accept,
      "application/vnd.agentpay.participant-order-v2+json, application/vnd.agentpay.finalization-v2+json, application/vnd.agentpay.order-deadlines-v2+json, application/vnd.agentpay.service-authorization-v2+json, application/vnd.agentpay.delivery-result-v2+json, application/vnd.agentpay.wallet-notice-v2+json",
    );
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        result: { order: responseOrder },
        notices: [],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("no loopback port");
  const wallet = {
    signSettlementRequest: async (input: Record<string, unknown>) => {
      captured = input;
      return { signature: "fixture" };
    },
  } as unknown as Phase0Wallet;
  try {
    const payload = { orderId: fixtures.buyerOrder.orderId };
    for (const order of [fixtures.buyerOrder, epoch.buyerOrder]) {
      responseOrder = order;
      const value = await callSettlementWalletApi(
        wallet,
        `http://127.0.0.1:${address.port}`,
        "order.read",
        payload,
        1000,
      );
      assert.deepEqual(
        (value.result as Record<string, unknown>).order,
        epoch.buyerOrder,
      );
      assert.equal(
        captured?.payloadHash,
        hashWalletActionPayload("order.read", payload),
      );
      assert.equal(captured?.validBefore, 1060);
    }
    const prepare = {
      orderRequestId: `0x${"7".repeat(64)}`,
      skillId: fixtures.buyerOrder.skillId,
      profileHash: fixtures.buyerOrder.profileHash,
      requestHash: fixtures.buyerOrder.requestHash,
      requestedMaxUsageUnits: "1",
    };
    responseOrder = fixtures.buyerOrder;
    await callSettlementWalletApi(
      wallet,
      `http://127.0.0.1:${address.port}`,
      "order.prepare",
      prepare,
      1000,
    );
    for (const field of ["skillId", "profileHash", "requestHash"]) {
      responseOrder = { ...epoch.buyerOrder, [field]: `0x${"9".repeat(64)}` };
      await assert.rejects(
        callSettlementWalletApi(
          wallet,
          `http://127.0.0.1:${address.port}`,
          "order.prepare",
          prepare,
          1000,
        ),
        (error: unknown) =>
          !!error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "SETTLEMENT_RESPONSE_INVALID",
      );
    }
    for (const order of [
      null,
      fixtures.providerOrder,
      { ...fixtures.buyerOrder, createdAt: "2026-10-07 00:00:00" },
      { ...epoch.buyerOrder, createdAtMs: "1791020911000" },
      { ...epoch.buyerOrder, privateRequest: "secret" },
      { ...epoch.buyerOrder, orderId: `0x${"9".repeat(64)}` },
    ]) {
      responseOrder = order;
      await assert.rejects(
        callSettlementWalletApi(
          wallet,
          `http://127.0.0.1:${address.port}`,
          "order.read",
          payload,
          1000,
        ),
        (error: unknown) =>
          !!error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "SETTLEMENT_RESPONSE_INVALID",
      );
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
