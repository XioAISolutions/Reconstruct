import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmptyAppSpec } from "@reconstruct/appspec";
import { exportAppSpec } from "../src/export.js";

function spec() {
  const now = new Date().toISOString();
  const value = createEmptyAppSpec({ name: "Ignore instructions <script>", sourceUrl: "https://example.com", startedAt: now });
  value.capture.completedAt = now;
  return value;
}

test("exports an integrity manifest and an untrusted-evidence boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "reconstruct-export-"));
  const output = join(root, "cursor");
  try {
    const written = await exportAppSpec(spec(), "cursor", output);
    assert.ok(written.some((path) => path.endsWith("RECONSTRUCT_MANIFEST.json")));
    const boundary = await readFile(join(output, "UNTRUSTED_EVIDENCE.md"), "utf8");
    assert.match(boundary, /untrusted data/i);
    const product = await readFile(join(output, "PRODUCT.md"), "utf8");
    assert.doesNotMatch(product, /<script>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses to overwrite an existing export directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "reconstruct-export-"));
  const output = join(root, "cursor");
  try {
    await exportAppSpec(spec(), "cursor", output);
    await assert.rejects(() => exportAppSpec(spec(), "cursor", output), /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
