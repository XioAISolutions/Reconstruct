import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capturePublicApp } from "../src/capture.js";
import { evaluateCandidate } from "../src/evaluate.js";

function html(path, broken = false) {
  const title = path === "/pricing" ? "Pricing" : "Home";
  const heading = broken && path === "/" ? "Different product" : title;
  const navigation = broken
    ? '<a href="/">Home</a>'
    : '<a href="/">Home</a><a href="/pricing">Pricing</a>';
  const background = broken ? "#2d1020" : "#f4f7fb";
  return `<!doctype html><html><head><title>${title}</title><style>
    :root{--primary-color:#174ea6;--space-md:16px;--radius-card:8px}
    *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:${background};color:#172033}
    nav{height:64px;display:flex;align-items:center;gap:24px;padding:0 32px;background:white;border-bottom:1px solid #d8deea}
    main{width:720px;margin:64px auto;padding:32px;background:white;border-radius:8px}
    h1{font-size:42px;margin:0 0 16px}p{font-size:18px;line-height:1.5}a{color:#174ea6}
  </style></head><body><nav id="primary-nav">${navigation}</nav><main><h1>${heading}</h1><p>${path === "/pricing" ? "Simple predictable plans." : "Build observable applications from evidence."}</p>${broken ? "" : '<button type="button">Start</button>'}</main></body></html>`;
}

test("evaluates matching and broken candidates with visual and behavioral evidence", async () => {
  let broken = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html(url.pathname, broken));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const root = await mkdtemp(join(tmpdir(), "reconstruct-evaluate-"));
  const project = join(root, "project");

  try {
    await capturePublicApp(`${baseUrl}/`, project, {
      allowPrivateNetwork: true,
      maxPages: 2,
      maxDepth: 1,
      maxRequests: 100,
      timeoutMs: 10_000,
      crawlDelayMs: 0,
      viewport: { width: 900, height: 700 },
      executablePath: process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH
    });

    const matching = await evaluateCandidate(join(project, "appspec.json"), baseUrl, join(root, "matching"), {
      allowPrivateNetwork: true,
      minScore: 90,
      maxRequests: 100,
      timeoutMs: 10_000,
      executablePath: process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH
    });
    assert.equal(matching.passed, true);
    assert.ok(matching.score >= 95);
    assert.equal(matching.routes.length, 2);
    assert.ok(matching.routes.every((route) => route.diffImage));
    assert.match(await readFile(join(root, "matching", "REPORT.md"), "utf8"), /PASS/);
    const manifest = JSON.parse(await readFile(join(root, "matching", "EVALUATION_MANIFEST.json"), "utf8"));
    assert.equal(typeof manifest.sourceAppSpecSha256, "string");
    assert.equal("sourceAppSpec" in manifest, false);

    broken = true;
    const changed = await evaluateCandidate(join(project, "appspec.json"), baseUrl, join(root, "changed"), {
      allowPrivateNetwork: true,
      minScore: 95,
      maxRequests: 100,
      timeoutMs: 10_000,
      executablePath: process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH
    });
    assert.equal(changed.passed, false);
    assert.ok(changed.score < matching.score);
    assert.ok(changed.routes.some((route) => route.findings.length > 0));
    assert.match(await readFile(join(root, "changed", "CORRECTION_PLAN.md"), "utf8"), /Missing|Visual similarity|navigation/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
