import test from "node:test";
import assert from "node:assert/strict";
import { compareFlows, compareSignatures, compareStructure, combineRouteScores, pngDimensions } from "../src/evaluate-utils.js";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64");

test("parses bounded PNG dimensions", () => {
  assert.deepEqual(pngDimensions(PNG_1X1), { width: 1, height: 1 });
  assert.throws(() => pngDimensions(Buffer.from("not-png")), /PNG/);
});

test("compares signatures without leaking array indexes into normalization", () => {
  const result = compareSignatures(["Home", "Pricing"], ["home", "Contact"]);
  assert.equal(result.matched.includes("home"), true);
  assert.deepEqual(result.missing, ["pricing"]);
  assert.deepEqual(result.unexpected, ["contact"]);
});

test("scores observable structure and navigation", () => {
  const reference = {
    title: "Example",
    headings: [{ level: 1, text: "Welcome" }],
    links: [{ text: "Pricing", href: "https://example.com/pricing", visible: true }],
    buttons: [{ text: "Start", label: null, type: "button" }],
    forms: [],
    landmarks: [{ tag: "main", role: null, label: null, heading: "Welcome", id: "main" }],
    designTokens: { bodyFontFamily: "Arial", bodyFontSize: "16px", bodyColor: "rgb(0, 0, 0)", bodyBackgroundColor: "rgb(255, 255, 255)" }
  };
  const structure = compareStructure(reference, structuredClone(reference));
  assert.equal(structure.score, 100);

  const screens = new Map([["screen-pricing", { route: "/pricing" }]]);
  const behavior = compareFlows([{ id: "flow-1", targetScreenId: "screen-pricing", trigger: "Pricing" }], reference, "https://example.com", screens);
  assert.equal(behavior.score, 100);
  assert.equal(combineRouteScores({ visual: 100, structure: 100, behavior: 100 }), 100);
});

test("penalizes missing controls", () => {
  const reference = {
    title: "Example",
    headings: [{ level: 1, text: "Welcome" }],
    links: [],
    buttons: [{ text: "Start", label: null, type: "button" }],
    forms: [], landmarks: [],
    designTokens: { bodyFontFamily: "Arial", bodyFontSize: "16px", bodyColor: "black", bodyBackgroundColor: "white" }
  };
  const candidate = { ...reference, buttons: [] };
  const result = compareStructure(reference, candidate);
  assert.ok(result.score < 100);
  assert.deepEqual(result.buttons.missing, ["start|button"]);
});
