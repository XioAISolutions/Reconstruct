import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createEmptyAppSpec } from "@reconstruct/appspec";
import { clean, slug } from "./text.js";

export async function capturePublicPage(url, outDir, options = {}) {
  const { width = 1440, height = 1000, timeoutMs = 30000 } = options;
  const target = new URL(url);
  if (!/^https?:$/.test(target.protocol)) throw new Error("Only http and https URLs are supported");

  const pagesDir = join(outDir, "evidence", "pages");
  const shotsDir = join(outDir, "evidence", "screenshots");
  await mkdir(pagesDir, { recursive: true });
  await mkdir(shotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(target.toString(), { waitUntil: "networkidle", timeout: timeoutMs });

    const finalUrl = new URL(page.url());
    const route = finalUrl.pathname || "/";
    const name = slug(route);
    const title = clean(await page.title()) || finalUrl.hostname;
    const html = await page.content();
    const raw = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      links: [...document.querySelectorAll("a")].slice(0, 200).map((el) => ({
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200),
        href: el.href
      })),
      buttons: [...document.querySelectorAll("button,[role=button]")].slice(0, 200).map((el) => ({
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200),
        label: el.getAttribute("aria-label")
      })),
      forms: [...document.querySelectorAll("form")].slice(0, 50).map((form, index) => ({
        id: form.id || `form-${index + 1}`,
        method: form.method || "get",
        fields: [...form.querySelectorAll("input,select,textarea")].map((field) => ({
          tag: field.tagName.toLowerCase(),
          name: field.getAttribute("name"),
          type: field.getAttribute("type"),
          placeholder: field.getAttribute("placeholder")
        }))
      })),
      landmarks: [...document.querySelectorAll("header,nav,main,aside,footer,section")].slice(0, 100).map((el, index) => ({
        id: el.id || `${el.tagName.toLowerCase()}-${index + 1}`,
        tag: el.tagName.toLowerCase()
      }))
    }));
    const dom = sanitizeDom(raw);

    await writeFile(join(pagesDir, `${name}.html`), html, "utf8");
    await writeFile(join(pagesDir, `${name}.json`), JSON.stringify(dom, null, 2), "utf8");
    await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });

    const spec = createEmptyAppSpec({ name: title, sourceUrl: finalUrl.toString() });
    spec.screens.push({
      id: `screen-${name}`,
      route,
      title,
      status: "observed",
      confidence: 0.99,
      evidence: [
        `evidence/screenshots/${name}.png`,
        `evidence/pages/${name}.html`,
        `evidence/pages/${name}.json`
      ]
    });
    spec.components = dom.landmarks.map((item) => ({
      id: `component-${slug(item.id)}`,
      name: item.id,
      type: item.tag,
      status: "observed",
      confidence: 0.9
    }));
    spec.unknowns.push("Backend data model is not observable from a public page capture.");
    spec.unknowns.push("Authorization rules require additional authorized evidence.");
    spec.acceptanceTests.push({
      id: "page-renders",
      given: `A visitor opens ${route}`,
      when: "The page finishes loading",
      then: `The ${title} screen renders without a fatal error`
    });

    await writeFile(join(outDir, "appspec.json"), JSON.stringify(spec, null, 2), "utf8");
    return spec;
  } finally {
    await browser.close();
  }
}

// The raw HTML evidence file keeps the page verbatim; everything that feeds the
// structured JSON and the AppSpec is stripped of control and bidi characters
// so captured content cannot smuggle invisible text into generated documents.
function sanitizeDom(raw) {
  return {
    title: clean(raw.title),
    url: clean(raw.url, 2000),
    links: raw.links.map((link) => ({ text: clean(link.text), href: clean(link.href, 2000) })),
    buttons: raw.buttons.map((button) => ({ text: clean(button.text), label: clean(button.label) })),
    forms: raw.forms.map((form) => ({
      id: clean(form.id),
      method: clean(form.method),
      fields: form.fields.map((field) => ({
        tag: clean(field.tag),
        name: clean(field.name),
        type: clean(field.type),
        placeholder: clean(field.placeholder)
      }))
    })),
    landmarks: raw.landmarks.map((item) => ({ id: clean(item.id), tag: clean(item.tag) }))
  };
}
