export const APP_SPEC_VERSION = "0.2.0";
export const APP_SPEC_LIMITS = Object.freeze({
  maxString: 10_000,
  maxName: 300,
  maxItems: 5_000,
  maxEvidence: 2_000,
  maxDepth: 40
});

const STATUSES = new Set(["observed", "inferred", "unknown"]);
const EVIDENCE_TYPES = new Set(["screenshot", "html", "dom", "interaction", "manual", "manifest"]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export class AppSpecValidationError extends Error {
  constructor(issues) {
    super(`Invalid AppSpec (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.name = "AppSpecValidationError";
    this.issues = issues;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isHttpUrl(value) {
  if (typeof value !== "string" || value.length > 4_096) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024) return false;
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment && segment !== "." && segment !== "..");
}

function walkForDangerousKeys(value, issues, path = "$", depth = 0, ancestors = new WeakSet()) {
  if (depth > APP_SPEC_LIMITS.maxDepth) {
    issues.push(`${path}: exceeds maximum object depth`);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (ancestors.has(value)) {
    issues.push(`${path}: cyclic object is not allowed`);
    return;
  }
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) issues.push(`${path}.${key}: prohibited key`);
    walkForDangerousKeys(value[key], issues, `${path}.${key}`, depth + 1, ancestors);
  }
  ancestors.delete(value);
}

function validateAllowedKeys(value, path, allowed, issues) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path}.${key}: unknown property`);
  }
}

function validateString(value, path, issues, { min = 1, max = APP_SPEC_LIMITS.maxString, pattern } = {}) {
  if (typeof value !== "string") {
    issues.push(`${path}: must be a string`);
    return;
  }
  if (value.length < min || value.length > max) issues.push(`${path}: length must be between ${min} and ${max}`);
  if (pattern && !pattern.test(value)) issues.push(`${path}: invalid format`);
}

function validateInteger(value, path, issues, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) issues.push(`${path}: must be an integer between ${min} and ${max}`);
}

function validateArray(value, path, issues, { max = APP_SPEC_LIMITS.maxItems } = {}) {
  if (!Array.isArray(value)) {
    issues.push(`${path}: must be an array`);
    return false;
  }
  if (value.length > max) issues.push(`${path}: exceeds maximum length ${max}`);
  return true;
}

function validateStringRecord(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push(`${path}: must be an object`);
    return;
  }
  if (Object.keys(value).length > APP_SPEC_LIMITS.maxItems) issues.push(`${path}: exceeds maximum property count`);
  for (const [key, item] of Object.entries(value)) {
    validateString(key, `${path} key`, issues, { max: 300 });
    validateString(item, `${path}.${key}`, issues, { min: 0, max: 2_000 });
  }
}

function validateAssessment(value, path, issues) {
  if (!isPlainObject(value)) {
    issues.push(`${path}: must be an object`);
    return;
  }
  validateAllowedKeys(value, path, new Set(["status", "confidence", "reason"]), issues);
  if (!STATUSES.has(value.status)) issues.push(`${path}.status: must be observed, inferred, or unknown`);
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    issues.push(`${path}.confidence: must be a finite number between 0 and 1`);
  }
  if (value.reason !== undefined) validateString(value.reason, `${path}.reason`, issues, { min: 0, max: 2_000 });
}

function validateEvidenceRef(value, path, issues, evidenceRegistry) {
  if (!isPlainObject(value)) {
    issues.push(`${path}: must be an object`);
    return;
  }
  validateAllowedKeys(value, path, new Set(["type", "path", "sha256", "bytes", "mediaType"]), issues);
  if (!EVIDENCE_TYPES.has(value.type)) issues.push(`${path}.type: unsupported evidence type`);
  if (!isSafeRelativePath(value.path)) issues.push(`${path}.path: must be a safe relative path`);
  if (typeof value.sha256 !== "string" || !SHA256_RE.test(value.sha256)) issues.push(`${path}.sha256: must be a lowercase SHA-256 digest`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0) issues.push(`${path}.bytes: must be a non-negative safe integer`);
  if (value.mediaType !== undefined) validateString(value.mediaType, `${path}.mediaType`, issues, { max: 200 });

  if (typeof value.path === "string" && typeof value.sha256 === "string" && Number.isSafeInteger(value.bytes)) {
    const signature = `${value.sha256}:${value.bytes}:${value.type}:${value.mediaType ?? ""}`;
    const previous = evidenceRegistry.get(value.path);
    if (previous && previous !== signature) issues.push(`${path}: conflicts with another reference to ${value.path}`);
    evidenceRegistry.set(value.path, signature);
  }
}

function validateUniqueIds(items, path, issues) {
  const seen = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const id = items[index]?.id;
    if (typeof id !== "string") continue;
    if (seen.has(id)) issues.push(`${path}[${index}].id: duplicate id ${id}`);
    seen.add(id);
  }
}

function validateScreen(screen, index, issues, evidenceRegistry) {
  const path = `$.screens[${index}]`;
  if (!isPlainObject(screen)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(screen, path, new Set(["id", "route", "title", "assessment", "components", "evidence"]), issues);
  validateString(screen.id, `${path}.id`, issues, { max: 128, pattern: ID_RE });
  validateString(screen.route, `${path}.route`, issues, { max: 2_048 });
  if (typeof screen.route === "string" && !screen.route.startsWith("/")) issues.push(`${path}.route: must start with /`);
  validateString(screen.title, `${path}.title`, issues, { min: 0, max: APP_SPEC_LIMITS.maxName });
  validateAssessment(screen.assessment, `${path}.assessment`, issues);
  if (validateArray(screen.components, `${path}.components`, issues)) {
    screen.components.forEach((id, childIndex) => validateString(id, `${path}.components[${childIndex}]`, issues, { max: 128, pattern: ID_RE }));
  }
  if (validateArray(screen.evidence, `${path}.evidence`, issues, { max: APP_SPEC_LIMITS.maxEvidence })) {
    screen.evidence.forEach((ref, childIndex) => validateEvidenceRef(ref, `${path}.evidence[${childIndex}]`, issues, evidenceRegistry));
  }
}

function validateComponent(component, index, issues, evidenceRegistry) {
  const path = `$.components[${index}]`;
  if (!isPlainObject(component)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(component, path, new Set(["id", "name", "type", "states", "assessment", "evidence"]), issues);
  validateString(component.id, `${path}.id`, issues, { max: 128, pattern: ID_RE });
  validateString(component.name, `${path}.name`, issues, { max: APP_SPEC_LIMITS.maxName });
  validateString(component.type, `${path}.type`, issues, { max: 100 });
  validateAssessment(component.assessment, `${path}.assessment`, issues);
  if (validateArray(component.states, `${path}.states`, issues)) {
    component.states.forEach((state, childIndex) => validateString(state, `${path}.states[${childIndex}]`, issues, { max: 100 }));
  }
  if (validateArray(component.evidence, `${path}.evidence`, issues, { max: APP_SPEC_LIMITS.maxEvidence })) {
    component.evidence.forEach((ref, childIndex) => validateEvidenceRef(ref, `${path}.evidence[${childIndex}]`, issues, evidenceRegistry));
  }
}

function validateFlow(flow, index, issues, evidenceRegistry) {
  const path = `$.flows[${index}]`;
  if (!isPlainObject(flow)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(flow, path, new Set(["id", "name", "steps", "assessment", "evidence"]), issues);
  validateString(flow.id, `${path}.id`, issues, { max: 128, pattern: ID_RE });
  validateString(flow.name, `${path}.name`, issues, { max: APP_SPEC_LIMITS.maxName });
  validateAssessment(flow.assessment, `${path}.assessment`, issues);
  if (validateArray(flow.steps, `${path}.steps`, issues)) {
    if (flow.steps.length === 0) issues.push(`${path}.steps: must contain at least one step`);
    flow.steps.forEach((step, childIndex) => validateString(step, `${path}.steps[${childIndex}]`, issues, { max: 1_000 }));
  }
  if (validateArray(flow.evidence, `${path}.evidence`, issues, { max: APP_SPEC_LIMITS.maxEvidence })) {
    flow.evidence.forEach((ref, childIndex) => validateEvidenceRef(ref, `${path}.evidence[${childIndex}]`, issues, evidenceRegistry));
  }
}

function validateAcceptanceTest(test, index, issues) {
  const path = `$.acceptanceTests[${index}]`;
  if (!isPlainObject(test)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(test, path, new Set(["id", "given", "when", "then"]), issues);
  validateString(test.id, `${path}.id`, issues, { max: 128, pattern: ID_RE });
  validateString(test.given, `${path}.given`, issues, { max: 2_000 });
  validateString(test.when, `${path}.when`, issues, { max: 2_000 });
  validateString(test.then, `${path}.then`, issues, { max: 2_000 });
}

function validateCapture(capture, issues) {
  const path = "$.capture";
  if (!isPlainObject(capture)) {
    issues.push(`${path}: must be an object`);
    return;
  }
  validateAllowedKeys(capture, path, new Set([
    "mode", "startedAt", "completedAt", "toolVersion", "viewport", "limits",
    "requestCount", "blockedRequestCount", "observedHosts", "truncated", "webSocketsBlocked", "screenshotMethod"
  ]), issues);
  if (capture.mode !== "public") issues.push(`${path}.mode: expected public`);
  if (!isIsoDate(capture.startedAt)) issues.push(`${path}.startedAt: must be a canonical ISO timestamp`);
  if (!isIsoDate(capture.completedAt)) issues.push(`${path}.completedAt: must be a canonical ISO timestamp`);
  if (isIsoDate(capture.startedAt) && isIsoDate(capture.completedAt) && Date.parse(capture.completedAt) < Date.parse(capture.startedAt)) {
    issues.push(`${path}.completedAt: must not precede startedAt`);
  }
  validateString(capture.toolVersion, `${path}.toolVersion`, issues, { max: 50 });

  if (!isPlainObject(capture.viewport)) {
    issues.push(`${path}.viewport: must be an object`);
  } else {
    validateAllowedKeys(capture.viewport, `${path}.viewport`, new Set(["width", "height"]), issues);
    validateInteger(capture.viewport.width, `${path}.viewport.width`, issues, { min: 320, max: 3_840 });
    validateInteger(capture.viewport.height, `${path}.viewport.height`, issues, { min: 320, max: 2_160 });
  }

  if (!isPlainObject(capture.limits)) {
    issues.push(`${path}.limits: must be an object`);
  } else {
    validateAllowedKeys(capture.limits, `${path}.limits`, new Set(["timeoutMs", "maxRequests", "maxHtmlBytes", "maxPageHeight"]), issues);
    if (capture.limits.timeoutMs !== undefined) validateInteger(capture.limits.timeoutMs, `${path}.limits.timeoutMs`, issues, { min: 1_000, max: 120_000 });
    if (capture.limits.maxRequests !== undefined) validateInteger(capture.limits.maxRequests, `${path}.limits.maxRequests`, issues, { min: 1, max: 5_000 });
    if (capture.limits.maxHtmlBytes !== undefined) validateInteger(capture.limits.maxHtmlBytes, `${path}.limits.maxHtmlBytes`, issues, { min: 10_000, max: 20_000_000 });
    if (capture.limits.maxPageHeight !== undefined) validateInteger(capture.limits.maxPageHeight, `${path}.limits.maxPageHeight`, issues, { min: 320, max: 50_000 });
  }

  validateInteger(capture.requestCount, `${path}.requestCount`, issues);
  if (capture.blockedRequestCount !== undefined) validateInteger(capture.blockedRequestCount, `${path}.blockedRequestCount`, issues);
  if (capture.observedHosts !== undefined && validateArray(capture.observedHosts, `${path}.observedHosts`, issues, { max: 5_000 })) {
    capture.observedHosts.forEach((host, index) => validateString(host, `${path}.observedHosts[${index}]`, issues, { max: 253 }));
  }
  if (typeof capture.truncated !== "boolean") issues.push(`${path}.truncated: must be boolean`);
  if (capture.webSocketsBlocked !== undefined && typeof capture.webSocketsBlocked !== "boolean") issues.push(`${path}.webSocketsBlocked: must be boolean`);
  if (capture.screenshotMethod !== undefined && !new Set(["playwright-clip", "playwright-viewport", "cdp"]).has(capture.screenshotMethod)) {
    issues.push(`${path}.screenshotMethod: unsupported screenshot method`);
  }
}

export function validateAppSpec(input) {
  const issues = [];
  const evidenceRegistry = new Map();
  walkForDangerousKeys(input, issues);
  if (!isPlainObject(input)) issues.push("$: must be a plain object");

  if (issues.length === 0) {
    validateAllowedKeys(input, "$", new Set([
      "version", "generatedAt", "app", "screens", "components", "flows", "designSystem",
      "assumptions", "unknowns", "acceptanceTests", "capture", "integrity"
    ]), issues);
    if (input.version !== APP_SPEC_VERSION) issues.push(`$.version: expected ${APP_SPEC_VERSION}`);
    if (!isIsoDate(input.generatedAt)) issues.push("$.generatedAt: must be a canonical ISO timestamp");

    if (!isPlainObject(input.app)) {
      issues.push("$.app: must be an object");
    } else {
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
    if (Array.isArray(input.screens)) {
      input.screens.forEach((screen, screenIndex) => {
        if (!Array.isArray(screen?.components)) return;
        screen.components.forEach((id, componentIndex) => {
          if (typeof id === "string" && !componentIds.has(id)) issues.push(`$.screens[${screenIndex}].components[${componentIndex}]: unknown component id ${id}`);
        });
      });
    }

    if (!isPlainObject(input.designSystem)) {
      issues.push("$.designSystem: must be an object");
    } else {
      validateAllowedKeys(input.designSystem, "$.designSystem", new Set(["colors", "typography", "spacing", "radii"]), issues);
      for (const key of ["colors", "typography", "spacing", "radii"]) validateStringRecord(input.designSystem[key], `$.designSystem.${key}`, issues);
    }

    for (const key of ["assumptions", "unknowns"]) {
      if (validateArray(input[key], `$.${key}`, issues)) {
        input[key].forEach((item, index) => validateString(item, `$.${key}[${index}]`, issues, { max: 2_000 }));
      }
    }

    if (validateArray(input.acceptanceTests, "$.acceptanceTests", issues)) {
      input.acceptanceTests.forEach((item, index) => validateAcceptanceTest(item, index, issues));
      validateUniqueIds(input.acceptanceTests, "$.acceptanceTests", issues);
    }

    validateCapture(input.capture, issues);

    if (!isPlainObject(input.integrity)) {
      issues.push("$.integrity: must be an object");
    } else {
      validateAllowedKeys(input.integrity, "$.integrity", new Set(["algorithm", "manifest"]), issues);
      if (input.integrity.algorithm !== "sha256") issues.push("$.integrity.algorithm: expected sha256");
      if (!isSafeRelativePath(input.integrity.manifest)) issues.push("$.integrity.manifest: must be a safe relative path");
    }
  }

  if (issues.length) throw new AppSpecValidationError(issues);
  return input;
}

export function safeValidateAppSpec(input) {
  try {
    return { success: true, data: validateAppSpec(input), issues: [] };
  } catch (error) {
    if (error instanceof AppSpecValidationError) return { success: false, data: null, issues: error.issues };
    throw error;
  }
}

export function createEmptyAppSpec({ name, sourceUrl, startedAt = new Date().toISOString(), toolVersion = APP_SPEC_VERSION }) {
  return {
    version: APP_SPEC_VERSION,
    generatedAt: startedAt,
    app: { name, sourceUrl },
    screens: [],
    components: [],
    flows: [],
    designSystem: { colors: {}, typography: {}, spacing: {}, radii: {} },
    assumptions: [],
    unknowns: [],
    acceptanceTests: [],
    capture: {
      mode: "public",
      startedAt,
      completedAt: startedAt,
      toolVersion,
      viewport: { width: 1440, height: 1000 },
      limits: {},
      requestCount: 0,
      truncated: false,
      webSocketsBlocked: true
    },
    integrity: {
      algorithm: "sha256",
      manifest: "evidence/manifest.json"
    }
  };
}

export function serializeAppSpec(spec) {
  validateAppSpec(spec);
  return `${JSON.stringify(spec, null, 2)}\n`;
}
