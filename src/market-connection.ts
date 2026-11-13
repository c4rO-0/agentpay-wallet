/**
 * Administrative, purpose-bound proof for one Market account challenge.
 * Connecting a Wallet does not create spending permission or prove Safe ownership.
 */
import { keccak256, toUtf8Bytes, randomBytes, hexlify } from "ethers";
import { WalletError } from "./errors.js";
import type { Phase0Wallet } from "./wallet.js";

// Fixed administrative proof. It cannot sign arbitrary text, spend or confirm delivery.
export function normalizeMarketConnection(input: unknown) {
  const v = input as Record<string, unknown>;
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !==
      "accountId,challengeId,expiresAtMs,label,marketOrigin,nonce"
  )
    throw new WalletError(
      "INVALID_FIELDS",
      "Invalid Market connection challenge",
    );
  const origin = new URL(String(v.marketOrigin));
  if (
    origin.origin !== v.marketOrigin ||
    origin.username ||
    origin.password ||
    !(
      origin.protocol === "https:" ||
      (origin.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))
    )
  )
    throw new WalletError(
      "INVALID_FIELDS",
      "Market needs HTTPS or a local rehearsal origin",
    );
  if (
    typeof v.accountId !== "string" ||
    !/^[A-Za-z0-9_-]{1,191}$/.test(v.accountId) ||
    typeof v.challengeId !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.challengeId) ||
    typeof v.nonce !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.nonce) ||
    typeof v.label !== "string" ||
    !v.label.trim() ||
    v.label !== v.label.trim() ||
    v.label.length > 64 ||
    v.label.normalize("NFKC").toLowerCase().length > 64 ||
    /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(v.label) ||
    !Number.isSafeInteger(v.expiresAtMs) ||
    Number(v.expiresAtMs) < 1
  )
    throw new WalletError(
      "INVALID_FIELDS",
      "Invalid Market connection challenge",
    );
  return {
    marketOrigin: origin.origin,
    accountId: v.accountId,
    challengeId: v.challengeId,
    nonce: v.nonce,
    label: v.label,
    expiresAtMs: Number(v.expiresAtMs),
  };
}

export async function signMarketConnection(
  wallet: Phase0Wallet,
  input: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const payload = normalizeMarketConnection(input);
  if (
    payload.expiresAtMs <= nowSeconds * 1000 ||
    payload.expiresAtMs > nowSeconds * 1000 + 660000
  )
    throw new WalletError(
      "REQUEST_EXPIRED",
      "Market connection expired. Run the command again.",
    );
  const authorization = await wallet.signSettlementRequest(
    {
      action: "market.connect",
      payloadHash: keccak256(toUtf8Bytes(JSON.stringify(payload))),
      requestNonce: hexlify(randomBytes(32)),
      validBefore: Math.min(
        nowSeconds + 60,
        Math.floor(payload.expiresAtMs / 1000),
      ),
    },
    nowSeconds,
  );
  return { payload, authorization };
}
