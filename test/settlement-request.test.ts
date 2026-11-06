/**
 * Public action schemas, bounded signatures, error provenance and local HTTP timeout behavior.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { buildSettlementRequest } from "../src/settlement-request.js";
import {
  callSettlementWalletApi,
  hashWalletActionPayload,
  normalizeWalletActionPayload,
} from "../src/settlement-http.js";
import { WalletError, publicError } from "../src/errors.js";
import type { Phase0Policy } from "../src/commitment.js";
import type { Phase0Wallet } from "../src/wallet.js";

const policy: Phase0Policy = {
  version: "agentpay.safe-module.v1",
  chainId: 31337,
  module: `0x${"22".repeat(20)}`,
  safe: `0x${"33".repeat(20)}`,
  delegate: `0x${"11".repeat(20)}`,
  policyId: `0x${"44".repeat(32)}`,
  factory: `0x${"55".repeat(20)}`,
  registry: `0x${"66".repeat(20)}`,
  registryRpcUrl: "http://127.0.0.1:8547",
  token: `0x${"77".repeat(20)}`,
  maxAmount: "1000000",
  validUntil: 3000,
};

test("builds only a fixed, short-lived Settlement request authorization", () => {
  const built = buildSettlementRequest(
    policy,
    {
      action: "notices.list",
      payloadHash: `0x${"88".repeat(32)}`,
      requestNonce: `0x${"99".repeat(32)}`,
      validBefore: 2000,
    },
    1000,
  );
  assert.equal(built.message.safe, policy.safe);
  assert.match(built.requestId, /^0x[0-9a-f]{64}$/);
  assert.throws(
    () =>
      buildSettlementRequest(
        policy,
        {
          action: "wallet.sign",
          payloadHash: `0x${"88".repeat(32)}`,
          requestNonce: `0x${"99".repeat(32)}`,
          validBefore: 2000,
        },
        1000,
      ),
    /unsupported/,
  );
  assert.throws(
    () =>
      buildSettlementRequest(
        policy,
        {
          action: "notices.list",
          payloadHash: `0x${"88".repeat(32)}`,
          requestNonce: `0x${"99".repeat(32)}`,
          validBefore: 999,
        },
        1000,
      ),
    /validity/,
  );
});

test("normalizes each HTTP action before hashing its signed payload", () => {
  assert.deepEqual(
    normalizeWalletActionPayload("notices.list", { limit: 500 }),
    { limit: 100 },
  );
  assert.equal(
    hashWalletActionPayload("notices.list", { limit: 5 }),
    "0xd585706584306ab5bde88da6d70b5ce00728437b88e6fd6dc62bd80c0e93cade",
  );
  assert.throws(
    () => normalizeWalletActionPayload("delivery.confirm", { orderId: "bad" }),
    /bytes32/,
  );
  const prepare = {
    orderRequestId: `0x${"01".repeat(32)}`,
    skillId: `0x${"02".repeat(32)}`,
    profileHash: `0x${"03".repeat(32)}`,
    offerId: `0x${"04".repeat(32)}`,
    requestHash: `0x${"05".repeat(32)}`,
    requestedMaxUsageUnits: "10",
  };
  assert.deepEqual(
    normalizeWalletActionPayload("order.prepare", prepare),
    prepare,
  );
  const withoutOffer = { ...prepare };
  delete (withoutOffer as { offerId?: string }).offerId;
  assert.deepEqual(
    normalizeWalletActionPayload("order.prepare", withoutOffer),
    withoutOffer,
  );
  const terms = {
    baseAmountAtomic: "0",
    unitPriceAtomic: "1",
    serviceWindowSeconds: 3600,
  };
  const payload = {
    orderRequestId: `0x${"1".repeat(64)}`,
    skillId: `0x${"2".repeat(64)}`,
    profileHash: `0x${"3".repeat(64)}`,
    requestHash: `0x${"4".repeat(64)}`,
    requestedMaxUsageUnits: "1",
    acceptedTerms: terms,
  };
  assert.deepEqual(normalizeWalletActionPayload("order.prepare", payload), {
    orderRequestId: payload.orderRequestId,
    skillId: payload.skillId,
    profileHash: payload.profileHash,
    acceptedTerms: terms,
    requestHash: payload.requestHash,
    requestedMaxUsageUnits: "1",
  });
  assert.deepEqual(
    normalizeWalletActionPayload("order.read", {
      orderId: `0x${"06".repeat(32)}`,
    }),
    { orderId: `0x${"06".repeat(32)}` },
  );
  assert.deepEqual(
    normalizeWalletActionPayload("service.ready", {
      orderId: `0x${"06".repeat(32)}`,
      requestHash: `0x${"07".repeat(32)}`,
    }),
    { orderId: `0x${"06".repeat(32)}`, requestHash: `0x${"07".repeat(32)}` },
  );
  assert.throws(
    () =>
      normalizeWalletActionPayload("order.prepare", {
        ...prepare,
        requestedMaxUsageUnits: "0",
      }),
    /positive uint/,
  );
});

test("Wallet Settlement HTTP timeout covers both headers and response body", async () => {
  const server = createServer((request, response) => {
    if (request.url?.includes("/body/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.write("{");
    }
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("expected TCP port");
  const wallet = {
    signSettlementRequest: async () => ({ signature: "test" }),
  } as unknown as Phase0Wallet;
  try {
    for (const path of ["/headers", "/body"]) {
      await assert.rejects(
        callSettlementWalletApi(
          wallet,
          `http://127.0.0.1:${address.port}${path}`,
          "notices.list",
          {},
          1000,
          60,
        ),
        (error: unknown) =>
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "SETTLEMENT_TIMEOUT",
      );
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test("reviewed Settlement codes map directly; unknown codes keep provenance under a default", async () => {
  const server = createServer((request, response) => {
    const kind = request.url?.split("/")[1];
    const code =
      kind === "known"
        ? "POLICY_PROFILE_MISMATCH"
        : [
              "PROVIDER_RESTRICTED",
              "SERVICE_RESTRICTED",
              "BUYER_RESTRICTED",
              "RESTRICTION_STATE_UNAVAILABLE",
            ].includes(kind || "")
          ? kind!
          : kind === "paused"
            ? "NEW_ORDERS_PAUSED"
            : kind === "unknown"
              ? "future.settlement-rule"
              : kind === "constructor" ||
                  kind === "toString" ||
                  kind === "hasOwnProperty"
                ? kind
                : "invalid-code\n";
    response.writeHead(422, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: false,
        error: { code, message: "reviewed rejection" },
      }),
    );
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("expected TCP port");
  const wallet = {
    signSettlementRequest: async () => ({ signature: "test" }),
  } as unknown as Phase0Wallet;
  try {
    for (const [path, walletCode, settlementCode] of [
      ["known", "POLICY_PROFILE_MISMATCH", "POLICY_PROFILE_MISMATCH"],
      ["paused", "NEW_ORDERS_PAUSED", "NEW_ORDERS_PAUSED"],
      ...[
        "PROVIDER_RESTRICTED",
        "SERVICE_RESTRICTED",
        "BUYER_RESTRICTED",
        "RESTRICTION_STATE_UNAVAILABLE",
      ].map((code) => [code, code, code]),
      ["unknown", "SETTLEMENT_REQUEST_REJECTED", "future.settlement-rule"],
      ["constructor", "SETTLEMENT_REQUEST_REJECTED", "constructor"],
      ["toString", "SETTLEMENT_REQUEST_REJECTED", "toString"],
      ["hasOwnProperty", "SETTLEMENT_REQUEST_REJECTED", "hasOwnProperty"],
      ["malformed", "SETTLEMENT_REQUEST_REJECTED", undefined],
    ]) {
      await assert.rejects(
        callSettlementWalletApi(
          wallet,
          `http://127.0.0.1:${address.port}/${path}`,
          "notices.list",
          {},
          1000,
          1000,
        ),
        (error: unknown) => {
          assert(error instanceof WalletError);
          assert.equal(error.code, walletCode);
          assert.equal(error.settlementCode, settlementCode);
          assert.equal(error.message, "reviewed rejection");
          assert.deepEqual(JSON.parse(JSON.stringify(publicError(error))), {
            code: walletCode,
            message: "reviewed rejection",
            ...(settlementCode ? { settlementCode } : {}),
          });
          return true;
        },
      );
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test("expired permission allows short support/connection proofs but never new spending", () => {
  const expired = { ...policy, validUntil: 900 };
  const input = {
    action: "dispute.access",
    payloadHash: `0x${"8".repeat(64)}`,
    requestNonce: `0x${"9".repeat(64)}`,
    validBefore: 1060,
  };
  // One table owns the short existing-Order/connection proof rule; payment preparation stays forbidden.
  for (const action of [
    "dispute.access",
    "service.ready",
    "delivery.confirm",
    "market.connect",
  ]) {
    assert.equal(
      buildSettlementRequest(expired, { ...input, action }, 1000).message
        .action,
      action,
    );
    assert.throws(
      () =>
        buildSettlementRequest(
          expired,
          { ...input, action, validBefore: 1301 },
          1000,
        ),
      /validity/,
    );
  }
  assert.throws(
    () =>
      buildSettlementRequest(
        expired,
        { ...input, action: "order.prepare" },
        1000,
      ),
    /validity/,
  );
});
test("request lookup uses an exclusive signed selector and rejects mixed IDs", () => {
  const orderRequestId = "0x" + "ab".repeat(32);
  assert.deepEqual(
    normalizeWalletActionPayload("order.read", { orderRequestId }),
    { orderRequestId },
  );
  assert.throws(() =>
    normalizeWalletActionPayload("order.read", {
      orderRequestId,
      orderId: "0x" + "cd".repeat(32),
    }),
  );
  assert.notEqual(
    hashWalletActionPayload("order.read", { orderRequestId }),
    hashWalletActionPayload("order.read", { orderId: orderRequestId }),
  );
});
test("preparation refuses an unexpected original Policy before signing or HTTP", async () => {
  let signed = false;
  const wallet = {
    marketConnectionScope: () => ({
      network: "eip155:31337",
      module: policy.module,
      safe: policy.safe,
      policyId: policy.policyId,
    }),
    signSettlementRequest: async () => {
      signed = true;
      throw Error("must not sign");
    },
  } as unknown as Phase0Wallet;
  const input = {
    orderRequestId: "0x" + "01".repeat(32),
    skillId: "0x" + "02".repeat(32),
    profileHash: "0x" + "03".repeat(32),
    requestHash: "0x" + "04".repeat(32),
    requestedMaxUsageUnits: "1",
  };
  await assert.rejects(
    callSettlementWalletApi(
      wallet,
      "http://127.0.0.1:1",
      "order.prepare",
      input,
      1000,
      100,
      undefined,
      {
        network: "eip155:31337",
        module: policy.module,
        safe: policy.safe,
        policyId: "0x" + "ff".repeat(32),
      },
    ),
    { code: "RECOVERY_SCOPE_INVALID" },
  );
  assert.equal(signed, false);
});
