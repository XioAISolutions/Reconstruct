import { createHash } from "node:crypto";

const STATIC_EXTENSIONS = new Set([
  ".7z", ".avi", ".avif", ".bmp", ".css", ".csv", ".doc", ".docx", ".eot", ".epub", ".gif",
  ".gz", ".ico", ".jpeg", ".jpg", ".js", ".json", ".map", ".m4a", ".mov", ".mp3", ".mp4",
  ".mpeg", ".ogg", ".otf", ".pdf", ".png", ".ppt", ".pptx", ".rar", ".rss", ".svg", ".tar",
  ".tgz", ".ttf", ".txt", ".wav", ".webm", ".webp", ".woff", ".woff2", ".xls", ".xlsx", ".xml", ".zip"
]);

const TRACKING_PARAMS = [
  /^utm_/i,
  /^(gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|ref|referrer|source)$/i
];

function extension(pathname) {
  const segment = pathname.split("/").pop() ?? "";
  const dot = segment.lastIndexOf(".");
  return dot > 0 ? segment.slice(dot).toLowerCase() : "";
}

export function canonicalizeCrawlUrl(input, { baseUrl, origin, includeQuery = false } = {}) {
  let url;
  try {
    url = new URL(input, baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (origin && url.origin !== origin) return null;
  if (STATIC_EXTENSIONS.has(extension(url.pathname))) return null;
  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  if (!includeQuery) {
    url.search = "";
  } else {
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) url.searchParams.delete(key);
    }
    const sorted = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => {
      const keyOrder = aKey.localeCompare(bKey);
      return keyOrder || aValue.localeCompare(bValue);
    });
    url.search = "";
    for (const [key, value] of sorted) url.searchParams.append(key, value);
  }
  return url;
}

export function routeForUrl(input, { includeQuery = false } = {}) {
  const url = input instanceof URL ? input : new URL(input);
  return `${url.pathname || "/"}${includeQuery ? url.search : ""}`;
}

export function artifactNameForUrl(input) {
  const url = input instanceof URL ? input : new URL(input);
  const route = `${url.pathname || "/"}${url.search}`;
  const slug = route.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "home";
  const suffix = createHash("sha256").update(route).digest("hex").slice(0, 8);
  return route === "/" ? "home" : `${slug}-${suffix}`;
}

export function componentIdentity(landmark) {
  const stableName = String(landmark.id || landmark.label || landmark.heading || landmark.role || landmark.tag || "component").trim();
  const signature = `${landmark.tag || "unknown"}:${landmark.role || ""}:${stableName.toLowerCase()}`;
  const suffix = createHash("sha256").update(signature).digest("hex").slice(0, 8);
  const slug = stableName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || landmark.tag || "component";
  return { key: signature, id: `component-${slug}-${suffix}`, name: stableName };
}

export function discoverCrawlTargets(links, currentUrl, { origin, includeQuery = false } = {}) {
  const targets = new Map();
  for (const link of links ?? []) {
    const canonical = canonicalizeCrawlUrl(link.href, { baseUrl: currentUrl, origin, includeQuery });
    if (!canonical) continue;
    const key = canonical.toString();
    if (!targets.has(key)) {
      targets.set(key, {
        url: key,
        text: String(link.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
        visible: link.visible !== false
      });
    }
  }
  return [...targets.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export function sleep(milliseconds) {
  if (!milliseconds) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
