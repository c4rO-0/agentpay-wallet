/**
 * Pure identity/expiry rules for a replacement authorization. The caller
 * independently reads chain facts and persists the transition journal.
 */
import { normalizePolicy, type Phase0Policy } from "./commitment.js";
import { WalletError } from "./errors.js";
export function validateRenewal(
  sourceInput: unknown,
  destinationInput: unknown,
  now = Math.floor(Date.now() / 1000),
  sourceRevoked = false,
) {
  const source = normalizePolicy(sourceInput),
    destination = normalizePolicy(destinationInput);
  const fields = [
    "chainId",
    "safe",
    "delegate",
    "registry",
    "token",
    "registryRpcUrl",
  ] as const;
  if (
    fields.some((key) => source[key] !== destination[key]) ||
    source.policyId === destination.policyId
  )
    throw new WalletError(
      "RENEWAL_IDENTITY_MISMATCH",
      "Renewal must preserve network, Wallet, Safe, token, Registry and RPC",
    );
  if (
    (source.validUntil > now ||
      source.module !== destination.module ||
      source.factory !== destination.factory) &&
    !sourceRevoked
  )
    throw new WalletError(
      "RENEWAL_NOT_EXPIRED",
      "Revoke the active old permission before replacing it",
    );
  if (destination.validUntil <= now)
    throw new WalletError("RENEWAL_EXPIRED", "The new permission has expired");
  return { source, destination };
}
