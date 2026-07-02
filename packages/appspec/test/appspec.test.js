import test from "node:test";
import assert from "node:assert/strict";
import { APP_SPEC_VERSION, AppSpecValidationError, createEmptyAppSpec, isSafeRelativePath, serializeAppSpec, validateAppSpec } from "../src/index.js";

function validSpec() {
  const now = new Date().toISOString();
  const spec = createEmptyAppSpec({ name: "Example", sourceUrl: "https://example.com", startedAt: now });
  spec.capture.completedAt = now;
  spec.capture.pageCount = 2;
  spec.screens.push(
    {
      id: "screen-home",
      route: "/",
      title: "Home",
      assessment: { status: "observed", confidence: 1 },
      components: ["component-nav"],
      evidence: [{ type: "dom", path: "evidence/pages/home.json", sha256: "a".repeat(64), bytes: 42, mediaType: "application/json" }]
    },
    {
      id: "screen-pricing",
      route: "/pricing",
      title: "Pricing",
      assessment: { status: "observed", confidence: 1 },
      components: ["component-nav"],
      evidence: [{ type: "dom", path: "evidence/pages/pricing.json", sha256: "b".repeat(64), bytes: 40, mediaType: "application/json" }]
    }
  );
  spec.components.push({
    id: "component-nav",
    name: "Navigation",
    type: "nav",
    states: ["default"],
    assessment: { status: "observed", confidence: 0.9 },
    evidence: [spec.screens[0].evidence[0], spec.screens[1].evidence[0]]
  });
  spec.flows.push({
    id: "flow-home-pricing",
    name: "Home to Pricing",
    sourceScreenId: "screen-home",
    targetScreenId: "screen-pricing",
    trigger: "Pricing",
    steps: ["Open /", "Follow Pricing", "Arrive at /pricing"],
    assessment: { status: "observed", confidence: 0.95 },
    evidence: [{ type: "map", path: "evidence/route-graph.json", sha256: "c".repeat(64), bytes: 100, mediaType: "application/json" }]
  });
  return spec;
}

test("validates and serializes a multi-page AppSpec", () => {
  const spec = validSpec();
  assert.equal(validateAppSpec(spec), spec);
  assert.match(serializeAppSpec(spec), new RegExp(`"version": "${APP_SPEC_VERSION.replaceAll(".", "\\.")}"`));
});

test("rejects duplicate ids, unsafe paths, and broken flow references", () => {
  const spec = validSpec();
  spec.screens.push({ ...spec.screens[0], evidence: [{ ...spec.screens[0].evidence[0], path: "../secret" }] });
  spec.flows[0].targetScreenId = "screen-missing";
  assert.throws(() => validateAppSpec(spec), (error) => {
    assert.ok(error instanceof AppSpecValidationError);
    assert.ok(error.issues.some((issue) => issue.includes("duplicate id")));
    assert.ok(error.issues.some((issue) => issue.includes("safe relative path")));
    assert.ok(error.issues.some((issue) => issue.includes("unknown screen id")));
    return true;
  });
});

test("rejects prototype-pollution keys", () => {
  const spec = validSpec();
  const parsed = JSON.parse(JSON.stringify(spec).replace('"app":{', '"__proto__":{},"app":{'));
  assert.throws(() => validateAppSpec(parsed), /Invalid AppSpec/);
});

test("recognizes safe relative paths", () => {
  assert.equal(isSafeRelativePath("evidence/pages/home.json"), true);
  assert.equal(isSafeRelativePath("../home.json"), false);
  assert.equal(isSafeRelativePath("/tmp/home.json"), false);
  assert.equal(isSafeRelativePath("C:\\home.json"), false);
});
