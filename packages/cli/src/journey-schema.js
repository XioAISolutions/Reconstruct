const ACTIONS = new Set([
  "goto",
  "click",
  "fill",
  "press",
  "viewport",
  "expect-visible",
  "expect-hidden",
  "expect-text",
  "expect-url",
  "checkpoint",
  "audit"
]);

const KEYS = new Set([
  "Enter",
  "Escape",
  "Tab",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown"
]);

const ROLES = new Set([
  "alert", "banner", "button", "cell", "checkbox", "combobox", "complementary",
  "contentinfo", "dialog", "form", "heading", "img", "link", "list", "listbox",
  "listitem", "main", "menu", "menuitem", "navigation", "option", "progressbar",
  "radio", "region", "row", "search", "slider", "spinbutton", "status", "switch",
  "tab", "table", "tablist", "textbox"
]);

export class JourneyValidationError extends Error {
  constructor(issues) {
    super(`Invalid journey (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.name = "JourneyValidationError";
    this.issues = issues;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function allowedKeys(value, path, allowed, issues) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`${path}.${key}: unknown property`);
}

function string(value, path, issues, { min = 1, max = 2_000 } = {}) {
  if (typeof value !== "string") return issues.push(`${path}: must be a string`);
  if (value.length < min || value.length > max) issues.push(`${path}: length must be between ${min} and ${max}`);
}

function integer(value, path, issues, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) issues.push(`${path}: must be an integer between ${min} and ${max}`);
}

function score(value, path, issues) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) issues.push(`${path}: must be a number between 0 and 100`);
}

function route(value, path, issues) {
  string(value, path, issues, { max: 2_048 });
  if (typeof value === "string" && (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\0"))) {
    issues.push(`${path}: must be a same-origin route beginning with a single /`);
  }
}

function validateViewport(value, path, issues) {
  if (!isObject(value)) return issues.push(`${path}: must be an object`);
  allowedKeys(value, path, new Set(["width", "height"]), issues);
  integer(value.width, `${path}.width`, issues, 320, 3_840);
  integer(value.height, `${path}.height`, issues, 320, 2_160);
}

function validateTarget(value, path, issues) {
  if (!isObject(value)) return issues.push(`${path}: must be an object`);
  allowedKeys(value, path, new Set(["role", "name", "label", "placeholder", "text", "testId", "exact"]), issues);
  const strategies = ["role", "label", "placeholder", "text", "testId"].filter((key) => value[key] !== undefined);
  if (strategies.length !== 1) issues.push(`${path}: exactly one locator strategy is required`);
  if (value.role !== undefined) {
    string(value.role, `${path}.role`, issues, { max: 50 });
    if (typeof value.role === "string" && !ROLES.has(value.role)) issues.push(`${path}.role: unsupported role`);
    if (value.name !== undefined) string(value.name, `${path}.name`, issues, { min: 0, max: 500 });
  } else if (value.name !== undefined) {
    issues.push(`${path}.name: only valid with role`);
  }
  for (const key of ["label", "placeholder", "text", "testId"]) {
    if (value[key] !== undefined) string(value[key], `${path}.${key}`, issues, { min: 0, max: 500 });
  }
  if (value.exact !== undefined && typeof value.exact !== "boolean") issues.push(`${path}.exact: must be boolean`);
}

function validateStep(step, index, issues, checkpointNames) {
  const path = `$.steps[${index}]`;
  if (!isObject(step)) return issues.push(`${path}: must be an object`);
  allowedKeys(step, path, new Set(["action", "route", "target", "value", "key", "width", "height", "text", "exact", "name", "minScore", "timeoutMs"]), issues);
  string(step.action, `${path}.action`, issues, { max: 50 });
  if (typeof step.action !== "string" || !ACTIONS.has(step.action)) {
    issues.push(`${path}.action: unsupported action`);
    return;
  }
  if (step.timeoutMs !== undefined) integer(step.timeoutMs, `${path}.timeoutMs`, issues, 100, 120_000);

  switch (step.action) {
    case "goto":
    case "expect-url":
      route(step.route, `${path}.route`, issues);
      break;
    case "click":
    case "expect-visible":
    case "expect-hidden":
      validateTarget(step.target, `${path}.target`, issues);
      break;
    case "fill":
      validateTarget(step.target, `${path}.target`, issues);
      string(step.value, `${path}.value`, issues, { min: 0, max: 10_000 });
      break;
    case "press":
      string(step.key, `${path}.key`, issues, { max: 50 });
      if (typeof step.key === "string" && !KEYS.has(step.key)) issues.push(`${path}.key: unsupported key`);
      break;
    case "viewport":
      integer(step.width, `${path}.width`, issues, 320, 3_840);
      integer(step.height, `${path}.height`, issues, 320, 2_160);
      break;
    case "expect-text":
      string(step.text, `${path}.text`, issues, { min: 0, max: 2_000 });
      if (step.exact !== undefined && typeof step.exact !== "boolean") issues.push(`${path}.exact: must be boolean`);
      break;
    case "checkpoint":
      string(step.name, `${path}.name`, issues, { max: 120 });
      if (typeof step.name === "string") {
        if (!/^[a-z0-9][a-z0-9._-]{0,119}$/i.test(step.name)) issues.push(`${path}.name: invalid checkpoint name`);
        if (checkpointNames.has(step.name)) issues.push(`${path}.name: duplicate checkpoint name`);
        checkpointNames.add(step.name);
      }
      break;
    case "audit":
      if (step.minScore !== undefined) score(step.minScore, `${path}.minScore`, issues);
      break;
  }
}

export function validateJourney(input) {
  const issues = [];
  if (!isObject(input)) issues.push("$: must be an object");
  if (issues.length === 0) {
    allowedKeys(input, "$", new Set(["version", "name", "startRoute", "viewport", "steps", "continueOnFailure", "minimumAccessibilityScore"]), issues);
    if (input.version !== 1) issues.push("$.version: expected 1");
    string(input.name, "$.name", issues, { max: 300 });
    route(input.startRoute ?? "/", "$.startRoute", issues);
    if (input.viewport !== undefined) validateViewport(input.viewport, "$.viewport", issues);
    if (input.continueOnFailure !== undefined && typeof input.continueOnFailure !== "boolean") issues.push("$.continueOnFailure: must be boolean");
    if (input.minimumAccessibilityScore !== undefined) score(input.minimumAccessibilityScore, "$.minimumAccessibilityScore", issues);
    if (!Array.isArray(input.steps)) issues.push("$.steps: must be an array");
    else {
      if (input.steps.length < 1 || input.steps.length > 200) issues.push("$.steps: length must be between 1 and 200");
      const checkpointNames = new Set();
      input.steps.forEach((step, index) => validateStep(step, index, issues, checkpointNames));
    }
  }
  if (issues.length) throw new JourneyValidationError(issues);
  return {
    ...input,
    startRoute: input.startRoute ?? "/",
    viewport: input.viewport ?? { width: 1440, height: 1000 },
    continueOnFailure: input.continueOnFailure === true,
    minimumAccessibilityScore: input.minimumAccessibilityScore ?? 80
  };
}

export function safeJourneyStep(step) {
  if (step.action !== "fill") return structuredClone(step);
  return { ...step, value: "[REDACTED]", valueLength: String(step.value ?? "").length };
}

export const JOURNEY_ACTIONS = Object.freeze([...ACTIONS]);
