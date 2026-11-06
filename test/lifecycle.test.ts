/**
 * Real local process/key lifecycle and capability boundaries; qualification uses controlled fixtures.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";
import { verifyTypedData } from "ethers";
import {
  buildCommitment,
  callWallet,
  initializeCapabilities,
  Phase0Wallet,
  PHASE0_TYPES,
  qualificationHash,
  readCapability,
  WalletError,
} from "../src/index.js";

const now = 1_800_000_000;
const password = "phase0 secret NEVER LOG 42";
let registryServer: Server;
let registryRpcUrl = "";

before(async () => {
  registryServer = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      const call = JSON.parse(body) as { id: number; method: string };
      const rejectedSeller =
        "000000000000000000000000dead000000000000000000000000000000000000";
      const result =
        call.method === "eth_call"
          ? `0x${"0".repeat(63)}${body.toLowerCase().includes(rejectedSeller) ? "0" : "1"}`
          : "0x7a69";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, result }));
    });
  });
  await new Promise<void>((resolve) =>
    registryServer.listen(0, "127.0.0.1", resolve),
  );
  const address = registryServer.address();
  if (!address || typeof address === "string")
    throw new Error("registry test server failed");
  registryRpcUrl = `http://127.0.0.1:${address.port}`;
});

after(
  async () =>
    new Promise<void>((resolve, reject) =>
      registryServer.close((error) => (error ? reject(error) : resolve())),
    ),
);

test("Registry qualification hash matches the public cross-language fixture", () => {
  assert.equal(
    qualificationHash(
      "0x9000000000000000000000000000000000000009",
      `0x${"22".repeat(32)}`,
      `0x${"33".repeat(32)}`,
      "0x6000000000000000000000000000000000000006",
    ),
    "0x376235a8bdd29a005aff75e66645f8df433b41c317c2ee722ac522bbf69ac8c9",
  );
});
test("fresh key survives real service restart and signs only structured unordered commitments", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "agentpay-wallet-lifecycle-"));
  const servers: SpawnedServer[] = [];
  try {
    const initialized = await Phase0Wallet.initialize(dataDir, password);
    await initializeCapabilities(dataDir);
    const address = await initialized.address();
    assert.deepEqual(initialized.status(), {
      locked: true,
      bound: false,
      version: "unbound",
      policyId: null,
      recoveryScope: null,
    });
    await assertMode(join(dataDir, "session.keystore.json"), 0o600);
    await assertMode(join(dataDir, "agent.token"), 0o600);

    const agentToken = await readCapability(dataDir, "agent");
    const adminToken = await readCapability(dataDir, "admin");
    const firstServer = await spawnServer(dataDir);
    servers.push(firstServer);
    assert.deepEqual(
      await callWallet(join(dataDir, "wallet.sock"), agentToken, "status"),
      {
        locked: true,
        bound: false,
        version: "unbound",
        policyId: null,
        recoveryScope: null,
      },
    );
    await assert.rejects(
      callWallet(
        join(dataDir, "wallet.sock"),
        agentToken,
        "signAgentPayCommitment",
        { commitment: commitment(1) },
      ),
      hasCode("POLICY_UNBOUND"),
    );
    await assert.rejects(
      callWallet(join(dataDir, "wallet.sock"), adminToken, "bindPolicy", {
        policy: policyFor("0x7000000000000000000000000000000000000007"),
      }),
      hasCode("POLICY_KEY_MISMATCH"),
    );
    const policy = policyFor(address);
    await callWallet(join(dataDir, "wallet.sock"), adminToken, "bindPolicy", {
      policy,
    });
    await assert.rejects(
      callWallet(join(dataDir, "wallet.sock"), adminToken, "bindPolicy", {
        policy,
      }),
      hasCode("POLICY_ALREADY_BOUND"),
    );
    await assert.rejects(
      callWallet(join(dataDir, "wallet.sock"), agentToken, "unlock", {
        password,
      }),
      (error: unknown) =>
        error instanceof WalletError && error.code === "METHOD_NOT_ALLOWED",
    );
    await callWallet(join(dataDir, "wallet.sock"), adminToken, "unlock", {
      password,
    });
    const first = commitment(1);
    const firstSigned = (await callWallet(
      join(dataDir, "wallet.sock"),
      agentToken,
      "signAgentPayCommitment",
      {
        commitment: first,
      },
    )) as { commitmentId: string; signature: string };
    await verify(address, policy, first, firstSigned.signature);
    await assert.rejects(
      callWallet(
        join(dataDir, "wallet.sock"),
        agentToken,
        "signAgentPayCommitment",
        { commitment: first },
      ),
      hasCode("DUPLICATE_COMMITMENT"),
    );
    // Limits must hold at the Agent's actual IPC entry, before any signature is returned.
    for (const [patch, code] of [
      [{ amount: "2000001" }, "AMOUNT_EXCEEDED"],
      [{ validBefore: 1 }, "COMMITMENT_EXPIRED"],
      [{ validBefore: policy.validUntil + 1 }, "POLICY_EXCEEDED"],
    ] as const) {
      await assert.rejects(
        callWallet(
          join(dataDir, "wallet.sock"),
          agentToken,
          "signAgentPayCommitment",
          {
            commitment: { ...commitment(3), ...patch },
          },
        ),
        hasCode(code),
      );
    }

    await stopServer(firstServer);
    assert.doesNotMatch(
      `${firstServer.stdout()}${firstServer.stderr()}`,
      /NEVER LOG|privateKey|"crypto"/,
    );

    const secondServer = await spawnServer(dataDir);
    servers.push(secondServer);
    assert.deepEqual(
      await callWallet(join(dataDir, "wallet.sock"), agentToken, "status"),
      {
        locked: true,
        bound: true,
        version: "agentpay.safe-module.v1",
        policyId: policy.policyId,
        recoveryScope: {
          network: `eip155:${policy.chainId}`,
          module: policy.module,
          safe: policy.safe,
          policyId: policy.policyId,
        },
      },
    );
    assert.equal(
      (
        (await callWallet(
          join(dataDir, "wallet.sock"),
          agentToken,
          "getAddress",
        )) as { address: string }
      ).address,
      address,
    );
    await callWallet(join(dataDir, "wallet.sock"), adminToken, "unlock", {
      password,
    });
    const second = commitment(2);
    const secondSigned = (await callWallet(
      join(dataDir, "wallet.sock"),
      agentToken,
      "signAgentPayCommitment",
      {
        commitment: second,
      },
    )) as { commitmentId: string; signature: string };
    await verify(address, policy, second, secondSigned.signature);
    assert.notEqual(firstSigned.commitmentId, secondSigned.commitmentId);
    await stopServer(secondServer);
    assert.doesNotMatch(
      `${secondServer.stdout()}${secondServer.stderr()}`,
      /NEVER LOG|privateKey|"crypto"/,
    );

    const audit = await readFile(join(dataDir, "audit.jsonl"), "utf8");
    assert.doesNotMatch(audit, /NEVER LOG/);
    assert.doesNotMatch(audit, /"signature"/);
    assert.doesNotMatch(audit, /"crypto"/);
    const auditEvents = audit
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    for (const event of auditEvents) {
      assert.ok(Number.isSafeInteger(event.atMs));
      assert.ok(Number(event.atMs) >= 0);
      assert.equal("at" in event, false);
    }
  } finally {
    await Promise.all(servers.map(stopServer));
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("unknown versions, extra domains, raw digests, generic methods, and unsafe files fail closed", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "agentpay-wallet-negative-"));
  const servers: SpawnedServer[] = [];
  try {
    const wallet = await Phase0Wallet.initialize(dataDir, password);
    await wallet.bindPolicy(policyFor(await wallet.address()));
    await wallet.unlock(password);
    await assert.rejects(
      wallet.signAgentPayCommitment(
        { ...commitment(1), version: "unknown" },
        now,
      ),
      hasCode("UNKNOWN_VERSION"),
    );
    await assert.rejects(
      wallet.signAgentPayCommitment({ ...commitment(1), domain: {} }, now),
      hasCode("INVALID_FIELDS"),
    );
    await assert.rejects(
      wallet.signAgentPayCommitment({ digest: hex32(1) }, now),
      hasCode("INVALID_FIELDS"),
    );
    await assert.rejects(
      wallet.signAgentPayCommitment(
        {
          ...commitment(1),
          seller: "0xdead000000000000000000000000000000000000",
        },
        now,
      ),
      hasCode("SKILL_NOT_QUALIFIED"),
    );
    await wallet.lock();
    await assert.rejects(
      wallet.signAgentPayCommitment(commitment(1), now),
      hasCode("LOCKED"),
    );
    await assert.rejects(
      wallet.unlock("wrong password value"),
      hasCode("UNLOCK_FAILED"),
    );

    await initializeCapabilities(dataDir);
    const server = await spawnServer(dataDir);
    servers.push(server);
    const agentToken = await readCapability(dataDir, "agent");
    await assert.rejects(
      callWallet(join(dataDir, "wallet.sock"), agentToken, "signTypedData", {}),
      hasCode("METHOD_NOT_ALLOWED"),
    );
    await assert.rejects(
      callWallet(join(dataDir, "wallet.sock"), "0".repeat(64), "status"),
      hasCode("UNAUTHORIZED"),
    );
    await stopServer(server);

    await chmod(join(dataDir, "session.keystore.json"), 0o644);
    await assert.rejects(Phase0Wallet.open(dataDir), hasCode("UNSAFE_FILE"));
    await chmod(join(dataDir, "session.keystore.json"), 0o600);
    const reopened = await Phase0Wallet.open(dataDir);
    await writeFile(join(dataDir, "session.keystore.json"), "{not-json", {
      mode: 0o600,
    });
    await assert.rejects(reopened.address(), hasCode("INVALID_KEYSTORE"));
  } finally {
    await Promise.all(servers.map(stopServer));
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("destroy removes disposable key and retains only a public tombstone", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "agentpay-wallet-destroy-"));
  try {
    const wallet = await Phase0Wallet.initialize(dataDir, password);
    const address = await wallet.address();
    const policy = policyFor(address);
    await wallet.bindPolicy(policy);
    await assert.rejects(
      wallet.destroy("phase0 disposable key cleanup", policy.safe),
      hasCode("DESTROY_CONFIRMATION_FAILED"),
    );
    await wallet.destroy("phase0 disposable key cleanup", address);
    await assert.rejects(wallet.address(), hasCode("KEY_MISSING"));
    const tombstone = JSON.parse(
      await readFile(join(dataDir, "tombstone.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.ok(Number.isSafeInteger(tombstone.destroyedAtMs));
    assert.equal("destroyedAt" in tombstone, false);
    assert.equal(tombstone.address, address);
    assert.equal(tombstone.policyId, policy.policyId);
    assert.equal("privateKey" in tombstone, false);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("CLI refuses unlock secrets from non-interactive input, environment, or arguments without echoing them", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "agentpay-wallet-cli-"));
  try {
    const cli = join(process.cwd(), "dist/src/cli.js");
    const nonInteractive = await runProcess(
      [cli, "init", dataDir],
      {
        AGENTPAY_WALLET_PASSWORD: password,
      },
      `${password}\n${password}\n`,
    );
    assert.equal(nonInteractive.code, 1);
    assert.match(nonInteractive.stderr, /TTY_REQUIRED/);
    assert.doesNotMatch(
      `${nonInteractive.stdout}${nonInteractive.stderr}`,
      /NEVER LOG/,
    );

    const argumentAttempt = await runProcess(
      [cli, "init", dataDir, password],
      {},
      "",
    );
    assert.equal(argumentAttempt.code, 1);
    assert.match(argumentAttempt.stderr, /USAGE/);
    assert.doesNotMatch(
      `${argumentAttempt.stdout}${argumentAttempt.stderr}`,
      /NEVER LOG/,
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

function commitment(sequence: number) {
  return {
    version: "agentpay.safe-module.v1",
    orderId: hex32(sequence),
    vault:
      sequence === 1
        ? "0x5000000000000000000000000000000000000005"
        : "0x6000000000000000000000000000000000000006",
    amount: "1000000",
    termsHash: hex32(sequence + 100),
    skillId: hex32(500),
    profileHash: hex32(501),
    seller: "0x8000000000000000000000000000000000000008",
    commitmentNonce: hex32(sequence + 200),
    validBefore: now + 300,
  } as const;
}

async function verify(
  address: string,
  policy: ReturnType<typeof policyFor>,
  request: ReturnType<typeof commitment>,
  signature: string,
): Promise<void> {
  const built = buildCommitment(policy, request, now);
  assert.equal(
    await verifyTypedData(built.domain, PHASE0_TYPES, built.message, signature),
    address,
  );
}

function policyFor(delegate: string) {
  return {
    version: "agentpay.safe-module.v1",
    chainId: 31337,
    module: "0x4000000000000000000000000000000000000004",
    safe: "0x1000000000000000000000000000000000000001",
    delegate,
    policyId: hex32(10),
    factory: "0x3000000000000000000000000000000000000003",
    registry: "0x9000000000000000000000000000000000000009",
    registryRpcUrl,
    token: "0x2000000000000000000000000000000000000002",
    maxAmount: "2000000",
    validUntil: now + 3600,
  } as const;
}

function hex32(value: number): string {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function hasCode(code: string) {
  return (error: unknown) =>
    error instanceof WalletError && error.code === code;
}

async function assertMode(path: string, expected: number): Promise<void> {
  assert.equal((await stat(path)).mode & 0o777, expected);
}

interface SpawnedServer {
  child: ChildProcessWithoutNullStreams;
  stdout(): string;
  stderr(): string;
}

async function spawnServer(dataDir: string): Promise<SpawnedServer> {
  const child = spawn(
    process.execPath,
    [join(process.cwd(), "dist/src/server-process.js"), dataDir],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error("Wallet test process did not become ready within 10 seconds"),
      );
    }, 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.includes("READY\n")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`wallet server exited ${code}: ${stderr}`));
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  return { child, stdout: () => stdout, stderr: () => stderr };
}

async function stopServer(server: SpawnedServer): Promise<void> {
  const { child } = server;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve, reject) => {
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`wallet server exited ${code}`)),
    );
  });
  child.kill("SIGTERM");
  await exited;
}

async function runProcess(
  args: string[],
  environment: Record<string, string>,
  input: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, args, {
    env: { ...process.env, ...environment },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  child.stdin.end(input);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
  return { code, stdout, stderr };
}
