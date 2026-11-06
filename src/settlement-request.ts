/**
 * Fixed authenticated action envelope, distinct from a payment commitment.
 * Validity uses Unix seconds; downstream Order authorization remains mandatory.
 */
import { getAddress, isHexString, TypedDataEncoder } from "ethers";
import { WalletError } from "./errors.js";
import type { Phase0Policy } from "./commitment.js";

export const SETTLEMENT_REQUEST_ACTIONS = [
  "notices.list",
  "notices.acknowledge",
  "delivery.confirm",
  "dispute.open",
  "dispute.read",
  "dispute.access",
  "dispute.result",
  "order.prepare",
  "order.read",
  "order.cancel",
  "service.ready",
  "market.connect",
] as const;
export type SettlementRequestAction =
  (typeof SETTLEMENT_REQUEST_ACTIONS)[number];
export const SETTLEMENT_REQUEST_TYPES = {
  AgentPaySettlementRequest: [
    { name: "safe", type: "address" },
    { name: "policyId", type: "bytes32" },
    { name: "action", type: "string" },
    { name: "payloadHash", type: "bytes32" },
    { name: "requestNonce", type: "bytes32" },
    { name: "validBefore", type: "uint64" },
  ],
};

export function buildSettlementRequest(
  policy: Phase0Policy,
  input: unknown,
  nowSeconds: number,
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new WalletError("INVALID_FIELDS", "request must be an object");
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  const expected = [
    "action",
    "payloadHash",
    "requestNonce",
    "validBefore",
  ].sort();
  if (keys.join("|") !== expected.join("|"))
    throw new WalletError(
      "INVALID_FIELDS",
      "request fields do not match the fixed schema",
    );
  if (
    !SETTLEMENT_REQUEST_ACTIONS.includes(
      value.action as SettlementRequestAction,
    )
  )
    throw new WalletError(
      "INVALID_ACTION",
      "unsupported Settlement request action",
    );
  if (
    !isHexString(value.payloadHash, 32) ||
    !isHexString(value.requestNonce, 32)
  )
    throw new WalletError("INVALID_FIELDS", "request hashes must be bytes32");
  // Existing-Order support can outlive spending expiry, but only with a short proof.
  // This does not let order.prepare extend spending authority or decide Order access.
  const validBefore = Number(value.validBefore);
  if (
    !Number.isSafeInteger(validBefore) ||
    validBefore <= nowSeconds ||
    (![
      "market.connect",
      "order.read",
      "dispute.read",
      "dispute.access",
      "dispute.result",
      "notices.list",
      "notices.acknowledge",
      "delivery.confirm",
      "dispute.open",
      "order.cancel",
      "service.ready",
    ].includes(String(value.action)) &&
      validBefore > policy.validUntil) ||
    (validBefore > policy.validUntil && validBefore > nowSeconds + 300)
  ) {
    throw new WalletError(
      "REQUEST_EXPIRED",
      "request validity is outside the active policy",
    );
  }
  const domain = {
    name: "AgentPay Settlement Request",
    version: "1",
    chainId: policy.chainId,
    verifyingContract: policy.module,
  };
  const message = {
    safe: getAddress(policy.safe),
    policyId: policy.policyId,
    action: value.action,
    payloadHash: value.payloadHash,
    requestNonce: value.requestNonce,
    validBefore,
  };
  return {
    domain,
    message,
    requestId: TypedDataEncoder.hash(domain, SETTLEMENT_REQUEST_TYPES, message),
  };
}
