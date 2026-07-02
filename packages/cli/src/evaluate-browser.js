export async function captureScreenshotWithCdp(context, page, width, height) {
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

export async function extractPageData(page) {
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
