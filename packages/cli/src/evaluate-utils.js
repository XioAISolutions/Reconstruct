export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function roundScore(value) {
  return Math.round(clamp(value, 0, 100) * 100) / 100;
}

export function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) throw new Error("PNG evidence is too small");
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature) || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Screenshot evidence is not a valid PNG");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 50_000 || height > 50_000) {
    throw new Error("PNG dimensions are outside evaluation limits");
  }
  return { width, height };
}

export function normalizeText(value, max = 500) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, max);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

export function compareSignatures(referenceItems, candidateItems) {
  const reference = unique(referenceItems.map((item) => normalizeText(item)));
  const candidate = unique(candidateItems.map((item) => normalizeText(item)));
  const candidateSet = new Set(candidate);
  const referenceSet = new Set(reference);
  const matched = reference.filter((item) => candidateSet.has(item));
  const missing = reference.filter((item) => !candidateSet.has(item));
  const unexpected = candidate.filter((item) => !referenceSet.has(item));
  const recall = reference.length ? matched.length / reference.length : 1;
  const precision = candidate.length ? matched.length / candidate.length : reference.length ? 0 : 1;
  const score = reference.length || candidate.length
    ? (recall * 0.8 + precision * 0.2) * 100
    : 100;
  return { score: roundScore(score), matched, missing, unexpected, referenceCount: reference.length, candidateCount: candidate.length };
}

function headingSignatures(dom) {
  return (dom?.headings ?? []).map((item) => `${item.level}:${item.text}`);
}

function linkSignatures(dom) {
  return (dom?.links ?? []).filter((item) => item.visible !== false).map((item) => {
    let route = item.href;
    try {
      const url = new URL(item.href);
      route = `${url.pathname}${url.search}`;
    } catch {}
    return `${item.text}|${route}`;
  });
}

function buttonSignatures(dom) {
  return (dom?.buttons ?? []).map((item) => `${item.label || item.text}|${item.type || "button"}`);
}

function formSignatures(dom) {
  return (dom?.forms ?? []).map((form) => {
    const fields = (form.fields ?? []).map((field) => `${field.tag}:${field.type || ""}:${field.name || ""}:${field.label || field.placeholder || ""}`).sort();
    return `${form.method || "get"}|${fields.join(",")}`;
  });
}

function landmarkSignatures(dom) {
  return (dom?.landmarks ?? []).map((item) => `${item.tag}:${item.role || ""}:${item.label || item.heading || item.id || ""}`);
}

function tokenSignatures(dom) {
  const tokens = dom?.designTokens ?? {};
  return [
    `font:${tokens.bodyFontFamily || ""}`,
    `font-size:${tokens.bodyFontSize || ""}`,
    `text:${tokens.bodyColor || ""}`,
    `background:${tokens.bodyBackgroundColor || ""}`
  ];
}

export function compareStructure(referenceDom, candidateDom) {
  const title = compareSignatures([referenceDom?.title ?? ""], [candidateDom?.title ?? ""]);
  const headings = compareSignatures(headingSignatures(referenceDom), headingSignatures(candidateDom));
  const links = compareSignatures(linkSignatures(referenceDom), linkSignatures(candidateDom));
  const buttons = compareSignatures(buttonSignatures(referenceDom), buttonSignatures(candidateDom));
  const forms = compareSignatures(formSignatures(referenceDom), formSignatures(candidateDom));
  const landmarks = compareSignatures(landmarkSignatures(referenceDom), landmarkSignatures(candidateDom));
  const design = compareSignatures(tokenSignatures(referenceDom), tokenSignatures(candidateDom));
  const score = roundScore(
    title.score * 0.05 +
    headings.score * 0.25 +
    links.score * 0.2 +
    buttons.score * 0.15 +
    forms.score * 0.15 +
    landmarks.score * 0.15 +
    design.score * 0.05
  );
  return { score, title, headings, links, buttons, forms, landmarks, design };
}

export function candidateRouteSet(dom, candidateOrigin) {
  const routes = new Set();
  for (const link of dom?.links ?? []) {
    if (link.visible === false || !link.href) continue;
    try {
      const url = new URL(link.href);
      if (url.origin === candidateOrigin) routes.add(`${url.pathname}${url.search}`);
    } catch {}
  }
  return routes;
}

export function compareFlows(flows, candidateDom, candidateOrigin, screenById) {
  const routeSet = candidateRouteSet(candidateDom, candidateOrigin);
  const checks = [];
  for (const flow of flows) {
    const target = screenById.get(flow.targetScreenId);
    if (!target) continue;
    const expectedRoute = target.route;
    const routeObserved = routeSet.has(expectedRoute);
    const trigger = normalizeText(flow.trigger || "");
    const triggerObserved = !trigger || (candidateDom?.links ?? []).some((link) => {
      if (link.visible === false) return false;
      let route = "";
      try {
        const url = new URL(link.href);
        if (url.origin !== candidateOrigin) return false;
        route = `${url.pathname}${url.search}`;
      } catch {
        return false;
      }
      return route === expectedRoute && normalizeText(link.text) === trigger;
    });
    checks.push({
      flowId: flow.id,
      trigger: flow.trigger || "Link",
      targetRoute: expectedRoute,
      routeObserved,
      triggerObserved,
      passed: routeObserved && triggerObserved
    });
  }
  const score = checks.length ? roundScore((checks.filter((check) => check.passed).length / checks.length) * 100) : 100;
  return { score, checks };
}

export function combineRouteScores({ visual, structure, behavior }) {
  const behaviorWeight = behavior == null ? 0 : 0.15;
  const visualWeight = behaviorWeight ? 0.55 : 0.65;
  const structureWeight = behaviorWeight ? 0.3 : 0.35;
  return roundScore(visual * visualWeight + structure * structureWeight + (behavior ?? 0) * behaviorWeight);
}

export function summarizeFindings({ route, visual, structure, behavior, loadError }) {
  const findings = [];
  if (loadError) return [{ severity: "critical", category: "route", message: `Route ${route} did not load: ${loadError}` }];
  if (visual.score < 95) {
    findings.push({
      severity: visual.score < 70 ? "high" : "medium",
      category: "visual",
      message: `Visual similarity is ${visual.score.toFixed(2)}%; inspect the route heatmap and align layout, spacing, typography, color, and component sizing.`
    });
  }
  for (const [category, result] of Object.entries(structure)) {
    if (category === "score" || !result?.missing?.length) continue;
    findings.push({
      severity: category === "forms" || category === "buttons" ? "high" : "medium",
      category,
      message: `Missing ${category}: ${result.missing.slice(0, 8).join("; ")}`
    });
  }
  for (const check of behavior?.checks ?? []) {
    if (!check.routeObserved) findings.push({ severity: "high", category: "navigation", message: `Missing navigation to ${check.targetRoute} from trigger ${check.trigger}.` });
    else if (!check.triggerObserved) findings.push({ severity: "medium", category: "navigation", message: `Navigation reaches ${check.targetRoute}, but the expected trigger text ${check.trigger} was not observed.` });
  }
  return findings.slice(0, 50);
}
