import { extractPageData } from "./evaluate-browser.js";
import { auditAccessibility } from "./journey-a11y.js";
import { artifactName, routeOf } from "./journey-report.js";
import { assertJourneyLocation } from "./journey-runtime.js";

export function createJourneyArtifactWriter({ page, candidateOrigin, allowPrivateNetwork, timeoutMs, writeTracked }) {
  return async function captureCheckpoint(name, stepIndex) {
    const safeName = `${String(stepIndex + 1).padStart(3, "0")}-${artifactName(name)}`;
    const screenshotPath = `checkpoints/${safeName}.png`;
    const domPath = `checkpoints/${safeName}.json`;
    const screenshot = await page.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
      fullPage: false,
      mask: page.locator("input,textarea,select"),
      timeout: Math.min(timeoutMs, 10_000)
    });
    const dom = await extractPageData(page);
    const accessibility = await auditAccessibility(page);
    const current = await assertJourneyLocation(page, candidateOrigin, allowPrivateNetwork);
    await writeTracked(screenshotPath, screenshot);
    await writeTracked(domPath, `${JSON.stringify(dom, null, 2)}\n`);
    return {
      name,
      stepIndex,
      route: routeOf(current),
      viewport: page.viewportSize(),
      screenshot: screenshotPath,
      dom: domPath,
      accessibility
    };
  };
}

export function summarizeAccessibility(audits) {
  const score = audits.length
    ? audits.reduce((sum, audit) => sum + audit.score, 0) / audits.length
    : 100;
  return {
    score: Math.round(score * 100) / 100,
    findings: audits.flatMap((audit) =>
      audit.findings.map((finding) => ({ source: audit.source, ...finding }))
    ).slice(0, 500)
  };
}
