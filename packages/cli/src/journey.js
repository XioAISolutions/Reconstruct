import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { atomicWriteFile, createStagingDirectory, readJsonFile, sha256 } from "./fs.js";
import { assertAllowedUrl, createRequestGuard } from "./security.js";
import { createJourneyArtifactWriter, summarizeAccessibility } from "./journey-artifacts.js";
import { auditAccessibility } from "./journey-a11y.js";
import { compactText, renderJourneyCorrections, renderJourneyReport, roundJourneyScore, routeOf, stepDescription } from "./journey-report.js";
import { assertJourneyLocation, executeJourneyStep } from "./journey-runtime.js";
import { safeJourneyStep, validateJourney } from "./journey-schema.js";
import { RECONSTRUCT_VERSION } from "./version.js";

const DEFAULTS = Object.freeze({ timeoutMs: 10_000, maxRequests: 1_000, minScore: 90 });

function boundedInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

function boundedScore(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${name} must be between 0 and 100`);
  return value;
}

export async function runJourney(journeyFile, candidateBaseUrl, outDir, options = {}) {
  const journeyPath = resolve(journeyFile);
  const journeyBytes = await readFile(journeyPath);
  const journey = validateJourney(await readJsonFile(journeyPath, { maxBytes: 1_000_000 }));
  const allowPrivateNetwork = options.allowPrivateNetwork === true;
  const timeoutMs = boundedInteger(options.timeoutMs ?? DEFAULTS.timeoutMs, "timeout", 1_000, 120_000);
  const maxRequests = boundedInteger(options.maxRequests ?? DEFAULTS.maxRequests, "max requests", 1, 20_000);
  const minimumScore = boundedScore(options.minScore ?? DEFAULTS.minScore, "minimum score");
  const candidateInput = await assertAllowedUrl(candidateBaseUrl, { allowPrivateNetwork });
  const candidateBase = new URL("/", candidateInput);
  const transaction = await createStagingDirectory(outDir);
  const tracked = [];
  let browser;
  let context;

  const writeTracked = async (relativePath, data) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    await atomicWriteFile(join(transaction.staging, relativePath), buffer);
    tracked.push({ path: relativePath, sha256: sha256(buffer), bytes: buffer.length });
  };

  try {
    const launchOptions = { headless: true, chromiumSandbox: true };
    const executablePath = options.executablePath ?? process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH;
    if (executablePath) launchOptions.executablePath = executablePath;
    browser = await chromium.launch(launchOptions);
    context = await browser.newContext({
      viewport: journey.viewport,
      acceptDownloads: false,
      serviceWorkers: "block",
      bypassCSP: false,
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
      locale: "en-US",
      timezoneId: "UTC",
      userAgent: `Reconstruct-Journey/${RECONSTRUCT_VERSION} (+https://github.com/XioAISolutions/Reconstruct)`
    });
    const guard = createRequestGuard({ allowPrivateNetwork, maxRequests });
    await context.route("**/*", (route) => guard.handle(route));
    await context.routeWebSocket("**/*", (webSocket) => webSocket.close({ code: 1008, reason: "Disabled by journey policy" }));
    const page = await context.newPage();
    context.on("page", (popup) => { if (popup !== page) popup.close().catch(() => {}); });
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));

    await page.goto(new URL(journey.startRoute, candidateBase).toString(), { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await assertJourneyLocation(page, candidateBase.origin, allowPrivateNetwork);

    const steps = [];
    const checkpoints = [];
    const audits = [];
    const capture = createJourneyArtifactWriter({
      page,
      candidateOrigin: candidateBase.origin,
      allowPrivateNetwork,
      timeoutMs,
      writeTracked
    });
    const captureCheckpoint = async (name, stepIndex) => {
      const checkpoint = await capture(name, stepIndex);
      checkpoints.push(checkpoint);
      audits.push({ source: `checkpoint:${name}`, ...checkpoint.accessibility });
      return checkpoint;
    };
    const audit = async () => {
      const result = await auditAccessibility(page);
      audits.push({ source: `step:${steps.length + 1}`, ...result });
      return result;
    };

    let stop = false;
    for (let index = 0; index < journey.steps.length; index += 1) {
      const step = journey.steps[index];
      if (stop) {
        steps.push({
          index,
          action: step.action,
          step: safeJourneyStep(step),
          status: "skipped",
          durationMs: 0,
          description: stepDescription(step),
          error: "Skipped after an earlier failure"
        });
        continue;
      }
      const started = Date.now();
      try {
        const current = await executeJourneyStep(page, step, {
          timeoutMs,
          candidateBase,
          allowPrivateNetwork,
          minimumAccessibilityScore: journey.minimumAccessibilityScore,
          captureCheckpoint,
          audit,
          stepIndex: index
        });
        steps.push({
          index,
          action: step.action,
          step: safeJourneyStep(step),
          status: "passed",
          durationMs: Date.now() - started,
          description: stepDescription(step),
          route: routeOf(current)
        });
      } catch (error) {
        steps.push({
          index,
          action: step.action,
          step: safeJourneyStep(step),
          status: "failed",
          durationMs: Date.now() - started,
          description: stepDescription(step),
          error: compactText(error instanceof Error ? error.message : String(error)),
          route: (() => { try { return routeOf(page.url()); } catch { return null; } })()
        });
        await captureCheckpoint(`failure-${index + 1}`, index).catch(() => {});
        if (!journey.continueOnFailure) stop = true;
      }
    }

    const finalAudit = await auditAccessibility(page);
    audits.push({ source: "final", ...finalAudit });
    const accessibility = summarizeAccessibility(audits);
    const passedSteps = steps.filter((step) => step.status === "passed").length;
    const failedSteps = steps.filter((step) => step.status === "failed").length;
    const skippedSteps = steps.filter((step) => step.status === "skipped").length;
    const stepScore = roundJourneyScore((passedSteps / Math.max(1, steps.length)) * 100);
    const score = roundJourneyScore(stepScore * 0.8 + accessibility.score * 0.2);
    const guardState = guard.snapshot();
    const result = {
      version: 1,
      toolVersion: RECONSTRUCT_VERSION,
      generatedAt: new Date().toISOString(),
      name: journey.name,
      candidateBaseUrl: candidateBase.toString(),
      minimumScore,
      minimumAccessibilityScore: journey.minimumAccessibilityScore,
      score,
      stepScore,
      accessibility,
      passed: failedSteps === 0 && skippedSteps === 0 && score >= minimumScore && accessibility.score >= journey.minimumAccessibilityScore,
      stats: {
        totalSteps: steps.length,
        passedSteps,
        failedSteps,
        skippedSteps,
        checkpoints: checkpoints.length,
        requestCount: guardState.requestCount,
        blockedRequestCount: guardState.blockedCount,
        truncated: guardState.truncated,
        observedHosts: guardState.hosts
      },
      steps,
      checkpoints
    };

    await writeTracked("journey.json", `${JSON.stringify(result, null, 2)}\n`);
    await writeTracked("accessibility.json", `${JSON.stringify({ audits }, null, 2)}\n`);
    await writeTracked("JOURNEY_REPORT.md", renderJourneyReport(result));
    await writeTracked("JOURNEY_CORRECTIONS.md", renderJourneyCorrections(result));
    const manifest = {
      version: 1,
      algorithm: "sha256",
      createdAt: result.generatedAt,
      scenarioSha256: sha256(journeyBytes),
      candidateBaseUrl: result.candidateBaseUrl,
      entries: [...tracked].sort((a, b) => a.path.localeCompare(b.path))
    };
    await atomicWriteFile(join(transaction.staging, "JOURNEY_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    await context.close();
    context = null;
    await browser.close();
    browser = null;
    await transaction.commit();
    return result;
  } catch (error) {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await transaction.rollback();
    throw error;
  }
}
