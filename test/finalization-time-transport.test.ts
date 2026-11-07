/**
 * Finalization metadata on non-Order actions follows a separate path from Order and notice projections.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { callSettlementWalletApi } from "../src/settlement-http.js";
import type { Phase0Wallet } from "../src/wallet.js";
const { legacy, v2 } = JSON.parse(
  readFileSync(
    new URL(
      "../fixtures/agentpay-finalization-disclosure-v2/records.json",
      import.meta.resolve("@c4roa0/agentpay-protocol"),
    ),
    "utf8",
  ),
);
test("Wallet validates finalization on non-Order actions and preserves authorization material", async () => {
  const authorizationFixture = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/agentpay-service-authorization-v2/records.json",
        import.meta.resolve("@c4roa0/agentpay-protocol"),
      ),
      "utf8",
    ),
  );
  let finalization: unknown = legacy,
    deadlines: unknown = null;
  let authorization = authorizationFixture.legacy;
  const deadlineFixture = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/agentpay-order-deadlines-v2/records.json",
        import.meta.resolve("@c4roa0/agentpay-protocol"),
      ),
      "utf8",
    ),
  );
  const server = createServer((req, res) => {
    assert.match(req.headers.accept || "", /finalization-v2/);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        result: {
          ...authorization,
          authorization: "opaque",
          finalization,
          deadlines,
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  const wallet = {
    signSettlementRequest: async () => ({ signature: "fixture" }),
  } as unknown as Phase0Wallet;
  const call = () =>
    callSettlementWalletApi(
      wallet,
      `http://127.0.0.1:${address.port}`,
      "service.ready",
      {
        orderId: `0x${"1".repeat(64)}`,
        requestHash: authorizationFixture.legacy.requestHash,
      },
      1000,
    );
  try {
    for (const value of [legacy, v2]) {
      finalization = value;
      const response = await call();
      assert.deepEqual(response.result.finalization, v2);
      assert.equal(response.result.authorization, "opaque");
    }
    finalization = null;
    assert.equal((await call()).result.finalization, null);
    for (const value of [
      { ...legacy, releaseScheduledAt: "2026-09-27T09:10:50" },
      { ...v2, deliveryAcceptedAtMs: "1790000000000" },
      { ...v2, version: "unexpected" },
    ]) {
      finalization = value;
      await assert.rejects(
        call(),
        (error: unknown) =>
          !!error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "SETTLEMENT_RESPONSE_INVALID",
      );
    }
    finalization = null;
    for (const value of [deadlineFixture.legacy, deadlineFixture.v2]) {
      deadlines = value;
      assert.deepEqual((await call()).result.deadlines, deadlineFixture.v2);
    }
    deadlines = {
      ...deadlineFixture.legacy,
      refundAvailableAt: "2026-09-27T09:22:00",
    };
    await assert.rejects(
      call(),
      (error: unknown) =>
        !!error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "SETTLEMENT_RESPONSE_INVALID",
    );
    deadlines = null;
    for (const value of [
      authorizationFixture.legacy,
      authorizationFixture.v2,
    ]) {
      authorization = value;
      const response = await call();
      assert.equal(
        response.result.expiresAtMs,
        authorizationFixture.v2.expiresAtMs,
      );
    }
    const missing = { ...authorizationFixture.legacy };
    delete missing.expiresAt;
    for (const value of [
      missing,
      { ...authorizationFixture.v2, expiresAtMs: "1790000000000" },
      { ...authorizationFixture.legacy, orderId: `0x${"9".repeat(64)}` },
      { ...authorizationFixture.legacy, requestHash: `0x${"9".repeat(64)}` },
    ]) {
      authorization = value;
      await assert.rejects(
        call(),
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
