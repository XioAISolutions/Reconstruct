import test from "node:test";
import assert from "node:assert/strict";
import { AppSpecValidationError, createEmptyAppSpec, isSafeRelativePath, serializeAppSpec, validateAppSpec } from "../src/index.js";

function validSpec() {
  const now = new Date().toISOString();
  const spec = createEmptyAppSpec({ name: "Example", sourceUrl: "https://example.com", startedAt: now });
  spec.capture.completedAt = now;
  spec.screens.push({
    id: "screen-home",
    route: "/",
    title: "Home",
    assessment: { status: "observed", confidence: 1 },
    components: [],
    evidence: [{ type: "dom", path: "evidence/pages/home.json", sha256: "a".repeat(64), bytes: 42, mediaType: "application/json" }]
  });
  return spec;
}

test("validates and serializes a complete AppSpec", () => {
  const spec = validSpec();
  assert.equal(validateAppSpec(spec), spec);
  assert.match(serializeAppSpec(spec), /"version": "0\.2\.0"/);
});

test("rejects duplicate ids and unsafe evidence paths", () => {
  const spec = validSpec();
  spec.screens.push({ ...spec.screens[0], evidence: [{ ...spec.screens[0].evidence[0], path: "../secret" }] });
  assert.throws(() => validateAppSpec(spec), (error) => {
    assert.ok(error instanceof AppSpecValidationError);
    assert.ok(error.issues.some((issue) => issue.includes("duplicate id")));
    assert.ok(error.issues.some((issue) => issue.includes("safe relative path")));
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
