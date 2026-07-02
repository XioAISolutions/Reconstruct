export const APP_SPEC_VERSION = "0.1.0";

const statuses = new Set(["observed", "inferred", "unknown"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateAppSpec(input) {
  assert(input && typeof input === "object", "AppSpec must be an object");
  assert(input.version === APP_SPEC_VERSION, `Unsupported AppSpec version: ${input.version}`);
  assert(typeof input.generatedAt === "string", "generatedAt is required");
  assert(input.app && typeof input.app.name === "string", "app.name is required");
  assert(input.app && typeof input.app.sourceUrl === "string", "app.sourceUrl is required");
  for (const screen of input.screens ?? []) {
    assert(typeof screen.id === "string", "screen.id is required");
    assert(typeof screen.route === "string", "screen.route is required");
    assert(statuses.has(screen.status), `Invalid screen status: ${screen.status}`);
    assert(typeof screen.confidence === "number" && screen.confidence >= 0 && screen.confidence <= 1, "screen confidence must be between 0 and 1");
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
