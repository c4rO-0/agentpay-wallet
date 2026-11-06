/**
 * Verify an original on-chain authorization against the possessed key.
 * Restoration binds existing authority; it never creates or extends it.
 */
import { Contract, getAddress, isHexString } from "ethers";
import { normalizePolicy, type Phase0Policy } from "./commitment.js";
import {
  withMigrationRpc,
  readPolicy,
  type PolicySnapshot,
} from "./policy-migration.js";
import { WalletError } from "./errors.js";
export interface RestoreTarget {
  chainId: number;
  rpcUrl: string;
  module: string;
  safe: string;
  policyId: string;
}
function fail(code: string): never {
  throw new WalletError(code, code);
}
export function normalizeRestoreTarget(
  input: unknown,
  delegate: string,
): Phase0Policy {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("RESTORE_TARGET_INVALID");
  const v = input as RestoreTarget;
  if (
    Object.keys(v).sort().join() !== "chainId,module,policyId,rpcUrl,safe" ||
    !isHexString(v.policyId, 32) ||
    /^0x0+$/.test(v.policyId)
  )
    fail("RESTORE_TARGET_INVALID");
  // Reuse common URL/address validation for the target. Placeholder terms are replaced
  // by the same-block chain snapshot before any binding can be returned.
  return normalizePolicy({
    version: "agentpay.safe-module.v1",
    chainId: v.chainId,
    registryRpcUrl: v.rpcUrl,
    module: v.module,
    safe: v.safe,
    policyId: v.policyId,
    delegate,
    factory: delegate,
    registry: delegate,
    token: delegate,
    maxAmount: "1",
    validUntil: 1,
  });
}
export function restoredPolicy(
  target: Phase0Policy,
  terms: PolicySnapshot,
  now: number,
  enabled: boolean,
) {
  if (/^0x0+$/i.test(terms.delegate)) fail("RESTORE_POLICY_NOT_FOUND");
  if (getAddress(terms.delegate) !== target.delegate)
    fail("POLICY_KEY_MISMATCH");
  if (!enabled) fail("RESTORE_MODULE_DISABLED");
  if (terms.revoked) fail("RESTORE_POLICY_REVOKED");
  if (terms.validUntil <= now) fail("RESTORE_POLICY_EXPIRED");
  if (terms.validAfter > now) fail("RESTORE_POLICY_NOT_ACTIVE");
  if (
    BigInt(terms.spent) > BigInt(terms.totalBudget) ||
    BigInt(terms.totalBudget) <= 0n
  )
    fail("RESTORE_TERMS_INVALID");
  const policy = normalizePolicy({
    ...target,
    token: terms.token,
    factory: terms.factory,
    registry: terms.registry,
    maxAmount: terms.maxPerPayment,
    validUntil: terms.validUntil,
  });
  return {
    policy,
    terms,
    remainingBudget: (
      BigInt(terms.totalBudget) - BigInt(terms.spent)
    ).toString(),
  };
}
export async function inspectPolicyRestore(input: unknown, delegate: string) {
  const target = normalizeRestoreTarget(input, delegate);
  return withMigrationRpc(target, async (rpc) => {
    const block = await rpc.getBlock("latest");
    if (!block) fail("RESTORE_CHAIN_UNAVAILABLE");
    for (const at of [target.safe, target.module])
      if ((await rpc.getCode(at, block.number)) === "0x")
        fail("RESTORE_CONTRACT_MISSING");
    const terms = await readPolicy(rpc, target, block.number);
    const enabled = Boolean(
      await new Contract(
        target.safe,
        ["function isModuleEnabled(address) view returns(bool)"],
        rpc,
      ).getFunction("isModuleEnabled")(target.module, {
        blockTag: block.number,
      }),
    );
    const result = restoredPolicy(target, terms, block.timestamp, enabled);
    for (const at of [
      result.policy.token,
      result.policy.factory,
      result.policy.registry,
    ])
      if ((await rpc.getCode(at, block.number)) === "0x")
        fail("RESTORE_CONTRACT_MISSING");
    return result;
  });
}
