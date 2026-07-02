import { assertAllowedUrl } from "./security.js";
import { routeOf } from "./journey-report.js";

export function locatorFor(page, target) {
  const exact = target.exact === true;
  if (target.role !== undefined) {
    return page.getByRole(target.role, {
      ...(target.name !== undefined ? { name: target.name } : {}),
      exact
    });
  }
  if (target.label !== undefined) return page.getByLabel(target.label, { exact });
  if (target.placeholder !== undefined) return page.getByPlaceholder(target.placeholder, { exact });
  if (target.text !== undefined) return page.getByText(target.text, { exact });
  return page.getByTestId(target.testId);
}

export async function uniqueLocator(page, target) {
  const locator = locatorFor(page, target);
  const count = await locator.count();
  if (count !== 1) throw new Error(`Expected exactly one matching element, found ${count}`);
  return locator.first();
}

export async function assertJourneyLocation(page, candidateOrigin, allowPrivateNetwork) {
  const current = await assertAllowedUrl(page.url(), { allowPrivateNetwork });
  if (current.origin !== candidateOrigin) throw new Error(`Journey left candidate origin and reached ${current.origin}`);
  return current;
}

async function assertClickAllowed(locator, allowWriteActions) {
  if (allowWriteActions) return;
  const submitsForm = await locator.evaluate((element) => {
    const form = element.closest("form");
    if (!form) return false;
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute("type") || (tag === "button" ? "submit" : "")).toLowerCase();
    return (tag === "button" && type === "submit") || (tag === "input" && ["submit", "image"].includes(type));
  });
  if (submitsForm) throw new Error("Form submission requires the allow-write-actions option");
}

async function assertKeyAllowed(page, key, allowWriteActions) {
  if (allowWriteActions || key !== "Enter") return;
  const insideForm = await page.evaluate(() => Boolean(document.activeElement?.closest?.("form")));
  if (insideForm) throw new Error("Pressing Enter inside a form requires the allow-write-actions option");
}

export async function executeJourneyStep(page, step, context) {
  const timeout = step.timeoutMs ?? context.timeoutMs;
  switch (step.action) {
    case "goto": {
      const target = new URL(step.route, context.candidateBase);
      if (target.origin !== context.candidateBase.origin) throw new Error("Cross-origin navigation is not allowed");
      await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout });
      break;
    }
    case "click": {
      const locator = await uniqueLocator(page, step.target);
      await assertClickAllowed(locator, context.allowWriteActions);
      await locator.click({ timeout });
      break;
    }
    case "fill": {
      const locator = await uniqueLocator(page, step.target);
      await locator.fill(step.value, { timeout });
      break;
    }
    case "press":
      await assertKeyAllowed(page, step.key, context.allowWriteActions);
      await page.keyboard.press(step.key);
      break;
    case "viewport":
      await page.setViewportSize({ width: step.width, height: step.height });
      break;
    case "expect-visible": {
      const locator = await uniqueLocator(page, step.target);
      await locator.waitFor({ state: "visible", timeout });
      break;
    }
    case "expect-hidden": {
      const locator = locatorFor(page, step.target);
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
        if (await locator.nth(index).isVisible()) throw new Error(`Expected hidden state, but match ${index + 1} is visible`);
      }
      break;
    }
    case "expect-text":
      await page.getByText(step.text, { exact: step.exact === true }).first().waitFor({ state: "visible", timeout });
      break;
    case "expect-url": {
      const current = await assertJourneyLocation(page, context.candidateBase.origin, context.allowPrivateNetwork);
      const observed = routeOf(current);
      if (observed !== step.route) throw new Error(`Expected route ${step.route}, observed ${observed}`);
      break;
    }
    case "checkpoint":
      await context.captureCheckpoint(step.name, context.stepIndex);
      break;
    case "audit": {
      const result = await context.audit();
      const required = step.minScore ?? context.minimumAccessibilityScore;
      if (result.score < required) throw new Error(`Accessibility score ${result.score.toFixed(2)} is below required ${required.toFixed(2)}`);
      break;
    }
  }
  await page.waitForTimeout(50);
  return assertJourneyLocation(page, context.candidateBase.origin, context.allowPrivateNetwork);
}
