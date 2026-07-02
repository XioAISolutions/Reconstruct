# Declarative journeys

Reconstruct 0.5 can replay responsive and interaction behavior against a running candidate application.

Journeys are JSON documents. They use semantic locators and a small allowlist of actions instead of CSS selectors or arbitrary browser scripts.

## Run a journey

```bash
npm run reconstruct -- journey ./journeys/mobile-navigation.json \
  --candidate http://127.0.0.1:3000 \
  --allow-private-network \
  --out ./journey-results/mobile-navigation
```

`replay` is an alias for `journey`.

The command exits with code `0` when the journey passes, `3` when execution completes but the required score is missed, `2` for invalid input, and `1` for an operational failure.

## Example

```json
{
  "version": 1,
  "name": "Responsive navigation",
  "startRoute": "/",
  "viewport": { "width": 390, "height": 844 },
  "minimumAccessibilityScore": 80,
  "steps": [
    {
      "action": "expect-visible",
      "target": { "role": "button", "name": "Menu" }
    },
    {
      "action": "click",
      "target": { "role": "button", "name": "Menu" }
    },
    {
      "action": "expect-visible",
      "target": { "role": "link", "name": "Pricing" }
    },
    { "action": "checkpoint", "name": "mobile-menu-open" },
    { "action": "press", "key": "Escape" },
    {
      "action": "expect-hidden",
      "target": { "role": "link", "name": "Pricing" }
    },
    { "action": "viewport", "width": 1280, "height": 800 },
    {
      "action": "click",
      "target": { "role": "link", "name": "Pricing" }
    },
    { "action": "expect-url", "route": "/pricing" },
    { "action": "audit", "minScore": 80 },
    { "action": "checkpoint", "name": "pricing-desktop" }
  ]
}
```

## Supported actions

- `goto`: navigate to a same-origin route
- `click`: click one semantic target
- `fill`: fill one semantically named field
- `press`: press an allowlisted keyboard key
- `viewport`: change the browser viewport
- `expect-visible`: require one semantic target to be visible
- `expect-hidden`: require matching semantic targets to be hidden or absent
- `expect-text`: require visible text
- `expect-url`: require the exact route and query
- `checkpoint`: capture a screenshot, DOM evidence, viewport, route, and accessibility result
- `audit`: require a minimum accessibility score at the current state

## Semantic targets

A target must use exactly one strategy:

```json
{ "role": "button", "name": "Menu" }
{ "label": "Email" }
{ "placeholder": "Search" }
{ "text": "Pricing" }
{ "testId": "account-menu" }
```

`exact` may be added when exact accessible-name or text matching is required. CSS selectors and XPath are not accepted.

## Accessibility signal

The built-in bounded audit checks observable issues including:

- missing document title or language
- missing or duplicate main landmarks
- missing or duplicate level-one headings
- skipped heading levels
- images without `alt`
- form controls and interactive elements without accessible names
- positive `tabindex`
- duplicate IDs
- autofocus

This is a fast deterministic signal, not a complete accessibility certification.

## Output

```text
journey-output/
├── journey.json
├── accessibility.json
├── JOURNEY_REPORT.md
├── JOURNEY_CORRECTIONS.md
├── JOURNEY_MANIFEST.json
└── checkpoints/
    ├── 004-mobile-menu-open.json
    ├── 004-mobile-menu-open.png
    └── ...
```

The overall score is 80% passed journey steps and 20% accessibility. By default the overall score must reach 90 and the journey accessibility score must reach 80.

Filled values are replaced with `[REDACTED]` in results. Checkpoint screenshots mask inputs, textareas, and selects.

## Security boundaries

- candidate and browser requests use the existing network guard
- private and loopback addresses require `--allow-private-network`
- every completed action is checked for same-origin location
- popups and dialogs are closed
- WebSockets, downloads, and service workers remain restricted
- form-submit controls and Enter inside forms are blocked by default
- journey documents cannot execute arbitrary JavaScript, shell commands, CSS selectors, XPath, uploads, or page-provided instructions

A hosted deployment should still isolate browser workers and enforce network egress outside the application process.
