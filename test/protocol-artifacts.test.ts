/**
 * Public dependency provenance check, separate from Wallet behavioral acceptance.
 * Keys, addresses and remote responses in this suite are test fixtures.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

interface ArtifactManifest {
  schema: string;
  sourceCommit: string;
  packages: Array<{
    name: string;
    version: string;
    file: string;
    sha256: string;
  }>;
}

test("standalone installation matches the declared Protocol archive and version", () => {
  const manifest = JSON.parse(
    readFileSync("vendor/protocol/artifact-manifest.json", "utf8"),
  ) as ArtifactManifest;
  assert.equal(manifest.schema, "agentpay.wallet-protocol-artifacts.v1");
  assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
  const artifact = manifest.packages.find(
    (entry) => entry.name === "@agentpay/types",
  );
  assert(artifact);
  const consumer = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    consumer.dependencies["@agentpay/types"],
    `file:vendor/protocol/${artifact.file}`,
  );
  const installed = JSON.parse(
    readFileSync("node_modules/@agentpay/types/package.json", "utf8"),
  );
  assert.equal(installed.name, artifact.name);
  assert.equal(installed.version, artifact.version);
  const bytes = readFileSync(`vendor/protocol/${artifact.file}`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    artifact.sha256,
  );
});
