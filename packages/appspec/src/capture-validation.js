import { SCREENSHOT_METHODS, isIsoDate, isPlainObject, validateAllowedKeys, validateArray, validateInteger, validateString } from "./core.js";
import { validateFailedPage } from "./entities.js";

export function validateCapture(capture, issues) {
  const path = "$.capture";
  if (!isPlainObject(capture)) return issues.push(`${path}: must be an object`);
  validateAllowedKeys(capture, path, new Set([
    "mode", "startedAt", "completedAt", "toolVersion", "viewport", "limits",
    "requestCount", "blockedRequestCount", "observedHosts", "truncated", "webSocketsBlocked",
    "screenshotMethod", "screenshotMethods", "pageCount", "failedPageCount", "failedPages"
  ]), issues);
  if (capture.mode !== "public") issues.push(`${path}.mode: expected public`);
  if (!isIsoDate(capture.startedAt)) issues.push(`${path}.startedAt: must be a canonical ISO timestamp`);
  if (!isIsoDate(capture.completedAt)) issues.push(`${path}.completedAt: must be a canonical ISO timestamp`);
  if (isIsoDate(capture.startedAt) && isIsoDate(capture.completedAt) && Date.parse(capture.completedAt) < Date.parse(capture.startedAt)) issues.push(`${path}.completedAt: must not precede startedAt`);
  validateString(capture.toolVersion, `${path}.toolVersion`, issues, { max: 50 });

  if (!isPlainObject(capture.viewport)) issues.push(`${path}.viewport: must be an object`);
  else {
    validateAllowedKeys(capture.viewport, `${path}.viewport`, new Set(["width", "height"]), issues);
    validateInteger(capture.viewport.width, `${path}.viewport.width`, issues, { min: 320, max: 3_840 });
    validateInteger(capture.viewport.height, `${path}.viewport.height`, issues, { min: 320, max: 2_160 });
  }

  if (!isPlainObject(capture.limits)) issues.push(`${path}.limits: must be an object`);
  else {
    validateAllowedKeys(capture.limits, `${path}.limits`, new Set(["timeoutMs", "maxRequests", "maxHtmlBytes", "maxPageHeight", "maxPages", "maxDepth", "crawlDelayMs", "includeQuery"]), issues);
    if (capture.limits.timeoutMs !== undefined) validateInteger(capture.limits.timeoutMs, `${path}.limits.timeoutMs`, issues, { min: 1_000, max: 120_000 });
    if (capture.limits.maxRequests !== undefined) validateInteger(capture.limits.maxRequests, `${path}.limits.maxRequests`, issues, { min: 1, max: 20_000 });
    if (capture.limits.maxHtmlBytes !== undefined) validateInteger(capture.limits.maxHtmlBytes, `${path}.limits.maxHtmlBytes`, issues, { min: 10_000, max: 20_000_000 });
    if (capture.limits.maxPageHeight !== undefined) validateInteger(capture.limits.maxPageHeight, `${path}.limits.maxPageHeight`, issues, { min: 320, max: 50_000 });
    if (capture.limits.maxPages !== undefined) validateInteger(capture.limits.maxPages, `${path}.limits.maxPages`, issues, { min: 1, max: 500 });
    if (capture.limits.maxDepth !== undefined) validateInteger(capture.limits.maxDepth, `${path}.limits.maxDepth`, issues, { min: 0, max: 20 });
    if (capture.limits.crawlDelayMs !== undefined) validateInteger(capture.limits.crawlDelayMs, `${path}.limits.crawlDelayMs`, issues, { min: 0, max: 60_000 });
    if (capture.limits.includeQuery !== undefined && typeof capture.limits.includeQuery !== "boolean") issues.push(`${path}.limits.includeQuery: must be boolean`);
  }

  validateInteger(capture.requestCount, `${path}.requestCount`, issues);
  if (capture.blockedRequestCount !== undefined) validateInteger(capture.blockedRequestCount, `${path}.blockedRequestCount`, issues);
  if (capture.observedHosts !== undefined && validateArray(capture.observedHosts, `${path}.observedHosts`, issues, { max: 5_000 })) capture.observedHosts.forEach((host, index) => validateString(host, `${path}.observedHosts[${index}]`, issues, { max: 253 }));
  if (typeof capture.truncated !== "boolean") issues.push(`${path}.truncated: must be boolean`);
  if (capture.webSocketsBlocked !== undefined && typeof capture.webSocketsBlocked !== "boolean") issues.push(`${path}.webSocketsBlocked: must be boolean`);
  if (capture.screenshotMethod !== undefined && !SCREENSHOT_METHODS.has(capture.screenshotMethod)) issues.push(`${path}.screenshotMethod: unsupported screenshot method`);
  if (capture.screenshotMethods !== undefined && validateArray(capture.screenshotMethods, `${path}.screenshotMethods`, issues, { max: 3 })) {
    capture.screenshotMethods.forEach((method, index) => { if (!SCREENSHOT_METHODS.has(method)) issues.push(`${path}.screenshotMethods[${index}]: unsupported screenshot method`); });
  }
  if (capture.pageCount !== undefined) validateInteger(capture.pageCount, `${path}.pageCount`, issues, { min: 0, max: 500 });
  if (capture.failedPageCount !== undefined) validateInteger(capture.failedPageCount, `${path}.failedPageCount`, issues, { min: 0, max: 500 });
  if (capture.failedPages !== undefined && validateArray(capture.failedPages, `${path}.failedPages`, issues, { max: 500 })) capture.failedPages.forEach((page, index) => validateFailedPage(page, index, issues));
  if (Number.isSafeInteger(capture.pageCount) && Number.isSafeInteger(capture.failedPageCount) && capture.failedPages?.length !== capture.failedPageCount) issues.push(`${path}.failedPageCount: must match failedPages length`);
}
