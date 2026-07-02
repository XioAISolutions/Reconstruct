export const APP_SPEC_VERSION = "0.3.0";
export const APP_SPEC_LIMITS = Object.freeze({
  maxString: 10_000,
  maxName: 300,
  maxItems: 5_000,
  maxEvidence: 5_000,
  maxDepth: 40
});

const STATUSES = new Set(["observed", "inferred", "unknown"]);
const EVIDENCE_TYPES = new Set(["screenshot", "html", "dom", "interaction", "map", "manual", "manifest"]);
export const SCREENSHOT_METHODS = new Set(["playwright-clip", "playwright-viewport", "cdp"]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SHA256_RE = /^[a-f0-9]{64}$/;
export const ID_RE = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export class AppSpecValidationError extends Error {
  constructor(issues) {
    super(`Invalid AppSpec (${issues.length} issue${issues.length === 1 ? "" : "s"})`);
    this.name = "AppSpecValidationError";
    this.issues = issues;
  }
}

export function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isHttpUrl(value) {
  if (typeof value !== "string" || value.length > 4_096) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024) return false;
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
  return value.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

export function walkForDangerousKeys(value, issues, path = "$", depth = 0, ancestors = new WeakSet()) {
  if (depth > APP_SPEC_LIMITS.maxDepth) return issues.push(`${path}: exceeds maximum object depth`);
  if (!value || typeof value !== "object") return;
  if (ancestors.has(value)) return issues.push(`${path}: cyclic object is not allowed`);
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) issues.push(`${path}.${key}: prohibited key`);
    walkForDangerousKeys(value[key], issues, `${path}.${key}`, depth + 1, ancestors);
  }
  ancestors.delete(value);
}

export function validateAllowedKeys(value, path, allowed, issues) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(`${path}.${key}: unknown property`);
}

export function validateString(value, path, issues, { min = 1, max = APP_SPEC_LIMITS.maxString, pattern } = {}) {
  if (typeof value !== "string") return issues.push(`${path}: must be a string`);
  if (value.length < min || value.length > max) issues.push(`${path}: length must be between ${min} and ${max}`);
  if (pattern && !pattern.test(value)) issues.push(`${path}: invalid format`);
}

export function validateInteger(value, path, issues, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) issues.push(`${path}: must be an integer between ${min} and ${max}`);
}

export function validateArray(value, path, issues, { min = 0, max = APP_SPEC_LIMITS.maxItems } = {}) {
  if (!Array.isArray(value)) {
    issues.push(`${path}: must be an array`);
    return false;
  }
  if (value.length < min || value.length > max) issues.push(`${path}: length must be between ${min} and ${max}`);
  return true;
}

export function validateStringRecord(value, path, issues) {
  if (!isPlainObject(value)) return issues.push(`${path}: must be an object`);
  if (Object.keys(value).length > APP_SPEC_LIMITS.maxItems) issues.push(`${path}: exceeds maximum property count`);
  for (const [key, item] of Object.entries(value)) {
    validateString(key, `${path} key`, issues, { max: 300 });
    validateString(item, `${path}.${key}`, issues, { min: 0, max: 2_000 });
  }
}

export function validateAssessment(value, path, issues) {
  if (!isPlainObject(value)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(value, path, new Set(["status", "confidence", "reason"]), issues);
  if (!STATUSES.has(value.status)) issues.push(`${path}.status: must be observed, inferred, or unknown`);
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    issues.push(`${path}.confidence: must be a finite number between 0 and 1`);
  }
  if (value.reason !== undefined) validateString(value.reason, `${path}.reason`, issues, { min: 0, max: 2_000 });
}

export function validateEvidenceRef(value, path, issues, evidenceRegistry) {
  if (!isPlainObject(value)) return issues.push(`${path}: must be an object`);
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

export function validateUniqueIds(items, path, issues) {
  const seen = new Set();
  items.forEach((item, index) => {
    const id = item?.id;
    if (typeof id !== "string") return;
    if (seen.has(id)) issues.push(`${path}[${index}].id: duplicate id ${id}`);
    seen.add(id);
  });
}
