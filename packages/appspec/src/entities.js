import { APP_SPEC_LIMITS, ID_RE, isHttpUrl, isPlainObject, validateAllowedKeys, validateArray, validateAssessment, validateEvidenceRef, validateInteger, validateString } from "./core.js";

export function validateScreen(screen, index, issues, evidenceRegistry) {
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

export function validateComponent(component, index, issues, evidenceRegistry) {
  const path = `$.components[${index}]`;
  if (!isPlainObject(component)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(component, path, new Set(["id", "name", "type", "states", "assessment", "evidence"]), issues);
  validateString(component.id, `${path}.id`, issues, { max: 128, pattern: ID_RE });
  validateString(component.name, `${path}.name`, issues, { max: APP_SPEC_LIMITS.maxName });
  validateString(component.type, `${path}.type`, issues, { max: 100 });
  validateAssessment(component.assessment, `${path}.assessment`, issues);
  if (validateArray(component.states, `${path}.states`, issues)) component.states.forEach((state, childIndex) => validateString(state, `${path}.states[${childIndex}]`, issues, { max: 100 }));
  if (validateArray(component.evidence, `${path}.evidence`, issues, { max: APP_SPEC_LIMITS.maxEvidence })) component.evidence.forEach((ref, childIndex) => validateEvidenceRef(ref, `${path}.evidence[${childIndex}]`, issues, evidenceRegistry));
}

export function validateFlow(flow, index, issues, evidenceRegistry) {
  const path = `$.flows[${index}]`;
  if (!isPlainObject(flow)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(flow, path, new Set(["id", "name", "steps", "assessment", "evidence", "sourceScreenId", "targetScreenId", "trigger"]), issues);
  validateString(flow.id, `${path}.id`, issues, { max: 128, pattern: ID_RE });
  validateString(flow.name, `${path}.name`, issues, { max: APP_SPEC_LIMITS.maxName });
  validateAssessment(flow.assessment, `${path}.assessment`, issues);
  if (validateArray(flow.steps, `${path}.steps`, issues, { min: 1 })) flow.steps.forEach((step, childIndex) => validateString(step, `${path}.steps[${childIndex}]`, issues, { max: 1_000 }));
  if (validateArray(flow.evidence, `${path}.evidence`, issues, { max: APP_SPEC_LIMITS.maxEvidence })) flow.evidence.forEach((ref, childIndex) => validateEvidenceRef(ref, `${path}.evidence[${childIndex}]`, issues, evidenceRegistry));
  if (flow.sourceScreenId !== undefined) validateString(flow.sourceScreenId, `${path}.sourceScreenId`, issues, { max: 128, pattern: ID_RE });
  if (flow.targetScreenId !== undefined) validateString(flow.targetScreenId, `${path}.targetScreenId`, issues, { max: 128, pattern: ID_RE });
  if (flow.trigger !== undefined) validateString(flow.trigger, `${path}.trigger`, issues, { min: 0, max: 500 });
}

export function validateAcceptanceTest(test, index, issues) {
  const path = `$.acceptanceTests[${index}]`;
  if (!isPlainObject(test)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(test, path, new Set(["id", "given", "when", "then"]), issues);
  validateString(test.id, `${path}.id`, issues, { max: 128, pattern: ID_RE });
  validateString(test.given, `${path}.given`, issues, { max: 2_000 });
  validateString(test.when, `${path}.when`, issues, { max: 2_000 });
  validateString(test.then, `${path}.then`, issues, { max: 2_000 });
}

export function validateFailedPage(page, index, issues) {
  const path = `$.capture.failedPages[${index}]`;
  if (!isPlainObject(page)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(page, path, new Set(["url", "depth", "reason"]), issues);
  if (!isHttpUrl(page.url)) issues.push(`${path}.url: must be an http(s) URL without credentials`);
  validateInteger(page.depth, `${path}.depth`, issues, { min: 0, max: 20 });
  validateString(page.reason, `${path}.reason`, issues, { max: 1_000 });
}
