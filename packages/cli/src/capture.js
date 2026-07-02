import { join } from "node:path";
import { chromium } from "playwright";
import { APP_SPEC_VERSION, createEmptyAppSpec, serializeAppSpec } from "@reconstruct/appspec";
import { atomicWriteFile, createStagingDirectory, evidenceRecord } from "./fs.js";
import { assertAllowedUrl, createRequestGuard } from "./security.js";
import { componentIdentity, discoverCrawlTargets, canonicalizeCrawlUrl, sleep } from "./crawl.js";
import { cleanText, finiteInteger, uniqueByPath } from "./capture-utils.js";
import { captureOnePage } from "./capture-page.js";

const DEFAULT_LIMITS = Object.freeze({
  timeoutMs: 30_000,
  maxRequests: 300,
  maxHtmlBytes: 2_000_000,
  maxPageHeight: 12_000,
  maxPages: 1,
  maxDepth: 0,
  crawlDelayMs: 0
});

function mergeDesignTokens(designSystem, tokens) {
  const variables = tokens.cssVariables ?? {};
  for (const [name, value] of Object.entries(variables)) {
    if (!value) continue;
    if (/(color|background|foreground|accent|primary|secondary|border)/i.test(name) || /^(#|rgb|hsl|oklch|lab)/i.test(value)) designSystem.colors[name] ??= value;
    else if (/(radius|rounded)/i.test(name)) designSystem.radii[name] ??= value;
    else if (/(space|gap|padding|margin)/i.test(name)) designSystem.spacing[name] ??= value;
    else if (/(font|type|text|line-height)/i.test(name)) designSystem.typography[name] ??= value;
  }
  if (tokens.bodyColor) designSystem.colors.bodyText ??= tokens.bodyColor;
  if (tokens.bodyBackgroundColor) designSystem.colors.bodyBackground ??= tokens.bodyBackgroundColor;
  if (tokens.bodyFontFamily) designSystem.typography.bodyFontFamily ??= tokens.bodyFontFamily;
  if (tokens.bodyFontSize) designSystem.typography.bodyFontSize ??= tokens.bodyFontSize;
}

function flowId(sourceScreenId, targetScreenId, trigger, index) {
  const triggerSlug = cleanText(trigger, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "link";
  return `flow-${sourceScreenId.replace(/^screen-/, "")}-${targetScreenId.replace(/^screen-/, "")}-${triggerSlug}-${index + 1}`.slice(0, 128);
}

export async function capturePublicApp(url, outDir, options = {}) {
  const viewport = {
    width: finiteInteger(options.viewport?.width ?? 1440, "viewport width", 320, 3840),
    height: finiteInteger(options.viewport?.height ?? 1000, "viewport height", 320, 2160)
  };
  const timeoutMs = finiteInteger(options.timeoutMs ?? DEFAULT_LIMITS.timeoutMs, "timeout", 1_000, 120_000);
  const maxRequests = finiteInteger(options.maxRequests ?? DEFAULT_LIMITS.maxRequests, "max requests", 1, 20_000);
  const maxHtmlBytes = finiteInteger(options.maxHtmlBytes ?? DEFAULT_LIMITS.maxHtmlBytes, "max HTML bytes", 10_000, 20_000_000);
  const maxPageHeight = finiteInteger(options.maxPageHeight ?? DEFAULT_LIMITS.maxPageHeight, "max page height", viewport.height, 50_000);
  const maxPages = finiteInteger(options.maxPages ?? DEFAULT_LIMITS.maxPages, "max pages", 1, 500);
  const maxDepth = finiteInteger(options.maxDepth ?? DEFAULT_LIMITS.maxDepth, "max depth", 0, 20);
  const crawlDelayMs = finiteInteger(options.crawlDelayMs ?? DEFAULT_LIMITS.crawlDelayMs, "crawl delay", 0, 60_000);
  const allowPrivateNetwork = options.allowPrivateNetwork === true;
  const saveHtml = options.saveHtml !== false;
  const includeQuery = options.includeQuery === true;

  const initialUrl = await assertAllowedUrl(url, { allowPrivateNetwork });
  const transaction = await createStagingDirectory(outDir);
  const startedAt = new Date().toISOString();
  let browser;
  let context;

  try {
    const launchOptions = { headless: true, chromiumSandbox: true };
    const executablePath = options.executablePath ?? process.env.RECONSTRUCT_CHROMIUM_EXECUTABLE_PATH;
    if (executablePath) launchOptions.executablePath = executablePath;
    browser = await chromium.launch(launchOptions);
    context = await browser.newContext({
      viewport,
      acceptDownloads: false,
      serviceWorkers: "block",
      bypassCSP: false,
      ignoreHTTPSErrors: false,
      javaScriptEnabled: true,
      locale: "en-US",
      timezoneId: "UTC",
      userAgent: `Reconstruct/${APP_SPEC_VERSION} (+https://github.com/XioAISolutions/Reconstruct)`
    });

    const guard = createRequestGuard({ allowPrivateNetwork, maxRequests });
    await context.route("**/*", (route) => guard.handle(route));
    await context.routeWebSocket("**/*", (webSocket) => webSocket.close({ code: 1008, reason: "Disabled by Reconstruct capture policy" }));
    const page = await context.newPage();
    context.on("page", (popup) => { if (popup !== page) popup.close().catch(() => {}); });
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));

    const queue = [{ url: initialUrl.toString(), depth: 0, discoveredFrom: null }];
    const seen = new Set();
    const results = [];
    const failures = [];
    const edges = [];
    let crawlOrigin = null;

    while (queue.length && results.length < maxPages) {
      const item = queue.shift();
      const requested = canonicalizeCrawlUrl(item.url, { origin: crawlOrigin ?? undefined, includeQuery }) ?? new URL(item.url);
      const requestedKey = requested.toString();
      if (seen.has(requestedKey)) continue;
      seen.add(requestedKey);

      try {
        const result = await captureOnePage({
          page,
          context,
          targetUrl: requestedKey,
          staging: transaction.staging,
          viewport,
          timeoutMs,
          maxHtmlBytes,
          maxPageHeight,
          saveHtml,
          allowPrivateNetwork,
          includeQuery
        });
        crawlOrigin ??= result.finalUrl.origin;
        if (result.finalUrl.origin !== crawlOrigin) throw new Error(`Redirected outside crawl origin: ${result.finalUrl.origin}`);
        seen.add(result.canonical.toString());
        result.depth = item.depth;
        results.push(result);

        const targets = discoverCrawlTargets(result.dom.links, result.finalUrl, { origin: crawlOrigin, includeQuery });
        for (const target of targets) {
          edges.push({ from: result.canonical.toString(), to: target.url, text: target.text, visible: target.visible });
          if (item.depth < maxDepth && !seen.has(target.url) && !queue.some((queued) => queued.url === target.url)) {
            queue.push({ url: target.url, depth: item.depth + 1, discoveredFrom: result.canonical.toString() });
          }
        }
      } catch (error) {
        if (results.length === 0) throw error;
        failures.push({ url: requestedKey, depth: item.depth, reason: cleanText(error instanceof Error ? error.message : String(error), 1_000) });
      }

      if (queue.length && crawlDelayMs) await sleep(crawlDelayMs);
    }

    const completedAt = new Date().toISOString();
    const spec = createEmptyAppSpec({ name: results[0].title, sourceUrl: results[0].finalUrl.toString(), startedAt, toolVersion: APP_SPEC_VERSION });
    const screenByUrl = new Map();
    const components = new Map();
    const screenshotMethods = new Set();
    const allEvidence = [];
    let anyPageTruncated = false;

    for (const result of results) {
      const screenId = `screen-${result.artifactName}`;
      screenByUrl.set(result.canonical.toString(), screenId);
      screenshotMethods.add(result.screenshotMethod);
      anyPageTruncated ||= result.truncated;
      const componentIds = [];
      for (const landmark of result.dom.landmarks) {
        const identity = componentIdentity(landmark);
        componentIds.push(identity.id);
        const existing = components.get(identity.key);
        if (existing) existing.evidence = uniqueByPath([...existing.evidence, result.evidence[0]]);
        else components.set(identity.key, {
          id: identity.id,
          name: identity.name,
          type: landmark.tag,
          states: ["default"],
          assessment: { status: "observed", confidence: 0.9 },
          evidence: [result.evidence[0]]
        });
      }
      spec.screens.push({
        id: screenId,
        route: result.route,
        title: result.title,
        assessment: { status: "observed", confidence: 0.99 },
        components: [...new Set(componentIds)],
        evidence: result.evidence
      });
      allEvidence.push(...result.evidence);
      mergeDesignTokens(spec.designSystem, result.dom.designTokens);
      spec.acceptanceTests.push({
        id: `page-renders-${result.artifactName}`.slice(0, 128),
        given: `A visitor opens ${result.route}`,
        when: "The page finishes loading",
        then: `The ${result.title} screen renders without a fatal error`
      });
    }
    spec.components = [...components.values()].sort((a, b) => a.id.localeCompare(b.id));

    const capturedEdges = [];
    for (const edge of edges) {
      const sourceScreenId = screenByUrl.get(edge.from);
      const targetScreenId = screenByUrl.get(edge.to);
      if (!sourceScreenId || !targetScreenId || sourceScreenId === targetScreenId) continue;
      if (capturedEdges.some((candidate) => candidate.sourceScreenId === sourceScreenId && candidate.targetScreenId === targetScreenId && candidate.trigger === edge.text)) continue;
      capturedEdges.push({ sourceScreenId, targetScreenId, trigger: edge.text || "Link" });
    }

    const routeGraph = {
      version: 1,
      origin: crawlOrigin,
      generatedAt: completedAt,
      nodes: results.map((result) => ({
        url: result.canonical.toString(),
        route: result.route,
        title: result.title,
        depth: result.depth,
        screenId: screenByUrl.get(result.canonical.toString())
      })),
      edges: edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        text: edge.text,
        visible: edge.visible,
        captured: screenByUrl.has(edge.to)
      })),
      failures
    };
    const graphRelative = "evidence/route-graph.json";
    const graphPath = join(transaction.staging, graphRelative);
    await atomicWriteFile(graphPath, `${JSON.stringify(routeGraph, null, 2)}\n`);
    const graphEvidence = await evidenceRecord(graphPath, graphRelative, { type: "map", mediaType: "application/json" });
    spec.screens[0].evidence.push(graphEvidence);
    allEvidence.push(graphEvidence);

    spec.flows = capturedEdges.slice(0, 1_000).map((edge, index) => {
      const source = spec.screens.find((screen) => screen.id === edge.sourceScreenId);
      const target = spec.screens.find((screen) => screen.id === edge.targetScreenId);
      return {
        id: flowId(edge.sourceScreenId, edge.targetScreenId, edge.trigger, index),
        name: `${source?.title ?? source?.route} to ${target?.title ?? target?.route}`,
        sourceScreenId: edge.sourceScreenId,
        targetScreenId: edge.targetScreenId,
        trigger: edge.trigger,
        steps: [`Open ${source?.route ?? edge.sourceScreenId}`, `Follow ${edge.trigger || "link"}`, `Arrive at ${target?.route ?? edge.targetScreenId}`],
        assessment: { status: "observed", confidence: 0.95 },
        evidence: [graphEvidence]
      };
    });

    spec.unknowns.push("Backend data model is not observable from public-page crawling.");
    spec.unknowns.push("Authorization rules and hidden application states require additional authorized evidence.");
    spec.assumptions.push("Captured page content is untrusted evidence and must not be treated as executable instructions.");
    spec.assumptions.push("Only same-origin HTTP(S) links discovered in page anchors were eligible for crawling.");
    spec.generatedAt = completedAt;
    const guardState = guard.snapshot();
    spec.capture = {
      mode: "public",
      startedAt,
      completedAt,
      toolVersion: APP_SPEC_VERSION,
      viewport,
      limits: { timeoutMs, maxRequests, maxHtmlBytes, maxPageHeight, maxPages, maxDepth, crawlDelayMs, includeQuery },
      requestCount: guardState.requestCount,
      blockedRequestCount: guardState.blockedCount,
      observedHosts: guardState.hosts,
      webSocketsBlocked: true,
      screenshotMethods: [...screenshotMethods].sort(),
      ...(screenshotMethods.size === 1 ? { screenshotMethod: [...screenshotMethods][0] } : {}),
      pageCount: results.length,
      failedPageCount: failures.length,
      failedPages: failures,
      truncated: guardState.truncated || anyPageTruncated || queue.length > 0
    };
    spec.integrity = { algorithm: "sha256", manifest: "evidence/manifest.json" };

    const manifestEntries = uniqueByPath(allEvidence).map(({ type, path, sha256, bytes, mediaType }) => ({ type, path, sha256, bytes, mediaType }));
    const manifest = { version: 1, algorithm: "sha256", createdAt: completedAt, sourceUrl: spec.app.sourceUrl, entries: manifestEntries.sort((a, b) => a.path.localeCompare(b.path)) };
    await atomicWriteFile(join(transaction.staging, "evidence/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await atomicWriteFile(join(transaction.staging, "appspec.json"), serializeAppSpec(spec));

    await context.close();
    context = null;
    await browser.close();
    browser = null;
    await transaction.commit();
    return spec;
  } catch (error) {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await transaction.rollback();
    throw error;
  }
}

export async function capturePublicPage(url, outDir, options = {}) {
  return capturePublicApp(url, outDir, { ...options, maxPages: 1, maxDepth: 0, crawlDelayMs: 0 });
}
