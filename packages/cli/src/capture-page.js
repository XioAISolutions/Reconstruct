import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile, evidenceRecord } from "./fs.js";
import { assertAllowedUrl } from "./security.js";
import { artifactNameForUrl, canonicalizeCrawlUrl, routeForUrl } from "./crawl.js";
import { cleanText } from "./capture-utils.js";

async function captureScreenshotWithCdp(context, page, width, height) {
  const session = await context.newCDPSession(page);
  try {
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    });
    return Buffer.from(result.data, "base64");
  } finally {
    await session.detach().catch(() => {});
  }
}

async function extractPageData(page) {
  return page.evaluate(() => {
    const clean = (value, max = 300) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const redactUrl = (value) => {
      try {
        const url = new URL(value, location.href);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()]) {
          if (/(token|secret|password|passwd|auth|session|signature|credential|api[-_]?key|code)/i.test(key)) url.searchParams.set(key, "[REDACTED]");
        }
        return url.toString().slice(0, 2_048);
      } catch {
        return "";
      }
    };
    const cssVariables = {};
    const rootStyle = window.getComputedStyle(document.documentElement);
    for (const property of [...rootStyle]) {
      if (property.startsWith("--") && Object.keys(cssVariables).length < 500) cssVariables[property] = clean(rootStyle.getPropertyValue(property), 500);
    }
    const landmarks = [...document.querySelectorAll("header,nav,main,aside,footer,section")].filter(visible).slice(0, 500).map((element, index) => {
      const heading = element.querySelector("h1,h2,h3");
      const explicitId = clean(element.id, 200);
      const label = clean(element.getAttribute("aria-label"), 200);
      return {
        id: explicitId || label || clean(heading?.textContent, 200) || `${element.tagName.toLowerCase()}-${index + 1}`,
        tag: element.tagName.toLowerCase(),
        role: clean(element.getAttribute("role"), 100) || null,
        label: label || null,
        heading: clean(heading?.textContent, 200) || null
      };
    });
    return {
      title: clean(document.title),
      url: location.href,
      language: document.documentElement.lang || null,
      headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).slice(0, 300).map((element) => ({
        level: Number(element.tagName.slice(1)),
        text: clean(element.textContent)
      })),
      links: [...document.querySelectorAll("a[href]")].slice(0, 1_000).map((element) => ({
        text: clean(element.textContent),
        href: redactUrl(element.href),
        visible: visible(element)
      })),
      buttons: [...document.querySelectorAll("button,[role=button]")].filter(visible).slice(0, 500).map((element) => ({
        text: clean(element.textContent),
        label: clean(element.getAttribute("aria-label"), 200) || null,
        type: element.getAttribute("type")
      })),
      forms: [...document.querySelectorAll("form")].filter(visible).slice(0, 200).map((form, index) => ({
        id: form.id || `form-${index + 1}`,
        method: (form.getAttribute("method") || "get").toLowerCase(),
        action: redactUrl(form.getAttribute("action") || location.href),
        fields: [...form.querySelectorAll("input,select,textarea")].slice(0, 300).map((field) => ({
          tag: field.tagName.toLowerCase(),
          name: clean(field.getAttribute("name"), 200) || null,
          type: clean(field.getAttribute("type"), 100) || null,
          placeholder: clean(field.getAttribute("placeholder"), 300) || null,
          label: clean(field.getAttribute("aria-label"), 300) || null
        }))
      })),
      landmarks,
      designTokens: {
        cssVariables,
        bodyFontFamily: clean(window.getComputedStyle(document.body).fontFamily, 500),
        bodyFontSize: clean(window.getComputedStyle(document.body).fontSize, 100),
        bodyColor: clean(window.getComputedStyle(document.body).color, 100),
        bodyBackgroundColor: clean(window.getComputedStyle(document.body).backgroundColor, 100)
      },
      dimensions: {
        width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
        height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
      }
    };
  });
}

async function extractSanitizedHtml(page) {
  return page.evaluate(() => {
    const redactUrl = (value) => {
      try {
        const url = new URL(value, location.href);
        url.username = "";
        url.password = "";
        for (const key of [...url.searchParams.keys()]) {
          if (/(token|secret|password|passwd|auth|session|signature|credential|api[-_]?key|code)/i.test(key)) url.searchParams.set(key, "[REDACTED]");
        }
        return url.toString().slice(0, 2_048);
      } catch {
        return "";
      }
    };
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("script,noscript,iframe,object,embed,base,style,link,meta[http-equiv=refresh]").forEach((element) => element.remove());
    clone.querySelectorAll("input,textarea,select,option").forEach((element) => {
      element.removeAttribute("value");
      element.removeAttribute("checked");
      element.removeAttribute("selected");
      if (element.tagName === "TEXTAREA") element.textContent = "";
    });
    const urlAttributes = new Set(["href", "src", "srcset", "action", "formaction", "poster"]);
    clone.querySelectorAll("*").forEach((element) => {
      element.removeAttribute("style");
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith("on") || name === "nonce" || name === "srcdoc") {
          element.removeAttribute(attribute.name);
        } else if (urlAttributes.has(name)) {
          const redacted = redactUrl(attribute.value);
          if (redacted) element.setAttribute(`data-reconstruct-${name}`, redacted);
          element.removeAttribute(attribute.name);
        }
      }
    });
    return `<!doctype html>\n<!-- Inert evidence: scripts, embeds, styles, and live URLs removed by Reconstruct. -->\n${clone.outerHTML}`;
  });
}

export async function captureOnePage({ page, context, targetUrl, staging, viewport, timeoutMs, maxHtmlBytes, maxPageHeight, saveHtml, allowPrivateNetwork, includeQuery }) {
  await mkdir(join(staging, "evidence", "pages"), { recursive: true, mode: 0o700 });
  await mkdir(join(staging, "evidence", "screenshots"), { recursive: true, mode: 0o700 });
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForLoadState("load", { timeout: Math.min(timeoutMs, 5_000) }).catch(() => {});
  const finalUrl = await assertAllowedUrl(page.url(), { allowPrivateNetwork });
  const canonical = canonicalizeCrawlUrl(finalUrl, { origin: finalUrl.origin, includeQuery }) ?? finalUrl;
  const route = routeForUrl(canonical, { includeQuery });
  const artifactName = artifactNameForUrl(canonical);
  const title = cleanText(await page.title(), 300) || cleanText(finalUrl.hostname, 300);
  const dom = await extractPageData(page);
  const sanitizedHtml = saveHtml ? await extractSanitizedHtml(page) : null;

  const domRelative = `evidence/pages/${artifactName}.json`;
  const htmlRelative = `evidence/pages/${artifactName}.html`;
  const screenshotRelative = `evidence/screenshots/${artifactName}.png`;
  const domPath = join(staging, domRelative);
  const htmlPath = join(staging, htmlRelative);
  const screenshotPath = join(staging, screenshotRelative);
  await atomicWriteFile(domPath, `${JSON.stringify(dom, null, 2)}\n`);

  let htmlTruncated = false;
  if (sanitizedHtml !== null) {
    const htmlBuffer = Buffer.from(sanitizedHtml, "utf8");
    htmlTruncated = htmlBuffer.length > maxHtmlBytes;
    const output = htmlTruncated
      ? Buffer.concat([htmlBuffer.subarray(0, maxHtmlBytes), Buffer.from("\n<!-- RECONSTRUCT: HTML truncated -->\n")])
      : htmlBuffer;
    await atomicWriteFile(htmlPath, output);
  }

  const screenshotHeight = Math.max(viewport.height, Math.min(Number(dom.dimensions.height) || viewport.height, maxPageHeight));
  let screenshotFallback = false;
  let screenshotMethod = "playwright-clip";
  let screenshot;
  try {
    screenshot = await page.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
      clip: { x: 0, y: 0, width: viewport.width, height: screenshotHeight },
      timeout: Math.min(timeoutMs, 5_000)
    });
  } catch {
    screenshotFallback = true;
    screenshotMethod = "playwright-viewport";
    try {
      screenshot = await page.screenshot({ type: "png", animations: "disabled", caret: "hide", fullPage: false, timeout: Math.min(timeoutMs, 5_000) });
    } catch {
      screenshotMethod = "cdp";
      screenshot = await captureScreenshotWithCdp(context, page, viewport.width, screenshotHeight);
    }
  }
  await atomicWriteFile(screenshotPath, screenshot);

  const evidence = [
    await evidenceRecord(domPath, domRelative, { type: "dom", mediaType: "application/json" }),
    await evidenceRecord(screenshotPath, screenshotRelative, { type: "screenshot", mediaType: "image/png" })
  ];
  if (sanitizedHtml !== null) evidence.push(await evidenceRecord(htmlPath, htmlRelative, { type: "html", mediaType: "text/html" }));

  return {
    finalUrl,
    canonical,
    route,
    artifactName,
    title,
    dom,
    evidence,
    screenshotMethod,
    truncated: htmlTruncated || screenshotFallback || Number(dom.dimensions.height) > maxPageHeight
  };
}
