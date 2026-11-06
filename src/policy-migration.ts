/**
 * Read-only RPC inspection and exact owner-operation plans for migration.
 * This module never holds an owner key or sends the owner transactions.
 */
import {
  Contract,
  FetchRequest,
  Interface,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { normalizePolicy, type Phase0Policy } from "./commitment.js";
import { WalletError } from "./errors.js";

// Local administrative format, not a new signed Protocol message or Policy ABI.
export const MIGRATION_VERSION = "agentpay.policy-migration.v1";
export const POLICY_ABI = [
  "function policies(address safe,bytes32 policyId) view returns (address delegate,address token,address factory,address registry,uint256 maxPerPayment,uint256 totalBudget,uint256 spent,uint64 validAfter,uint64 validUntil,bool revoked)",
  "function revokePolicy(bytes32 policyId)",
  "function createPolicy(bytes32 policyId,address delegate,address token,address factory,address registry,uint256 maxPerPayment,uint256 totalBudget,uint64 validAfter,uint64 validUntil)",
];
const SAFE_ABI = [
  "function isModuleEnabled(address module) view returns (bool)",
  "function enableModule(address module)",
];
const zero = /^0x0+$/i;
export interface MigrationTarget {
  expectedPolicyId: string;
  policyId: string;
  factory: string;
  module: string;
}
export interface PolicySnapshot {
  delegate: string;
  token: string;
  factory: string;
  registry: string;
  maxPerPayment: string;
  totalBudget: string;
  spent: string;
  validAfter: number;
  validUntil: number;
  revoked: boolean;
}
export interface MigrationPlan {
  version: typeof MIGRATION_VERSION;
  migrationId: string;
  source: Phase0Policy;
  destination: Phase0Policy;
  sourceTerms: PolicySnapshot;
  totalBudget: string;
  validAfter: number;
}
export interface MigrationJournal {
  plan: MigrationPlan;
  state: "pending" | "completed" | "cancelled";
}

export function fail(code: string): never {
  throw new WalletError(code, code);
}
export function samePolicy(a: Phase0Policy, b: Phase0Policy): boolean {
  return (
    JSON.stringify(normalizePolicy(a)) === JSON.stringify(normalizePolicy(b))
  );
}
export function normalizeTarget(
  input: unknown,
  source: Phase0Policy,
): MigrationTarget {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("MIGRATION_TARGET_INVALID");
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).sort().join() !==
    "expectedPolicyId,factory,module,policyId"
  )
    fail("MIGRATION_TARGET_INVALID");
  if (value.expectedPolicyId !== source.policyId)
    fail("MIGRATION_SOURCE_CONFLICT");
  const next = normalizePolicy({
    ...source,
    factory: value.factory,
    module: value.module,
    policyId: value.policyId,
  });
  if (
    zero.test(next.factory) ||
    zero.test(next.module) ||
    zero.test(next.policyId) ||
    next.policyId === source.policyId
  ) {
    fail("MIGRATION_TARGET_INVALID");
  }
  return {
    expectedPolicyId: source.policyId,
    factory: next.factory,
    module: next.module,
    policyId: next.policyId,
  };
}
export function assertSource(
  policy: Phase0Policy,
  terms: PolicySnapshot,
): void {
  if (
    terms.delegate !== policy.delegate ||
    terms.token !== policy.token ||
    terms.factory !== policy.factory ||
    terms.registry !== policy.registry ||
    terms.maxPerPayment !== policy.maxAmount ||
    terms.validUntil !== policy.validUntil
  ) {
    fail("MIGRATION_SOURCE_CHAIN_MISMATCH");
  }
}
export function buildMigrationPlan(
  sourceInput: Phase0Policy,
  targetInput: unknown,
  terms: PolicySnapshot,
  now: number,
): MigrationPlan {
  const source = normalizePolicy(sourceInput);
  const target = normalizeTarget(targetInput, source);
  assertSource(source, terms);
  if (terms.revoked) fail("MIGRATION_SOURCE_REVOKED");
  if (terms.validUntil <= now) fail("MIGRATION_POLICY_EXPIRED");
  const remaining = BigInt(terms.totalBudget) - BigInt(terms.spent);
  if (remaining <= 0n) fail("MIGRATION_BUDGET_EXHAUSTED");
  const max =
    BigInt(terms.maxPerPayment) < remaining
      ? BigInt(terms.maxPerPayment)
      : remaining;
  const destination = normalizePolicy({
    ...source,
    policyId: target.policyId,
    factory: target.factory,
    module: target.module,
    maxAmount: max.toString(),
  });
  const content = {
    version: MIGRATION_VERSION as typeof MIGRATION_VERSION,
    source,
    destination,
    sourceTerms: terms,
    totalBudget: remaining.toString(),
    validAfter: terms.validAfter,
  };
  return {
    ...content,
    migrationId: keccak256(toUtf8Bytes(JSON.stringify(content))),
  };
}
export function validateJournal(input: unknown): MigrationJournal {
  const journal = input as MigrationJournal;
  if (
    !journal ||
    !["pending", "completed", "cancelled"].includes(journal.state) ||
    journal.plan?.version !== MIGRATION_VERSION
  ) {
    fail("MIGRATION_JOURNAL_INVALID");
  }
  const plan = journal.plan;
  // Reconstruct all limits and the plan identity; never trust persisted derived calls.
  const expected = buildMigrationPlan(
    plan.source,
    {
      expectedPolicyId: plan.source.policyId,
      factory: plan.destination.factory,
      module: plan.destination.module,
      policyId: plan.destination.policyId,
    },
    plan.sourceTerms,
    0,
  );
  if (
    plan.migrationId !== expected.migrationId ||
    !samePolicy(plan.destination, expected.destination) ||
    plan.totalBudget !== expected.totalBudget ||
    plan.validAfter !== expected.validAfter
  )
    fail("MIGRATION_JOURNAL_INVALID");
  return { state: journal.state, plan: expected };
}

/** Scope RPC lifetime and verify its chain identity; callers pin related reads to a block. */
export async function withMigrationRpc<T>(
  policy: Phase0Policy,
  run: (rpc: JsonRpcProvider) => Promise<T>,
): Promise<T> {
  const url = new URL(policy.registryRpcUrl);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  ) {
    fail("MIGRATION_RPC_UNSAFE");
  }
  const connection = new FetchRequest(url.toString());
  connection.timeout = 10_000;
  const rpc = new JsonRpcProvider(connection, undefined, {
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
  try {
    // Do not use a static-network assertion as evidence of the connected chain.
    if (BigInt(await rpc.send("eth_chainId", [])) !== BigInt(policy.chainId))
      fail("MIGRATION_CHAIN_MISMATCH");
    return await run(rpc);
  } finally {
    rpc.destroy();
  }
}
export async function readPolicy(
  rpc: JsonRpcProvider,
  policy: Phase0Policy,
  blockTag: number,
): Promise<PolicySnapshot> {
  const p = await new Contract(policy.module, POLICY_ABI, rpc).getFunction(
    "policies",
  )(policy.safe, policy.policyId, { blockTag });
  return {
    delegate: p.delegate,
    token: p.token,
    factory: p.factory,
    registry: p.registry,
    maxPerPayment: p.maxPerPayment.toString(),
    totalBudget: p.totalBudget.toString(),
    spent: p.spent.toString(),
    validAfter: Number(p.validAfter),
    validUntil: Number(p.validUntil),
    revoked: p.revoked,
  };
}
async function requireCode(
  rpc: JsonRpcProvider,
  addresses: string[],
  blockTag: number,
) {
  for (const address of new Set(addresses))
    if ((await rpc.getCode(address, blockTag)) === "0x")
      fail("MIGRATION_CODE_MISSING");
}
export async function previewMigration(
  source: Phase0Policy,
  target: unknown,
): Promise<MigrationPlan> {
  const normalized = normalizeTarget(target, source);
  return withMigrationRpc(source, async (rpc) => {
    const block = await rpc.getBlock("latest");
    if (!block) fail("MIGRATION_CHAIN_UNAVAILABLE");
    await requireCode(
      rpc,
      [
        source.safe,
        source.module,
        source.token,
        source.registry,
        source.factory,
        normalized.factory,
        normalized.module,
      ],
      block.number,
    );
    const terms = await readPolicy(rpc, source, block.number);
    const plan = buildMigrationPlan(source, normalized, terms, block.timestamp);
    const next = await readPolicy(rpc, plan.destination, block.number);
    if (!zero.test(next.delegate)) fail("MIGRATION_TARGET_EXISTS");
    if (
      !(await new Contract(source.safe, SAFE_ABI, rpc).getFunction(
        "isModuleEnabled",
      )(source.module, { blockTag: block.number }))
    ) {
      fail("MIGRATION_SOURCE_MODULE_DISABLED");
    }
    return plan;
  });
}

export async function refreshMigration(
  plan: MigrationPlan,
): Promise<MigrationPlan> {
  return withMigrationRpc(plan.source, async (rpc) => {
    const block = await rpc.getBlock("latest");
    if (!block) fail("MIGRATION_CHAIN_UNAVAILABLE");
    const old = await readPolicy(rpc, plan.source, block.number);
    const next = await readPolicy(rpc, plan.destination, block.number);
    if (!zero.test(next.delegate)) fail("MIGRATION_TARGET_EXISTS");
    if (
      old.totalBudget !== plan.sourceTerms.totalBudget ||
      BigInt(old.spent) < BigInt(plan.sourceTerms.spent) ||
      old.validAfter !== plan.sourceTerms.validAfter
    )
      fail("MIGRATION_SOURCE_CHAIN_MISMATCH");
    // Re-preview only the same destination, with no additional budget. Revocation
    // may already be confirmed: it is not rolled back and remains verified by inspect.
    return buildMigrationPlan(
      plan.source,
      {
        expectedPolicyId: plan.source.policyId,
        policyId: plan.destination.policyId,
        module: plan.destination.module,
        factory: plan.destination.factory,
      },
      { ...old, revoked: false },
      block.timestamp,
    );
  });
}

export async function inspectMigration(plan: MigrationPlan) {
  return withMigrationRpc(plan.source, async (rpc) => {
    const block = await rpc.getBlock("latest");
    if (!block) fail("MIGRATION_CHAIN_UNAVAILABLE");
    await requireCode(
      rpc,
      [
        plan.source.safe,
        plan.source.module,
        plan.destination.module,
        plan.destination.factory,
        plan.destination.registry,
        plan.destination.token,
      ],
      block.number,
    );
    const old = await readPolicy(rpc, plan.source, block.number);
    assertSource(plan.source, old);
    if (
      old.totalBudget !== plan.sourceTerms.totalBudget ||
      old.spent !== plan.sourceTerms.spent ||
      old.validAfter !== plan.sourceTerms.validAfter
    )
      fail("MIGRATION_SOURCE_BUDGET_CHANGED");
    const next = await readPolicy(rpc, plan.destination, block.number);
    const targetExists = !zero.test(next.delegate);
    if (targetExists) {
      assertSource(plan.destination, next);
      if (
        next.revoked ||
        next.totalBudget !== plan.totalBudget ||
        next.validAfter !== plan.validAfter
      ) {
        fail("MIGRATION_TARGET_CHAIN_MISMATCH");
      }
      if (!old.revoked) fail("MIGRATION_OVERLAPPING_POLICIES");
    }
    const moduleEnabled = Boolean(
      await new Contract(plan.source.safe, SAFE_ABI, rpc).getFunction(
        "isModuleEnabled",
      )(plan.destination.module, { blockTag: block.number }),
    );
    const calls = [];
    const module = new Interface(POLICY_ABI);
    const safe = new Interface(SAFE_ABI);
    if (!old.revoked)
      calls.push({
        purpose: "revoke old Spending Policy",
        to: plan.source.module,
        value: "0",
        operation: 0,
        data: module.encodeFunctionData("revokePolicy", [plan.source.policyId]),
      });
    if (!moduleEnabled)
      calls.push({
        purpose: "enable replacement AgentPay Module",
        to: plan.source.safe,
        value: "0",
        operation: 0,
        data: safe.encodeFunctionData("enableModule", [
          plan.destination.module,
        ]),
      });
    if (!targetExists)
      calls.push({
        purpose: "create replacement Spending Policy",
        to: plan.destination.module,
        value: "0",
        operation: 0,
        data: module.encodeFunctionData("createPolicy", [
          plan.destination.policyId,
          plan.destination.delegate,
          plan.destination.token,
          plan.destination.factory,
          plan.destination.registry,
          plan.destination.maxAmount,
          plan.totalBudget,
          plan.validAfter,
          plan.destination.validUntil,
        ]),
      });
    return {
      blockNumber: block.number,
      blockHash: block.hash,
      oldRevoked: old.revoked,
      targetExists,
      moduleEnabled,
      targetSpent: next.spent,
      expired: block.timestamp >= plan.destination.validUntil,
      readyToBind:
        old.revoked &&
        targetExists &&
        moduleEnabled &&
        block.timestamp >= plan.validAfter &&
        block.timestamp < plan.destination.validUntil,
      calls,
    };
  });
}
