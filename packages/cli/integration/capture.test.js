import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capturePublicPage } from "../src/capture.js";

test("captures a local authorized page with integrity metadata", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><head><title>Test App</title><style>body{background:url(https://tracker.example/x)}</style></head><body><main><h1>Hello</h1><a href="https://example.com/?token=secret-token">Link</a><form action="https://example.com/submit?api_key=secret"><input name="email" value="secret@example.com"></form><iframe src="https://tracker.example/frame"></iframe><script>window.evil=true</script></main></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const root = await mkdtemp(join(tmpdir(), "reconstruct-capture-"));
  const output = join(root, "project");

  try {
    const spec = await capturePublicPage(`http://127.0.0.1:${address.port}`, output, {
      allowPrivateNetwork: true,
      timeoutMs: 10_000,
      maxRequests: 20,
      viewport: { width: 800, height: 600 },
      executablePath: process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH
    });
    assert.equal(spec.app.name, "Test App");
    assert.equal(spec.capture.mode, "public");
    const html = await readFile(join(output, "evidence/pages/home.html"), "utf8");
    assert.doesNotMatch(html, /secret@example\.com/);
    assert.doesNotMatch(html, /<script|<iframe|<style/i);
    assert.doesNotMatch(html, /\s(?:href|src|action)=/i);
    assert.doesNotMatch(html, /secret-token|api_key=secret/);
    const manifest = JSON.parse(await readFile(join(output, "evidence/manifest.json"), "utf8"));
    assert.ok(manifest.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
