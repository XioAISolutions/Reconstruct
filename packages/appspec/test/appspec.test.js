import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppSpec, validateAppSpec } from "../src/index.js";

function baseSpec() {
  return createEmptyAppSpec({
    name: "Example",
    sourceUrl: "https://example.com"
  });
}

test("creates and validates a minimal AppSpec", () => {
  const spec = baseSpec();

  assert.equal(validateAppSpec(spec), spec);
  assert.equal(spec.version, "0.1.0");
});

test("validates a fully populated AppSpec", () => {
  const spec = baseSpec();
  spec.screens.push({
    id: "screen-home",
    route: "/",
    title: "Home",
    status: "observed",
    confidence: 0.99,
    evidence: ["evidence/screenshots/home.png"]
  });
  spec.components.push({
    id: "component-header",
    name: "header",
    type: "header",
    status: "observed",
    confidence: 0.9
  });
  spec.flows.push({ name: "Sign in", steps: ["Open /login", "Submit credentials"] });
  spec.assumptions.push("The navigation is identical on every screen.");
  spec.unknowns.push("Backend data model is not observable.");
  spec.acceptanceTests.push({
    id: "page-renders",
    given: "A visitor opens /",
    when: "The page finishes loading",
    then: "The Home screen renders"
  });

  assert.equal(validateAppSpec(spec), spec);
});

test("rejects confidence outside zero to one", () => {
  const spec = baseSpec();
  spec.screens.push({
    id: "home",
    route: "/",
    title: "Home",
    status: "observed",
    confidence: 2
  });

  assert.throws(() => validateAppSpec(spec), /confidence/);
});

test("rejects NaN confidence", () => {
  const spec = baseSpec();
  spec.screens.push({
    id: "home",
    route: "/",
    title: "Home",
    status: "observed",
    confidence: NaN
  });

  assert.throws(() => validateAppSpec(spec), /confidence/);
});

test("rejects duplicate screen ids", () => {
  const spec = baseSpec();
  const screen = { id: "home", route: "/", title: "Home", status: "observed", confidence: 0.9 };
  spec.screens.push(screen, { ...screen });

  assert.throws(() => validateAppSpec(spec), /Duplicate screen id/);
});

test("rejects non-array collections", () => {
  const spec = baseSpec();
  spec.screens = "not-an-array";

  assert.throws(() => validateAppSpec(spec), /screens must be an array/);
});

test("rejects flows without a steps array", () => {
  const spec = baseSpec();
  spec.flows.push({ name: "Broken flow" });

  assert.throws(() => validateAppSpec(spec), /steps must be an array/);
});

test("rejects components with an invalid status", () => {
  const spec = baseSpec();
  spec.components.push({
    id: "component-header",
    name: "header",
    type: "header",
    status: "guessed",
    confidence: 0.9
  });

  assert.throws(() => validateAppSpec(spec), /status/);
});

test("rejects a non-http sourceUrl", () => {
  const spec = createEmptyAppSpec({
    name: "Example",
    sourceUrl: "javascript:alert(1)"
  });

  assert.throws(() => validateAppSpec(spec), /http or https/);
});

test("rejects a malformed sourceUrl", () => {
  const spec = createEmptyAppSpec({ name: "Example", sourceUrl: "not a url" });

  assert.throws(() => validateAppSpec(spec), /not a valid URL/);
});

test("rejects an invalid generatedAt date", () => {
  const spec = baseSpec();
  spec.generatedAt = "yesterday-ish";

  assert.throws(() => validateAppSpec(spec), /generatedAt/);
});

test("rejects an unsupported version", () => {
  const spec = baseSpec();
  spec.version = "9.9.9";

  assert.throws(() => validateAppSpec(spec), /Unsupported AppSpec version/);
});

test("rejects non-string assumptions and unknowns", () => {
  const spec = baseSpec();
  spec.unknowns.push({ note: "object" });

  assert.throws(() => validateAppSpec(spec), /unknowns\[0\] must be a string/);
});

test("rejects incomplete acceptance tests", () => {
  const spec = baseSpec();
  spec.acceptanceTests.push({ id: "partial", given: "A visitor" });

  assert.throws(() => validateAppSpec(spec), /acceptanceTests\[0\]\.when/);
});
