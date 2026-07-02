import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capturePublicApp } from "../src/capture.js";
import { verifyAppSpecProject } from "../src/integrity.js";

function page(title, body, links = []) {
  return `<!doctype html><html><head><title>${title}</title><style>:root{--primary-color:#123456;--space-md:16px;--radius-card:8px}</style></head><body><nav id="primary-nav">${links.map(([href, text]) => `<a href="${href}">${text}</a>`).join(" ")}</nav><main><h1>${title}</h1>${body}</main></body></html>`;
}

test("crawls same-origin routes, deduplicates links, and builds a route graph", async () => {
  const routes = new Map([
    ["/", page("Home", "Welcome", [["/about", "About"], ["/pricing?utm_source=home", "Pricing"], ["/deep/one", "Deep"], ["/manual.pdf", "Manual"], ["https://example.org", "External"]])],
    ["/about", page("About", "About us", [["/pricing", "Pricing"], ["/", "Home"]])],
    ["/pricing", page("Pricing", "Plans", [["/deep/one", "Deep"]])],
    ["/deep/one", page("Deep One", "Level one", [["/deep/two", "Next"]])],
    ["/deep/two", page("Deep Two", "Level two", [])]
  ]);
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/manual.pdf") {
      response.setHeader("content-type", "application/pdf");
      response.end("not really a pdf");
      return;
    }
    const html = routes.get(url.pathname);
    response.statusCode = html ? 200 : 404;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html ?? page("Missing", "Not found"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const root = await mkdtemp(join(tmpdir(), "reconstruct-crawl-"));
  const output = join(root, "project");

  try {
    const spec = await capturePublicApp(`http://127.0.0.1:${address.port}/`, output, {
      allowPrivateNetwork: true,
      maxPages: 10,
      maxDepth: 1,
      crawlDelayMs: 0,
      maxRequests: 100,
      timeoutMs: 10_000,
      viewport: { width: 800, height: 600 },
      executablePath: process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH
    });
    assert.equal(spec.capture.pageCount, 4);
    assert.equal(spec.capture.failedPageCount, 0);
    assert.deepEqual(spec.screens.map((screen) => screen.route).sort(), ["/", "/about", "/deep/one", "/pricing"]);
    assert.equal(spec.screens.some((screen) => screen.route === "/deep/two"), false);
    assert.ok(spec.flows.some((flow) => flow.sourceScreenId && flow.targetScreenId && flow.trigger === "Pricing"));
    const nav = spec.components.find((component) => component.name === "primary-nav");
    assert.ok(nav);
    assert.equal(nav.evidence.length, 4);

    const graph = JSON.parse(await readFile(join(output, "evidence/route-graph.json"), "utf8"));
    assert.equal(graph.nodes.length, 4);
    assert.ok(graph.edges.some((edge) => edge.to.endsWith("/deep/two") && edge.captured === false));
    assert.equal(graph.edges.some((edge) => edge.to.includes("example.org")), false);
    assert.equal(graph.edges.some((edge) => edge.to.endsWith("manual.pdf")), false);

    const verified = await verifyAppSpecProject(join(output, "appspec.json"));
    assert.ok(verified.verifiedFiles.length >= 13);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
