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

export function stepDescription(step) {
  switch (step.action) {
    case "goto": return `Navigate to ${step.route}`;
    case "click": return "Click semantic target";
    case "fill": return `Fill semantic target with ${String(step.value ?? "").length} redacted characters`;
    case "press": return `Press ${step.key}`;
    case "viewport": return `Set viewport to ${step.width}x${step.height}`;
    case "expect-visible": return "Expect semantic target to be visible";
    case "expect-hidden": return "Expect semantic target to be hidden";
    case "expect-text": return `Expect text ${step.text}`;
    case "expect-url": return `Expect route ${step.route}`;
    case "checkpoint": return `Capture checkpoint ${step.name}`;
    case "audit": return "Run accessibility audit";
    default: return compactText(step.action);
  }
}

export function renderJourneyReport(result) {
  const rows = result.steps.map((step) =>
    `| ${step.index + 1} | ${compactText(step.action)} | ${compactText(step.status)} | ${step.durationMs} | ${compactText(step.error || "")} |`
  ).join("\n");
  const checkpoints = result.checkpoints.length
    ? result.checkpoints.map((checkpoint) =>
      `- ${compactText(checkpoint.name)}: ${compactText(checkpoint.route)} (${checkpoint.viewport.width}x${checkpoint.viewport.height}), accessibility ${checkpoint.accessibility.score.toFixed(2)}, ${checkpoint.screenshot}`
    ).join("\n")
    : "No checkpoints were captured.";
  return `# Reconstruct journey report\n\n- Journey: ${compactText(result.name)}\n- Result: ${result.passed ? "PASS" : "CORRECTION REQUIRED"}\n- Overall score: ${result.score.toFixed(2)} / 100\n- Step score: ${result.stepScore.toFixed(2)}\n- Accessibility score: ${result.accessibility.score.toFixed(2)}\n\n## Steps\n\n| # | Action | Status | ms | Error |\n|---:|---|---|---:|---|\n${rows}\n\n## Checkpoints\n\n${checkpoints}\n`;
}

export function renderJourneyCorrections(result) {
  const failures = result.steps.filter((step) => step.status === "failed");
  const failureLines = failures.length
    ? failures.map((step) => `- Step ${step.index + 1} (${compactText(step.action)}): ${compactText(step.error)}`).join("\n")
    : "- No failed steps.";
  const accessibilityLines = result.accessibility.findings.length
    ? result.accessibility.findings.slice(0, 40).map((finding) =>
      `- ${finding.severity.toUpperCase()} ${compactText(finding.category)}: ${compactText(finding.message)} (${finding.count})`
    ).join("\n")
    : "- No accessibility findings.";
  return `# Journey correction brief\n\nCorrect failed behavior without weakening passing assertions. Prefer semantic roles and accessible names.\n\n## Failed steps\n\n${failureLines}\n\n## Accessibility findings\n\n${accessibilityLines}\n`;
}
