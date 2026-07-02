import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyAppSpec, serializeAppSpec } from "@reconstruct/appspec";
import { sha256 } from "../src/fs.js";
import { verifyAppSpecProject } from "../src/integrity.js";

async function projectFixture() {
  const root = await mkdtemp(join(tmpdir(), "reconstruct-integrity-"));
  await mkdir(join(root, "evidence", "pages"), { recursive: true });
  const relative = "evidence/pages/home.json";
  const content = Buffer.from('{"title":"Home"}\n');
  const digest = sha256(content);
  await writeFile(join(root, relative), content);
  const now = new Date().toISOString();
  const spec = createEmptyAppSpec({ name: "Example", sourceUrl: "https://example.com", startedAt: now });
  spec.capture.completedAt = now;
  spec.screens.push({
    id: "screen-home",
    route: "/",
    title: "Home",
    assessment: { status: "observed", confidence: 1 },
    components: [],
    evidence: [{ type: "dom", path: relative, sha256: digest, bytes: content.length, mediaType: "application/json" }]
  });
  await writeFile(join(root, "evidence", "manifest.json"), `${JSON.stringify({
    version: 1,
    algorithm: "sha256",
    createdAt: now,
    sourceUrl: "https://example.com",
    entries: [{ type: "dom", path: relative, sha256: digest, bytes: content.length, mediaType: "application/json" }]
  }, null, 2)}\n`);
  await writeFile(join(root, "appspec.json"), serializeAppSpec(spec));
  return { root, evidence: join(root, relative), appSpec: join(root, "appspec.json") };
}

test("verifies evidence manifest and hashes", async () => {
  const fixture = await projectFixture();
  try {
    const result = await verifyAppSpecProject(fixture.appSpec);
    assert.equal(result.verifiedFiles.length, 1);
    assert.equal(result.app, "Example");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("detects evidence tampering", async () => {
  const fixture = await projectFixture();
  try {
    await writeFile(fixture.evidence, "tampered\n");
    await assert.rejects(() => verifyAppSpecProject(fixture.appSpec), /mismatch/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
