import test from "node:test";
import assert from "node:assert/strict";
import { scoreAccessibilityFindings } from "../src/journey-a11y.js";
import { JourneyValidationError, safeJourneyStep, validateJourney } from "../src/journey-schema.js";

test("validates responsive semantic journeys", () => {
  const journey = validateJourney({
    version: 1,
    name: "Mobile navigation",
    startRoute: "/",
    viewport: { width: 390, height: 844 },
    minimumAccessibilityScore: 75,
    steps: [
      { action: "expect-visible", target: { role: "button", name: "Menu" } },
      { action: "click", target: { role: "button", name: "Menu" } },
      { action: "checkpoint", name: "menu-open" },
      { action: "viewport", width: 1440, height: 1000 }
    ]
  });
  assert.deepEqual(journey.viewport, { width: 390, height: 844 });
  assert.equal(journey.continueOnFailure, false);
});

test("rejects arbitrary selectors and unsafe routes", () => {
  assert.throws(() => validateJourney({
    version: 1,
    name: "Invalid",
    startRoute: "https://outside.example/",
    steps: [{ action: "click", target: { selector: "#danger" } }]
  }), (error) => {
    assert.ok(error instanceof JourneyValidationError);
    assert.ok(error.issues.some((issue) => issue.includes("same-origin route")));
    assert.ok(error.issues.some((issue) => issue.includes("unknown property")));
    return true;
  });
});

test("redacts filled values in stored results", () => {
  const step = safeJourneyStep({
    action: "fill",
    target: { label: "Email" },
    value: "private@example.com"
  });
  assert.equal(step.value, "[REDACTED]");
  assert.equal(step.valueLength, 19);
});

test("scores accessibility findings by severity and count", () => {
  assert.equal(scoreAccessibilityFindings([]), 100);
  assert.equal(scoreAccessibilityFindings([
    { severity: "serious", count: 2 },
    { severity: "minor", count: 1 }
  ]), 79);
});
