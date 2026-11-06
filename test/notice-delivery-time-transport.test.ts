/**
 * Notice/delivery timestamp normalization and confirmation identity through the HTTP client with a stub signer.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { callSettlementWalletApi } from "../src/settlement-http.js";
import type { Phase0Wallet } from "../src/wallet.js";
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../fixtures/${name}/records.json`,
        import.meta.resolve("@agentpay/types"),
      ),
      "utf8",
    ),
  );
const notice = fixture("agentpay-wallet-notice-v2"),
  delivery = fixture("agentpay-delivery-result-v2");
test("Wallet HTTP client normalizes confirmation/notice times and binds confirmation to requested Order", async () => {
  let result = delivery.confirmationLegacy,
    notices: unknown = [notice.legacy];
  const server = createServer((req, res) => {
    assert.match(req.headers.accept || "", /wallet-notice-v2/);
    assert.match(req.headers.accept || "", /delivery-result-v2/);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, result, notices }));
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
      "delivery.confirm",
      { orderId: delivery.confirmationLegacy.orderId },
      1000,
    );
  const invalid = (error: unknown) =>
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "SETTLEMENT_RESPONSE_INVALID";
  try {
    for (const value of [
      delivery.confirmationLegacy,
      delivery.confirmationV2,
    ]) {
      result = value;
      const response = await call();
      assert.deepEqual(response.result, delivery.confirmationV2);
      assert.deepEqual(response.notices, [notice.v2]);
    }
    result = { ...delivery.confirmationV2, orderId: `0x${"9".repeat(64)}` };
    await assert.rejects(call(), invalid);
    result = delivery.confirmationV2;
    for (const value of [
      {},
      [
        {
          ...notice.legacy,
          payload: {
            ...notice.legacy.payload,
            releaseScheduledAt: "2026-09-27T09:10:00",
          },
        },
      ],
      [
        {
          ...notice.v2,
          payload: {
            ...notice.v2.payload,
            releaseScheduledAtMs: "1790000000000",
          },
        },
      ],
      [
        {
          ...notice.v2,
          payload: { ...notice.v2.payload, orderId: `0x${"9".repeat(64)}` },
        },
      ],
    ]) {
      notices = value;
      await assert.rejects(call(), invalid);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
