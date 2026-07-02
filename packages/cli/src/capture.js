import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createEmptyAppSpec } from "../../appspec/src/index.js";

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "home";
}

export async function capturePublicPage(url, outDir, viewport = { width: 1440, height: 1000 }) {
  const target = new URL(url);
  if (!/^https?:$/.test(target.protocol)) throw new Error("Only http and https URLs are supported");

  const pagesDir = join(outDir, "evidence", "pages");
  const shotsDir = join(outDir, "evidence", "screenshots");
  await mkdir(pagesDir, { recursive: true });
  await mkdir(shotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(target.toString(), { waitUntil: "networkidle", timeout: 30000 });

    const finalUrl = page.url();
    const route = new URL(finalUrl).pathname || "/";
    const name = slug(route);
    const title = (await page.title()).trim() || new URL(finalUrl).hostname;
    const html = await page.content();
    const dom = await page.evaluate(() => ({
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

    await writeFile(join(pagesDir, `${name}.html`), html, "utf8");
    await writeFile(join(pagesDir, `${name}.json`), JSON.stringify(dom, null, 2), "utf8");
    await page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true });

    const spec = createEmptyAppSpec({ name: title, sourceUrl: finalUrl });
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
