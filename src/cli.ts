#!/usr/bin/env node
/**
 * Standalone terminal entry. Hidden input stays local; commands use the same
 * capability-scoped IPC as other trusted callers. See doc/usage.md.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  callWallet,
  initializeCapabilities,
  readCapability,
  startWalletServer,
} from "./ipc.js";
import { publicError, WalletError } from "./errors.js";
import { importSessionKey } from "./key-import.js";
import { Phase0Wallet } from "./wallet.js";

const args = process.argv.slice(2);
const [command, directory, argument] = args;

try {
  if (!command || !directory) usage();
  const dataDir = resolve(directory);
  switch (command) {
    case "init": {
      requireArgumentCount(2);
      const password = await readHidden("Create unlock secret: ");
      const confirmation = await readHidden("Confirm unlock secret: ");
      if (password !== confirmation)
        throw new WalletError("SECRET_MISMATCH", "unlock secrets do not match");
      const wallet = await Phase0Wallet.initialize(dataDir, password);
      await initializeCapabilities(dataDir);
      print({
        initialized: true,
        address: await wallet.address(),
        locked: true,
      });
      break;
    }
    case "prepare-access": {
      requireArgumentCount(2);
      await Phase0Wallet.open(dataDir);
      await initializeCapabilities(dataDir);
      print({ ready: true });
      break;
    }
    case "import-key": {
      requireArgumentCount(3);
      if (!argument) usage();
      let result;
      if (argument === "--private-key") {
        const privateKey = await readHidden("Original Session Key (hidden): ");
        const password = await readHidden("Create unlock secret: ");
        if (password !== (await readHidden("Confirm unlock secret: ")))
          throw new WalletError(
            "SECRET_MISMATCH",
            "unlock secrets do not match",
          );
        result = await importSessionKey(dataDir, { privateKey, password });
      } else
        result = await importSessionKey(dataDir, {
          file: resolve(argument),
          password: await readHidden("Backup unlock secret: "),
        });
      await initializeCapabilities(dataDir);
      print(result);
      break;
    }
    case "bind": {
      requireArgumentCount(3);
      if (!argument) usage();
      const policy = JSON.parse(
        await readFile(resolve(argument), "utf8"),
      ) as unknown;
      print(await adminCall(dataDir, "bindPolicy", { policy }));
      break;
    }
    case "serve": {
      requireArgumentCount(2);
      const handle = await startWalletServer(dataDir);
      print({ ready: true, socket: handle.socketPath, locked: true });
      const stop = async () => {
        await handle.close();
        process.exit(0);
      };
      process.once("SIGINT", () => {
        void stop();
      });
      process.once("SIGTERM", () => {
        void stop();
      });
      break;
    }
    case "unlock": {
      requireArgumentCount(2);
      const password = await readHidden("Unlock secret: ");
      print(await adminCall(dataDir, "unlock", { password }));
      break;
    }
    case "lock":
      requireArgumentCount(2);
      print(await adminCall(dataDir, "lock"));
      break;
    case "status":
      requireArgumentCount(2);
      print(await agentCall(dataDir, "status"));
      break;
    case "address":
      requireArgumentCount(2);
      print(await agentCall(dataDir, "getAddress"));
      break;
    case "sign": {
      requireArgumentCount(3);
      if (!argument) usage();
      const commitment = JSON.parse(
        await readFile(resolve(argument), "utf8"),
      ) as unknown;
      print(await agentCall(dataDir, "signAgentPayCommitment", { commitment }));
      break;
    }
    case "destroy": {
      requireArgumentCount(3);
      if (!argument) usage();
      print(
        await adminCall(dataDir, "destroy", {
          confirmAddress: argument,
          reason: "phase0 operator-requested cleanup",
        }),
      );
      break;
    }
    default:
      usage();
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: publicError(error) })}\n`,
  );
  process.exitCode = 1;
}

function requireArgumentCount(expected: number): void {
  if (args.length !== expected) usage();
}

async function agentCall(
  dataDir: string,
  method: string,
  params: Record<string, unknown> = {},
) {
  return callWallet(
    join(dataDir, "wallet.sock"),
    await readCapability(dataDir, "agent"),
    method,
    params,
  );
}

async function adminCall(
  dataDir: string,
  method: string,
  params: Record<string, unknown> = {},
) {
  return callWallet(
    join(dataDir, "wallet.sock"),
    await readCapability(dataDir, "admin"),
    method,
    params,
  );
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function usage(): never {
  throw new WalletError(
    "USAGE",
    "usage: agentpay-wallet <init|import-key|prepare-access|bind|serve|unlock|lock|status|address|sign|destroy> <data-dir> [policy-or-request-file|confirm-address]",
  );
}

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new WalletError(
      "TTY_REQUIRED",
      "unlock secrets require an interactive TTY",
    );
  }
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolveSecret, reject) => {
    let secret = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      if (error) reject(error);
      else resolveSecret(secret);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003")
          return finish(new WalletError("CANCELLED", "operation cancelled"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b")
          secret = secret.slice(0, -1);
        else secret += character;
        if (secret.length > 4096)
          return finish(
            new WalletError("INPUT_TOO_LONG", "hidden input is too long"),
          );
      }
    };
    process.stdin.on("data", onData);
  });
}
