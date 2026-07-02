import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runJourney } from "../src/journey.js";

function pageHtml(path, broken) {
  const pricing = path === "/pricing";
  const script = broken ? "" : `
    const button = document.getElementById("menu");
    const nav = document.getElementById("primary-nav");
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      nav.dataset.open = String(open);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        button.setAttribute("aria-expanded", "false");
        nav.dataset.open = "false";
      }
    });`;
  return `<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><title>${pricing ? "Pricing" : "Home"}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;color:#172033;background:#f5f7fb}
    header{display:flex;align-items:center;gap:24px;padding:16px 24px;background:white}
    nav{display:flex;gap:18px}main{max-width:760px;margin:48px auto;padding:32px;background:white}
    #menu{display:none}
    @media(max-width:600px){#menu{display:inline-block}nav{display:none}nav[data-open="true"]{display:flex;flex-direction:column}}
  </style></head><body>
  <header><button id="menu" aria-controls="primary-nav" aria-expanded="false">Menu</button>
  <nav id="primary-nav" aria-label="Primary" data-open="false"><a href="/">Home</a><a href="/pricing">Pricing</a></nav></header>
  <main><h1>${pricing ? "Plans" : "Reconstruct"}</h1>
  <p>${pricing ? "Choose a plan." : "Replay observable behavior."}</p>
  <form><label for="email">Email</label><input id="email" name="email" type="email"></form>
  </main><script>${script}</script></body></html>`;
}

test("replays responsive interaction journeys and reports broken behavior", async () => {
  let broken = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(pageHtml(url.pathname, broken));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const root = await mkdtemp(join(tmpdir(), "reconstruct-journey-"));
  const scenarioPath = join(root, "journey.json");
  const scenario = {
    version: 1,
    name: "Responsive navigation",
    startRoute: "/",
    viewport: { width: 390, height: 844 },
    minimumAccessibilityScore: 80,
    steps: [
      { action: "expect-visible", target: { role: "button", name: "Menu" } },
      { action: "expect-hidden", target: { role: "link", name: "Pricing" } },
      { action: "click", target: { role: "button", name: "Menu" } },
      { action: "expect-visible", target: { role: "link", name: "Pricing" } },
      { action: "fill", target: { label: "Email" }, value: "private@example.com" },
      { action: "checkpoint", name: "mobile-menu-open" },
      { action: "press", key: "Escape" },
      { action: "expect-hidden", target: { role: "link", name: "Pricing" } },
      { action: "viewport", width: 1280, height: 800 },
      { action: "expect-visible", target: { role: "link", name: "Pricing" } },
      { action: "click", target: { role: "link", name: "Pricing" } },
      { action: "expect-url", route: "/pricing" },
      { action: "expect-text", text: "Plans", exact: true },
      { action: "audit", minScore: 80 },
      { action: "checkpoint", name: "pricing-desktop" }
    ]
  };
  await writeFile(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);

  try {
    const passing = await runJourney(scenarioPath, baseUrl, join(root, "passing"), {
      allowPrivateNetwork: true,
      minScore: 90,
      maxRequests: 100,
      timeoutMs: 10_000,
      executablePath: process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH
    });
    assert.equal(passing.passed, true, JSON.stringify(passing, null, 2));
    assert.equal(passing.stats.failedSteps, 0);
    assert.equal(passing.checkpoints.length, 2);
    assert.ok(passing.accessibility.score >= 80);
    const stored = JSON.parse(await readFile(join(root, "passing", "journey.json"), "utf8"));
    const fillStep = stored.steps.find((step) => step.action === "fill");
    assert.equal(fillStep.step.value, "[REDACTED]");
    assert.equal(fillStep.step.valueLength, 19);
    const manifest = JSON.parse(await readFile(join(root, "passing", "JOURNEY_MANIFEST.json"), "utf8"));
    assert.equal(typeof manifest.scenarioSha256, "string");
    assert.ok(manifest.entries.some((entry) => entry.path.endsWith(".png")));

    broken = true;
    const failing = await runJourney(scenarioPath, baseUrl, join(root, "failing"), {
      allowPrivateNetwork: true,
      minScore: 90,
      maxRequests: 100,
      timeoutMs: 2_000,
      executablePath: process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH
    });
    assert.equal(failing.passed, false);
    assert.ok(failing.stats.failedSteps >= 1);
    assert.ok(failing.steps.some((step) => step.status === "skipped"));
    assert.ok(failing.checkpoints.some((checkpoint) => checkpoint.name.startsWith("failure-")));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
