/**
 * Deployment migration, remaining authority and restart recovery; chain state uses controlled RPC fixtures.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";
import { Interface } from "ethers";
import {
  Phase0Wallet,
  initializeCapabilities,
  callWallet,
  readCapability,
  type Phase0Policy,
  buildMigrationPlan,
  validateJournal,
  POLICY_ABI,
  type PolicySnapshot,
  type MigrationPlan,
} from "../src/index.js";

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const source: Phase0Policy = {
  version: "agentpay.safe-module.v1",
  chainId: 31337,
  module: addr(1),
  safe: addr(2),
  delegate: addr(3),
  factory: addr(4),
  registry: addr(5),
  token: addr(6),
  registryRpcUrl: "http://127.0.0.1:8547",
  policyId: id(1),
  maxAmount: "5000000",
  validUntil: 2_000_000_000,
};
const target = {
  expectedPolicyId: id(1),
  policyId: id(2),
  factory: addr(7),
  module: addr(1),
};
const terms: PolicySnapshot = {
  delegate: source.delegate,
  token: source.token,
  factory: source.factory,
  registry: source.registry,
  maxPerPayment: "5000000",
  totalBudget: "20000000",
  spent: "700000",
  validAfter: 1,
  validUntil: source.validUntil,
  revoked: false,
};

test("migration preserves remaining budget, expiry and identity; small remaining budgets reduce the per-payment cap", () => {
  const plan = buildMigrationPlan(source, target, terms, 100);
  assert.equal(plan.totalBudget, "19300000");
  assert.equal(plan.destination.validUntil, source.validUntil);
  assert.equal(plan.destination.delegate, source.delegate);
  assert.equal(plan.destination.safe, source.safe);
  assert.equal(plan.destination.registry, source.registry);
  assert.equal(plan.destination.token, source.token);
  assert.equal(
    buildMigrationPlan(source, target, { ...terms, spent: "19000000" }, 100)
      .destination.maxAmount,
    "1000000",
  );
  assert.deepEqual(validateJournal({ plan, state: "pending" }), {
    plan,
    state: "pending",
  });
});
test("migration rejects broader authority, unknown format, exhausted budget, expired terms and mismatched chain source", () => {
  for (const changed of [
    { ...target, totalBudget: "20000000" },
    { ...target, chainId: 1 },
    { ...target, expectedPolicyId: id(9) },
    { ...target, policyId: source.policyId },
    { ...target, factory: addr(0) },
  ]) {
    assert.throws(() => buildMigrationPlan(source, changed, terms, 100));
  }
  for (const changed of [
    { ...terms, spent: "20000000" },
    { ...terms, revoked: true },
    { ...terms, factory: addr(9) },
  ]) {
    assert.throws(() => buildMigrationPlan(source, target, changed, 100));
  }
  assert.throws(
    () => buildMigrationPlan(source, target, terms, terms.validUntil),
    /EXPIRED/,
  );
  const plan = buildMigrationPlan(source, target, terms, 100);
  assert.throws(
    () =>
      validateJournal({
        state: "pending",
        plan: { ...plan, totalBudget: "20000000" },
      }),
    /JOURNAL_INVALID/,
  );
  assert.throws(
    () =>
      validateJournal({
        state: "pending",
        plan: { ...plan, version: "future" },
      }),
    /JOURNAL_INVALID/,
  );
});

test("real Wallet process: migration gates, pending restart, and replay from a prepared partial-switch fixture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentpay-policy-migration-"));
  const abi = new Interface(POLICY_ABI);
  const safeAbi = new Interface([
    "function isModuleEnabled(address) view returns (bool)",
    "function enableModule(address)",
  ]);
  let old = { ...terms };
  let next: PolicySnapshot | null = null;
  let chainId = "0x7a69";
  let missingCode = false;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const c = JSON.parse(body);
    let result: unknown;
    switch (c.method) {
      case "eth_chainId":
        result = chainId;
        break;
      case "eth_blockNumber":
        result = "0x20";
        break;
      case "eth_getBlockByNumber":
        result = {
          number: "0x20",
          hash: id(32),
          parentHash: id(31),
          timestamp: "0x6b49d200",
          nonce: "0x0000000000000000",
          difficulty: "0x0",
          gasLimit: "0x100000",
          gasUsed: "0x0",
          miner: addr(1),
          extraData: "0x",
          transactions: [],
        };
        break;
      case "eth_getCode":
        result = missingCode ? "0x" : "0x6000";
        break;
      case "eth_call": {
        const data = c.params[0].data as string;
        if (data.startsWith(safeAbi.getFunction("isModuleEnabled")!.selector)) {
          result = safeAbi.encodeFunctionResult("isModuleEnabled", [
            safeAbi.decodeFunctionData("isModuleEnabled", data)[0] !== addr(8),
          ]);
        } else {
          const decoded = abi.decodeFunctionData("policies", data);
          const p =
            decoded[1] === id(1) ? old : decoded[1] === id(2) ? next : null;
          result = abi.encodeFunctionResult(
            "policies",
            p
              ? [
                  p.delegate,
                  p.token,
                  p.factory,
                  p.registry,
                  p.maxPerPayment,
                  p.totalBudget,
                  p.spent,
                  p.validAfter,
                  p.validUntil,
                  p.revoked,
                ]
              : [addr(0), addr(0), addr(0), addr(0), 0, 0, 0, 0, 0, false],
          );
        }
        break;
      }
      default:
        throw new Error(`unexpected RPC ${c.method}`);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: c.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("RPC test server failed");
  let child: ChildProcess | null = null;
  const start = async () => {
    child = spawn(
      process.execPath,
      [new URL("../src/cli.js", import.meta.url).pathname, "serve", dir],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("wallet startup timeout")),
        10_000,
      );
      child!.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`wallet exited ${code}`));
      });
      child!.stdout!.once("data", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  };
  const stop = async (signal: NodeJS.Signals = "SIGTERM") => {
    if (!child) return;
    const processToStop = child;
    await new Promise<void>((resolve) => {
      processToStop.once("exit", () => resolve());
      processToStop.kill(signal);
    });
    child = null;
  };
  try {
    const wallet = await Phase0Wallet.initialize(
      dir,
      "migration-test-secret-only",
    );
    const local = {
      ...source,
      registryRpcUrl: `http://127.0.0.1:${address.port}`,
      delegate: await wallet.address(),
    };
    old.delegate = local.delegate;
    await wallet.bindPolicy(local);
    await initializeCapabilities(dir);
    const originalKeystore = await readFile(
      join(dir, "session.keystore.json"),
      "utf8",
    );
    const admin = await readCapability(dir, "admin");
    const agent = await readCapability(dir, "agent");
    const call = (method: string, params: Record<string, unknown> = {}) =>
      callWallet(
        join(dir, "wallet.sock"),
        admin,
        method,
        params,
      ) as Promise<any>;
    await start();
    for (const method of [
      "previewPolicyMigration",
      "preparePolicyMigration",
      "policyMigrationStatus",
      "completePolicyMigration",
      "cancelPolicyMigration",
      "previewPolicyMigrationRefresh",
      "refreshPolicyMigration",
    ]) {
      await assert.rejects(
        callWallet(join(dir, "wallet.sock"), agent, method),
        /not allowed/,
      );
    }
    chainId = "0x1";
    await assert.rejects(
      call("previewPolicyMigration", { target }),
      /MIGRATION_CHAIN_MISMATCH/,
    );
    chainId = "0x7a69";
    missingCode = true;
    await assert.rejects(
      call("previewPolicyMigration", { target }),
      /MIGRATION_CODE_MISSING/,
    );
    missingCode = false;
    const moduleTarget = { ...target, policyId: id(4), module: addr(8) };
    const modulePlan = await call("previewPolicyMigration", {
      target: moduleTarget,
    });
    const modulePending = await call("preparePolicyMigration", {
      target: moduleTarget,
      migrationId: modulePlan.migrationId,
    });
    assert.deepEqual(
      modulePending.chain.calls.map((c: { purpose: string }) => c.purpose),
      [
        "revoke old Spending Policy",
        "enable replacement AgentPay Module",
        "create replacement Spending Policy",
      ],
    );
    assert.equal(modulePending.chain.calls[1].to, local.safe);
    assert.equal(
      safeAbi.parseTransaction({ data: modulePending.chain.calls[1].data })!
        .args[0],
      addr(8),
    );
    await call("cancelPolicyMigration", {
      migrationId: modulePlan.migrationId,
    });
    let plan = (await call("previewPolicyMigration", {
      target,
    })) as MigrationPlan;
    await assert.rejects(
      call("preparePolicyMigration", { target, migrationId: id(99) }),
      /PREVIEW_CHANGED/,
    );
    await call("preparePolicyMigration", {
      target,
      migrationId: plan.migrationId,
    });
    assert.equal(
      (await call("cancelPolicyMigration", { migrationId: plan.migrationId }))
        .state,
      "cancelled",
    );
    assert.equal((await call("status")).locked, true);
    await call("preparePolicyMigration", {
      target,
      migrationId: plan.migrationId,
    });
    await assert.rejects(
      call("preparePolicyMigration", {
        target: { ...target, factory: addr(8) },
        migrationId: plan.migrationId,
      }),
      /CONFLICT/,
    );
    assert.equal(
      (await stat(join(dir, "policy-migration.json"))).mode & 0o777,
      0o600,
    );
    await assert.rejects(
      call("unlock", { password: "migration-test-secret-only" }),
      /POLICY_MIGRATION_PENDING/,
    );
    await assert.rejects(
      callWallet(join(dir, "wallet.sock"), agent, "signAgentPayCommitment", {
        commitment: {},
      }),
      /POLICY_MIGRATION_PENDING/,
    );
    await assert.rejects(
      call("completePolicyMigration", { migrationId: plan.migrationId }),
      /CHAIN_NOT_READY/,
    );
    // A delayed old commitment consumed additional budget before revocation.
    old.spent = "1400000";
    await assert.rejects(
      call("policyMigrationStatus"),
      /SOURCE_BUDGET_CHANGED/,
    );
    old.revoked = true;
    await assert.rejects(
      call("cancelPolicyMigration", { migrationId: plan.migrationId }),
      /CANNOT_CANCEL/,
    );
    const refreshed = await call("previewPolicyMigrationRefresh");
    assert.equal(refreshed.plan.totalBudget, "18600000");
    await call("refreshPolicyMigration", {
      previousMigrationId: plan.migrationId,
      migrationId: refreshed.plan.migrationId,
    });
    plan = refreshed.plan;
    await stop("SIGKILL");
    await start();
    assert.equal((await call("status")).policyMigrationPending, true);
    const resumed = await call("policyMigrationStatus");
    assert.equal(resumed.chain.calls.length, 1);
    assert.equal(
      abi.parseTransaction({ data: resumed.chain.calls[0].data })!.name,
      "createPolicy",
    );
    next = {
      ...old,
      factory: target.factory,
      revoked: false,
      totalBudget: plan.totalBudget,
      spent: "0",
    };
    next.totalBudget = "20000000";
    await assert.rejects(
      call("completePolicyMigration", { migrationId: plan.migrationId }),
      /TARGET_CHAIN_MISMATCH/,
    );
    next.totalBudget = plan.totalBudget;
    old.revoked = false;
    await assert.rejects(
      call("completePolicyMigration", { migrationId: plan.migrationId }),
      /OVERLAPPING_POLICIES/,
    );
    old.revoked = true;
    next.spent = "1";
    await assert.rejects(
      call("completePolicyMigration", { migrationId: plan.migrationId }),
      /TARGET_ALREADY_USED/,
    );
    next.spent = "0";
    // Prepared partial-switch fixture: this is not a crash injected between writes.
    // SIGKILL above separately checks restart after a completed preparation step.
    await stop();
    await writeFile(
      join(dir, "policy.json"),
      JSON.stringify(plan.destination),
      { mode: 0o600 },
    );
    await start();
    assert.equal((await call("status")).policyMigrationPending, true);
    const completed = await call("completePolicyMigration", {
      migrationId: plan.migrationId,
    });
    assert.equal(completed.state, "completed");
    assert.equal((await call("status")).locked, true);
    await call("completePolicyMigration", { migrationId: plan.migrationId });
    await stop();
    await start();
    assert.equal((await call("status")).policyId, id(2));
    assert.equal((await call("status")).policyMigrationPending, undefined);
    assert.equal(
      await readFile(join(dir, "session.keystore.json"), "utf8"),
      originalKeystore,
    );
    assert.equal(
      (await stat(join(dir, "policy-migrations", `${plan.migrationId}.json`)))
        .mode & 0o777,
      0o600,
    );
    const audit = await readFile(join(dir, "audit.jsonl"), "utf8");
    assert.doesNotMatch(
      audit,
      /migration-test-secret|privateKey|"signature"|"crypto"/,
    );
    // A subsequent future upgrade starts from the replacement's remaining budget,
    // not the first Policy's original allowance, and retains previous history.
    next.spent = "700000";
    const thirdTarget = {
      expectedPolicyId: id(2),
      policyId: id(3),
      factory: addr(8),
      module: addr(1),
    };
    const thirdPlan = await call("previewPolicyMigration", {
      target: thirdTarget,
    });
    assert.equal(thirdPlan.totalBudget, "17900000");
    await call("preparePolicyMigration", {
      target: thirdTarget,
      migrationId: thirdPlan.migrationId,
    });
    await call("cancelPolicyMigration", { migrationId: thirdPlan.migrationId });
    assert.equal(
      JSON.parse(
        await readFile(
          join(dir, "policy-migrations", `${plan.migrationId}.json`),
          "utf8",
        ),
      ).state,
      "completed",
    );
  } finally {
    await stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
