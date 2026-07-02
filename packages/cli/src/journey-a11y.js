const PENALTIES = Object.freeze({ critical: 25, serious: 10, moderate: 3, minor: 1 });

function round(value) {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

export function scoreAccessibilityFindings(findings) {
  const penalty = findings.reduce((sum, finding) => sum + (PENALTIES[finding.severity] ?? 1) * Math.max(1, finding.count ?? 1), 0);
  return round(100 - penalty);
}

export async function auditAccessibility(page) {
  const findings = await page.evaluate(() => {
    const result = [];
    const clean = (value, max = 160) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const accessibleName = (element) => {
      const labelledBy = clean(element.getAttribute("aria-labelledby"), 200);
      if (labelledBy) {
        const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
        if (clean(text)) return clean(text);
      }
      const aria = clean(element.getAttribute("aria-label"), 300);
      if (aria) return aria;
      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (label && clean(label.textContent)) return clean(label.textContent);
      }
      const wrapped = element.closest("label");
      if (wrapped && clean(wrapped.textContent)) return clean(wrapped.textContent);
      const alt = clean(element.getAttribute("alt"), 300);
      if (alt) return alt;
      const title = clean(element.getAttribute("title"), 300);
      if (title) return title;
      return clean(element.textContent, 300);
    };
    const push = (severity, category, message, elements = []) => {
      if (!elements.length) return;
      result.push({
        severity,
        category,
        message,
        count: elements.length,
        examples: elements.slice(0, 5).map((element) => {
          if (typeof element === "string") return clean(element);
          const tag = element.tagName?.toLowerCase() || "element";
          const id = element.id ? `#${clean(element.id, 80)}` : "";
          return `${tag}${id}${accessibleName(element) ? ` (${accessibleName(element)})` : ""}`;
        })
      });
    };

    if (!clean(document.title)) result.push({ severity: "serious", category: "document", message: "Document title is missing.", count: 1, examples: [] });
    if (!clean(document.documentElement.lang)) result.push({ severity: "moderate", category: "document", message: "Document language is missing.", count: 1, examples: [] });

    const mains = [...document.querySelectorAll("main,[role=main]")].filter(visible);
    if (mains.length === 0) result.push({ severity: "serious", category: "landmark", message: "No visible main landmark was found.", count: 1, examples: [] });
    if (mains.length > 1) result.push({ severity: "moderate", category: "landmark", message: "Multiple visible main landmarks were found.", count: mains.length, examples: mains.slice(0, 5).map((item) => item.tagName.toLowerCase()) });

    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
    const h1s = headings.filter((item) => item.tagName === "H1");
    if (h1s.length === 0) result.push({ severity: "serious", category: "heading", message: "No visible level-one heading was found.", count: 1, examples: [] });
    if (h1s.length > 1) push("moderate", "heading", "Multiple visible level-one headings were found.", h1s);
    const skipped = [];
    let previous = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      if (previous && level > previous + 1) skipped.push(`${heading.tagName.toLowerCase()}: ${clean(heading.textContent)}`);
      previous = level;
    }
    push("moderate", "heading", "Heading levels skip one or more levels.", skipped);

    const imagesWithoutAlt = [...document.querySelectorAll("img")].filter((image) => !image.hasAttribute("alt"));
    push("serious", "image", "Images without an alt attribute were found.", imagesWithoutAlt);

    const controls = [...document.querySelectorAll("input,select,textarea")].filter((element) => {
      const type = (element.getAttribute("type") || "").toLowerCase();
      return visible(element) && type !== "hidden" && !accessibleName(element);
    });
    push("serious", "control", "Visible form controls without an accessible name were found.", controls);

    const namelessInteractive = [...document.querySelectorAll("button,a[href],[role=button],[role=link]")].filter((element) => visible(element) && !accessibleName(element));
    push("serious", "interactive", "Visible interactive elements without an accessible name were found.", namelessInteractive);

    const positiveTabIndex = [...document.querySelectorAll("[tabindex]")].filter((element) => Number(element.getAttribute("tabindex")) > 0);
    push("moderate", "focus", "Positive tabindex values were found.", positiveTabIndex);

    const ids = new Map();
    for (const element of document.querySelectorAll("[id]")) {
      if (!ids.has(element.id)) ids.set(element.id, []);
      ids.get(element.id).push(element);
    }
    const duplicates = [...ids.entries()].filter(([, elements]) => elements.length > 1).map(([id]) => id);
    push("moderate", "document", "Duplicate element IDs were found.", duplicates);

    const autoFocus = [...document.querySelectorAll("[autofocus]")];
    push("minor", "focus", "Autofocus is present and may move focus unexpectedly.", autoFocus);

    return result.slice(0, 100);
  });

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] ?? 0) + (finding.count ?? 1);
  return { score: scoreAccessibilityFindings(findings), counts, findings };
}
