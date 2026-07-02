import { APP_SPEC_LIMITS, APP_SPEC_VERSION, AppSpecValidationError, isHttpUrl, isIsoDate, isPlainObject, isSafeRelativePath, validateAllowedKeys, validateArray, validateString, validateStringRecord, validateUniqueIds, walkForDangerousKeys } from "./core.js";
import { validateAcceptanceTest, validateComponent, validateFlow, validateScreen } from "./entities.js";
import { validateCapture } from "./capture-validation.js";

export { APP_SPEC_LIMITS, APP_SPEC_VERSION, AppSpecValidationError, isSafeRelativePath } from "./core.js";

export function validateAppSpec(input) {
  const issues = [];
  const evidenceRegistry = new Map();
  walkForDangerousKeys(input, issues);
  if (!isPlainObject(input)) issues.push("$: must be a plain object");
  if (issues.length === 0) {
    validateAllowedKeys(input, "$", new Set(["version", "generatedAt", "app", "screens", "components", "flows", "designSystem", "assumptions", "unknowns", "acceptanceTests", "capture", "integrity"]), issues);
    if (input.version !== APP_SPEC_VERSION) issues.push(`$.version: expected ${APP_SPEC_VERSION}`);
    if (!isIsoDate(input.generatedAt)) issues.push("$.generatedAt: must be a canonical ISO timestamp");
    if (!isPlainObject(input.app)) issues.push("$.app: must be an object");
    else {
      validateAllowedKeys(input.app, "$.app", new Set(["name", "sourceUrl", "description"]), issues);
      validateString(input.app.name, "$.app.name", issues, { max: APP_SPEC_LIMITS.maxName });
      if (!isHttpUrl(input.app.sourceUrl)) issues.push("$.app.sourceUrl: must be an http(s) URL without credentials");
      if (input.app.description !== undefined) validateString(input.app.description, "$.app.description", issues, { min: 0, max: 2_000 });
    }

    if (validateArray(input.screens, "$.screens", issues)) {
      input.screens.forEach((item, index) => validateScreen(item, index, issues, evidenceRegistry));
      validateUniqueIds(input.screens, "$.screens", issues);
    }
    if (validateArray(input.components, "$.components", issues)) {
      input.components.forEach((item, index) => validateComponent(item, index, issues, evidenceRegistry));
      validateUniqueIds(input.components, "$.components", issues);
    }
    if (validateArray(input.flows, "$.flows", issues)) {
      input.flows.forEach((item, index) => validateFlow(item, index, issues, evidenceRegistry));
      validateUniqueIds(input.flows, "$.flows", issues);
    }

    const componentIds = new Set(Array.isArray(input.components) ? input.components.map((item) => item?.id).filter((id) => typeof id === "string") : []);
    const screenIds = new Set(Array.isArray(input.screens) ? input.screens.map((item) => item?.id).filter((id) => typeof id === "string") : []);
    if (Array.isArray(input.screens)) input.screens.forEach((screen, screenIndex) => screen?.components?.forEach((id, componentIndex) => { if (typeof id === "string" && !componentIds.has(id)) issues.push(`$.screens[${screenIndex}].components[${componentIndex}]: unknown component id ${id}`); }));
    if (Array.isArray(input.flows)) input.flows.forEach((flow, flowIndex) => {
      if (typeof flow?.sourceScreenId === "string" && !screenIds.has(flow.sourceScreenId)) issues.push(`$.flows[${flowIndex}].sourceScreenId: unknown screen id ${flow.sourceScreenId}`);
      if (typeof flow?.targetScreenId === "string" && !screenIds.has(flow.targetScreenId)) issues.push(`$.flows[${flowIndex}].targetScreenId: unknown screen id ${flow.targetScreenId}`);
    });

    if (!isPlainObject(input.designSystem)) issues.push("$.designSystem: must be an object");
    else {
      validateAllowedKeys(input.designSystem, "$.designSystem", new Set(["colors", "typography", "spacing", "radii"]), issues);
      for (const key of ["colors", "typography", "spacing", "radii"]) validateStringRecord(input.designSystem[key], `$.designSystem.${key}`, issues);
    }
    for (const key of ["assumptions", "unknowns"]) if (validateArray(input[key], `$.${key}`, issues)) input[key].forEach((item, index) => validateString(item, `$.${key}[${index}]`, issues, { max: 2_000 }));
    if (validateArray(input.acceptanceTests, "$.acceptanceTests", issues)) {
      input.acceptanceTests.forEach((item, index) => validateAcceptanceTest(item, index, issues));
      validateUniqueIds(input.acceptanceTests, "$.acceptanceTests", issues);
    }
    validateCapture(input.capture, issues);
    if (!isPlainObject(input.integrity)) issues.push("$.integrity: must be an object");
    else {
      validateAllowedKeys(input.integrity, "$.integrity", new Set(["algorithm", "manifest"]), issues);
      if (input.integrity.algorithm !== "sha256") issues.push("$.integrity.algorithm: expected sha256");
      if (!isSafeRelativePath(input.integrity.manifest)) issues.push("$.integrity.manifest: must be a safe relative path");
    }
  }
  if (issues.length) throw new AppSpecValidationError(issues);
  return input;
}

export function safeValidateAppSpec(input) {
  try { return { success: true, data: validateAppSpec(input), issues: [] }; }
  catch (error) {
    if (error instanceof AppSpecValidationError) return { success: false, data: null, issues: error.issues };
    throw error;
  }
}

export function createEmptyAppSpec({ name, sourceUrl, startedAt = new Date().toISOString(), toolVersion = APP_SPEC_VERSION }) {
  return {
    version: APP_SPEC_VERSION,
    generatedAt: startedAt,
    app: { name, sourceUrl },
    screens: [], components: [], flows: [],
    designSystem: { colors: {}, typography: {}, spacing: {}, radii: {} },
    assumptions: [], unknowns: [], acceptanceTests: [],
    capture: {
      mode: "public", startedAt, completedAt: startedAt, toolVersion,
      viewport: { width: 1440, height: 1000 }, limits: {}, requestCount: 0,
      truncated: false, webSocketsBlocked: true, pageCount: 0, failedPageCount: 0, failedPages: []
    },
    integrity: { algorithm: "sha256", manifest: "evidence/manifest.json" }
  };
}

export function serializeAppSpec(spec) {
  validateAppSpec(spec);
  return `${JSON.stringify(spec, null, 2)}\n`;
}
