export const APP_SPEC_VERSION = "0.1.0";

const statuses = new Set(["observed", "inferred", "unknown"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function optionalArray(value, label) {
  assert(value === undefined || Array.isArray(value), `${label} must be an array when present`);
  return value ?? [];
}

function assertNonEmptyString(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} must be a non-empty string`);
}

function assertStatus(value, label) {
  assert(statuses.has(value), `Invalid ${label} status: ${value}`);
}

function assertConfidence(value, label) {
  assert(
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1,
    `${label} confidence must be a number between 0 and 1`
  );
}

function assertStringItems(values, label) {
  for (const [index, value] of values.entries()) {
    assert(typeof value === "string", `${label}[${index}] must be a string`);
  }
}

export function validateAppSpec(input) {
  assert(input && typeof input === "object" && !Array.isArray(input), "AppSpec must be an object");
  assert(input.version === APP_SPEC_VERSION, `Unsupported AppSpec version: ${input.version}`);
  assert(
    typeof input.generatedAt === "string" && !Number.isNaN(Date.parse(input.generatedAt)),
    "generatedAt must be a valid date string"
  );
  assert(input.app && typeof input.app === "object", "app is required");
  assertNonEmptyString(input.app.name, "app.name");
  assertNonEmptyString(input.app.sourceUrl, "app.sourceUrl");
  let sourceUrl;
  try {
    sourceUrl = new URL(input.app.sourceUrl);
  } catch {
    throw new Error(`app.sourceUrl is not a valid URL: ${input.app.sourceUrl}`);
  }
  assert(/^https?:$/.test(sourceUrl.protocol), "app.sourceUrl must use http or https");

  const screenIds = new Set();
  for (const [index, screen] of optionalArray(input.screens, "screens").entries()) {
    assert(screen && typeof screen === "object", `screens[${index}] must be an object`);
    assertNonEmptyString(screen.id, `screens[${index}].id`);
    assert(!screenIds.has(screen.id), `Duplicate screen id: ${screen.id}`);
    screenIds.add(screen.id);
    assertNonEmptyString(screen.route, `screens[${index}].route`);
    assertNonEmptyString(screen.title, `screens[${index}].title`);
    assertStatus(screen.status, `screens[${index}]`);
    assertConfidence(screen.confidence, `screens[${index}]`);
    assertStringItems(optionalArray(screen.evidence, `screens[${index}].evidence`), `screens[${index}].evidence`);
  }

  for (const [index, component] of optionalArray(input.components, "components").entries()) {
    assert(component && typeof component === "object", `components[${index}] must be an object`);
    assertNonEmptyString(component.id, `components[${index}].id`);
    assertNonEmptyString(component.name, `components[${index}].name`);
    assertNonEmptyString(component.type, `components[${index}].type`);
    assertStatus(component.status, `components[${index}]`);
    assertConfidence(component.confidence, `components[${index}]`);
  }

  for (const [index, flow] of optionalArray(input.flows, "flows").entries()) {
    assert(flow && typeof flow === "object", `flows[${index}] must be an object`);
    assertNonEmptyString(flow.name, `flows[${index}].name`);
    assert(Array.isArray(flow.steps), `flows[${index}].steps must be an array`);
    assertStringItems(flow.steps, `flows[${index}].steps`);
  }

  assertStringItems(optionalArray(input.assumptions, "assumptions"), "assumptions");
  assertStringItems(optionalArray(input.unknowns, "unknowns"), "unknowns");

  for (const [index, test] of optionalArray(input.acceptanceTests, "acceptanceTests").entries()) {
    assert(test && typeof test === "object", `acceptanceTests[${index}] must be an object`);
    assertNonEmptyString(test.id, `acceptanceTests[${index}].id`);
    assertNonEmptyString(test.given, `acceptanceTests[${index}].given`);
    assertNonEmptyString(test.when, `acceptanceTests[${index}].when`);
    assertNonEmptyString(test.then, `acceptanceTests[${index}].then`);
  }

  return input;
}

export function createEmptyAppSpec({ name, sourceUrl }) {
  return {
    version: APP_SPEC_VERSION,
    generatedAt: new Date().toISOString(),
    app: { name, sourceUrl },
    screens: [],
    components: [],
    flows: [],
    designSystem: { colors: {}, typography: {}, spacing: {}, radii: {} },
    assumptions: [],
    unknowns: [],
    acceptanceTests: []
  };
}
