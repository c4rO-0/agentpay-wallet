/** Real disposable key/process/socket regressions; no chain or operational Wallet. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, rename, mkdir, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createConnection, createServer, type Socket } from "node:net";
import { once } from "node:events";
import { Phase0Wallet } from "../src/wallet.js";
import {
  callWallet,
  initializeCapabilities,
  readCapability,
} from "../src/ipc.js";
import { ensurePrivateDirectory } from "../src/files.js";

const secret = "disposable boundary regression secret";
async function stop(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals = "SIGTERM",
) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, "exit");
  child.kill(signal);
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await done;
  } finally {
    clearTimeout(timer);
  }
}
function launch(data: string) {
  const child = spawn(process.execPath, ["dist/src/server-process.js", data], {
    stdio: "pipe",
  });
  const ready = new Promise<{ ready: boolean; error: string }>(
    (resolve, reject) => {
      let output = "",
        error = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(Error("startup timeout"));
      }, 5000);
      child.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.stdout.on("data", (b) => {
        output += b;
        if (output.includes("READY")) {
          clearTimeout(timer);
          resolve({ ready: true, error });
        }
      });
      child.stderr.on("data", (b) => {
        error += b;
      });
      child.once("exit", () => {
        clearTimeout(timer);
        resolve({ ready: false, error });
      });
    },
  );
  return { child, ready };
}

test("lock and key deletion cancel earlier unlocks; a later deliberate unlock still works", async () => {
  const data = await mkdtemp(join(tmpdir(), "wallet-lock-race-"));
  try {
    const wallet = await Phase0Wallet.initialize(data, secret);
    const first = assert.rejects(wallet.unlock(secret), {
      code: "UNLOCK_CANCELLED",
    });
    await wallet.lock();
    await first;
    assert.equal(wallet.status().locked, true);
    // Two callers can overlap; only the later unlock may publish the signer.
    const earlier = assert.rejects(wallet.unlock(secret), {
      code: "UNLOCK_CANCELLED",
    });
    await wallet.unlock(secret);
    await earlier;
    assert.equal(wallet.status().locked, false);
    const address = await wallet.address();
    const beforeDeletion = assert.rejects(wallet.unlock(secret), {
      code: "UNLOCK_CANCELLED",
    });
    await wallet.destroy("disposable test cleanup", address);
    await beforeDeletion;
    assert.equal(wallet.status().locked, true);
    await assert.rejects(wallet.unlock(secret), { code: "KEY_MISSING" });
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

test("simultaneous service starters have one owner, crash restart recovers, audit failure stays contained", async () => {
  const data = await mkdtemp(join(tmpdir(), "wallet-owner-race-"));
  const children: ChildProcessWithoutNullStreams[] = [];
  try {
    await Phase0Wallet.initialize(data, secret);
    await initializeCapabilities(data);
    const token = await readCapability(data, "agent");
    const admin = await readCapability(data, "admin");
    const socket = join(data, "wallet.sock");
    const attempts = [launch(data), launch(data)];
    children.push(...attempts.map((a) => a.child));
    const results = await Promise.all(attempts.map((a) => a.ready));
    assert.equal(results.filter((r) => r.ready).length, 1);
    assert.match(
      results.find((r) => !r.ready)!.error,
      /WALLET_ALREADY_RUNNING/,
    );
    assert.equal(
      ((await callWallet(socket, token, "status")) as { locked: boolean })
        .locked,
      true,
    );
    const winner = attempts[results.findIndex((r) => r.ready)]!;
    await stop(winner.child, "SIGKILL");
    const restarted = launch(data);
    children.push(restarted.child);
    assert.equal((await restarted.ready).ready, true);

    // Send a second request in a later chunk while real decryption is running.
    // Only the first request may dispatch; otherwise the second lock cancels it.
    const reply = await new Promise<string>((resolve, reject) => {
      const peer = createConnection(socket);
      let result = "";
      const timer = setTimeout(() => {
        peer.destroy();
        reject(Error("framing timeout"));
      }, 5000);
      peer.on("error", reject);
      peer.on("data", (b) => {
        result += b;
      });
      peer.on("end", () => {
        clearTimeout(timer);
        resolve(result);
      });
      peer.write(
        JSON.stringify({
          id: "one",
          token: admin,
          method: "unlock",
          params: { password: secret },
        }) + "\n",
      );
      setTimeout(() => {
        if (!peer.destroyed)
          peer.write(
            JSON.stringify({ id: "two", token: admin, method: "lock" }) + "\n",
          );
      }, 20);
    });
    assert.equal(JSON.parse(reply).ok, true);
    assert.equal(
      ((await callWallet(socket, token, "status")) as { locked: boolean })
        .locked,
      false,
    );

    await rename(join(data, "audit.jsonl"), join(data, "audit.saved"));
    await mkdir(join(data, "audit.jsonl"));
    await assert.rejects(callWallet(socket, "invalid", "status"), {
      code: "AUDIT_UNAVAILABLE",
    });
    assert.equal(
      ((await callWallet(socket, token, "status")) as { locked: boolean })
        .locked,
      false,
    );
    await rm(join(data, "audit.jsonl"), { recursive: true });
    await rename(join(data, "audit.saved"), join(data, "audit.jsonl"));
    await callWallet(socket, admin, "lock");
    await stop(restarted.child);
    const last = launch(data);
    children.push(last.child);
    assert.equal((await last.ready).ready, true);
    assert.equal(
      ((await callWallet(socket, token, "status")) as { locked: boolean })
        .locked,
      true,
    );
  } finally {
    await Promise.all(children.map((c) => stop(c)));
    await rm(data, { recursive: true, force: true });
  }
});

test("client bounds silent/oversized responses without retry; unsafe directory rejection leaves target unchanged", async () => {
  const data = await mkdtemp(join(tmpdir(), "wallet-client-boundary-"));
  const peers = new Set<Socket>();
  let requests = 0;
  let large = false;
  const server = createServer((peer) => {
    peers.add(peer);
    peer.on("error", () => {});
    peer.on("close", () => peers.delete(peer));
    peer.once("data", () => {
      requests++;
      if (large) peer.end("x".repeat(8 * 1024 * 1024 + 1));
    });
  });
  try {
    const path = join(data, "test.sock");
    await new Promise<void>((resolve) => server.listen(path, resolve));
    await assert.rejects(
      callWallet(path, "fixture", "status", {}, { timeoutMs: 30 }),
      { code: "IPC_TIMEOUT" },
    );
    assert.equal(requests, 1);
    large = true;
    await assert.rejects(callWallet(path, "fixture", "status"), {
      code: "IPC_RESPONSE_TOO_LARGE",
    });
    assert.equal(requests, 2);
    const target = join(data, "target");
    await mkdir(target, { mode: 0o755 });
    const before = (await stat(target)).mode;
    const link = join(data, "link");
    await symlink(target, link);
    await assert.rejects(ensurePrivateDirectory(link), {
      code: "UNSAFE_DIRECTORY",
    });
    assert.equal((await stat(target)).mode, before);
  } finally {
    for (const peer of peers) peer.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(data, { recursive: true, force: true });
  }
});
