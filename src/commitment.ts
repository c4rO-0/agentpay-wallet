/**
 * Payment envelope validation and Registry qualification. Construct typed data
 * from structured fields; never accept a caller-selected domain or raw digest.
 */
import {
  AbiCoder,
  Contract,
  getAddress,
  isHexString,
  JsonRpcProvider,
  keccak256,
  TypedDataEncoder,
} from "ethers";
import { WalletError } from "./errors.js";

// Historical source names are retained for consumers; this is the v1 Module binding.
export const PHASE0_VERSION = "agentpay.safe-module.v1" as const;
export const PHASE0_PRIMARY_TYPE = "AgentPayCommitment" as const;

export const PHASE0_TYPES = {
  AgentPayCommitment: [
    { name: "safe", type: "address" },
    { name: "policyId", type: "bytes32" },
    { name: "factory", type: "address" },
    { name: "orderId", type: "bytes32" },
    { name: "vault", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "scopeProofHash", type: "bytes32" },
    { name: "commitmentNonce", type: "bytes32" },
    { name: "validBefore", type: "uint64" },
  ],
};

/** Local binding snapshot; amounts are atomic-unit decimal strings, time is seconds. */
export interface Phase0Policy {
  version: typeof PHASE0_VERSION;
  chainId: number;
  module: string;
  safe: string;
  delegate: string;
  policyId: string;
  factory: string;
  registry: string;
  registryRpcUrl: string;
  token: string;
  maxAmount: string;
  validUntil: number;
}

export interface Phase0SignRequest {
  version: typeof PHASE0_VERSION;
  orderId: string;
  vault: string;
  amount: string;
  termsHash: string;
  skillId: string;
  profileHash: string;
  seller: string;
  commitmentNonce: string;
  validBefore: number;
}

export function normalizePolicy(input: unknown): Phase0Policy {
  const value = exactRecord(input, [
    "version",
    "chainId",
    "module",
    "safe",
    "delegate",
    "policyId",
    "factory",
    "registry",
    "registryRpcUrl",
    "token",
    "maxAmount",
    "validUntil",
  ]);
  if (value.version !== PHASE0_VERSION)
    throw new WalletError("UNKNOWN_VERSION", "unknown policy version");
  const chainId = positiveSafeInteger(value.chainId, "chainId");
  const validUntil = positiveSafeInteger(value.validUntil, "validUntil");
  const maxAmount = positiveUint(value.maxAmount, "maxAmount").toString();
  return {
    version: PHASE0_VERSION,
    chainId,
    module: address(value.module, "module"),
    safe: address(value.safe, "safe"),
    delegate: address(value.delegate, "delegate"),
    policyId: bytes32(value.policyId, "policyId"),
    factory: address(value.factory, "factory"),
    registry: address(value.registry, "registry"),
    registryRpcUrl: rpcUrl(value.registryRpcUrl),
    token: address(value.token, "token"),
    maxAmount,
    validUntil,
  };
}

export function buildCommitment(
  policy: Phase0Policy,
  input: unknown,
  nowSeconds: number,
) {
  const value = exactRecord(input, [
    "version",
    "orderId",
    "vault",
    "amount",
    "termsHash",
    "skillId",
    "profileHash",
    "seller",
    "commitmentNonce",
    "validBefore",
  ]);
  if (value.version !== PHASE0_VERSION)
    throw new WalletError("UNKNOWN_VERSION", "unknown commitment version");
  const amount = positiveUint(value.amount, "amount");
  const validBefore = positiveSafeInteger(value.validBefore, "validBefore");
  if (amount > BigInt(policy.maxAmount))
    throw new WalletError("AMOUNT_EXCEEDED", "amount exceeds local policy");
  if (validBefore <= nowSeconds)
    throw new WalletError("COMMITMENT_EXPIRED", "commitment is expired");
  if (validBefore > policy.validUntil)
    throw new WalletError(
      "POLICY_EXCEEDED",
      "commitment exceeds policy validity",
    );

  const domain = {
    name: "AgentPay Safe Module",
    version: "1",
    chainId: policy.chainId,
    verifyingContract: policy.module,
  };
  const message = {
    safe: policy.safe,
    policyId: policy.policyId,
    factory: policy.factory,
    orderId: bytes32(value.orderId, "orderId"),
    vault: address(value.vault, "vault"),
    token: policy.token,
    amount,
    termsHash: bytes32(value.termsHash, "termsHash"),
    scopeProofHash: qualificationHash(
      policy.registry,
      bytes32(value.skillId, "skillId"),
      bytes32(value.profileHash, "profileHash"),
      address(value.seller, "seller"),
    ),
    commitmentNonce: bytes32(value.commitmentNonce, "commitmentNonce"),
    validBefore,
  };
  const commitmentId = TypedDataEncoder.hash(domain, PHASE0_TYPES, message);
  return { domain, message, commitmentId };
}

/** Verify the service qualification against the configured Registry, not service quality. */
export async function assertRegistryQualification(
  policy: Phase0Policy,
  input: unknown,
): Promise<void> {
  const value = input as Record<string, unknown>;
  const provider = new JsonRpcProvider(policy.registryRpcUrl, policy.chainId, {
    staticNetwork: true,
  });
  try {
    const registry = new Contract(
      policy.registry,
      [
        "function isQualified(bytes32 skillId, bytes32 profileHash, address seller) view returns (bool)",
      ],
      provider,
    );
    const qualified = (await registry
      .getFunction("isQualified")
      .staticCall(
        bytes32(value.skillId, "skillId"),
        bytes32(value.profileHash, "profileHash"),
        address(value.seller, "seller"),
      )) as boolean;
    if (!qualified)
      throw new WalletError(
        "SKILL_NOT_QUALIFIED",
        "Skill is not currently qualified by the policy Registry",
      );
  } catch (error) {
    if (error instanceof WalletError) throw error;
    throw new WalletError(
      "REGISTRY_UNAVAILABLE",
      "cannot verify Skill qualification with the policy Registry",
    );
  } finally {
    provider.destroy();
  }
}

export function qualificationHash(
  registry: string,
  skillId: string,
  profileHash: string,
  seller: string,
): string {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["address", "bytes32", "bytes32", "address"],
      [registry, skillId, profileHash, seller],
    ),
  );
}

function exactRecord(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new WalletError("INVALID_REQUEST", "request must be an object");
  }
  const value = input as Record<string, unknown>;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new WalletError(
      "INVALID_FIELDS",
      "request fields do not match the approved schema",
    );
  }
  return value;
}

function address(value: unknown, name: string): string {
  try {
    if (typeof value !== "string") throw new Error();
    return getAddress(value);
  } catch {
    throw new WalletError(
      "INVALID_FIELD",
      `${name} must be a checksummable address`,
    );
  }
}

function bytes32(value: unknown, name: string): string {
  if (typeof value !== "string" || !isHexString(value, 32)) {
    throw new WalletError("INVALID_FIELD", `${name} must be bytes32`);
  }
  return value.toLowerCase();
}

function positiveUint(value: unknown, name: string): bigint {
  try {
    if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
      throw new Error();
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new Error();
    return parsed;
  } catch {
    throw new WalletError(
      "INVALID_FIELD",
      `${name} must be a positive decimal uint`,
    );
  }
}

function positiveSafeInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new WalletError(
      "INVALID_FIELD",
      `${name} must be a positive safe integer`,
    );
  }
  return value;
}

function rpcUrl(value: unknown): string {
  if (typeof value !== "string")
    throw new WalletError(
      "INVALID_FIELD",
      "registryRpcUrl must be an HTTP(S) URL",
    );
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error();
    return parsed.toString();
  } catch {
    throw new WalletError(
      "INVALID_FIELD",
      "registryRpcUrl must be an HTTP(S) URL",
    );
  }
}
