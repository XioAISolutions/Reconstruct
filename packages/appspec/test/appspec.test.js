import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppSpec, validateAppSpec } from "../src/index.js";

test("creates and validates a minimal AppSpec", () => {
  const spec = createEmptyAppSpec({
    name: "Example",
    sourceUrl: "https://example.com"
  });

  assert.equal(validateAppSpec(spec), spec);
  assert.equal(spec.version, "0.1.0");
});

test("rejects confidence outside zero to one", () => {
  const spec = createEmptyAppSpec({
    name: "Example",
    sourceUrl: "https://example.com"
  });
  spec.screens.push({
    id: "home",
    route: "/",
    title: "Home",
    status: "observed",
    confidence: 2
  });

  assert.throws(() => validateAppSpec(spec), /confidence/);
});
