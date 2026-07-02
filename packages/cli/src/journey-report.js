export const JOURNEY_REPORT_VERSION = 1;

export function roundJourneyScore(value) {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

export function routeOf(value) {
  const url = new URL(value);
  return `${url.pathname}${url.search}`;
}

export function artifactName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "checkpoint";
}

export function compactText(value, max = 1000) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
