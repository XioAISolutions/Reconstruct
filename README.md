# Reconstruct

**Turn a web application into a build-ready specification, evaluate the implementation, replay its behavior, and generate the corrections.**

Reconstruct captures observable product evidence, converts it into a provider-neutral AppSpec, exports focused implementation packages for coding agents, scores a candidate against verified source evidence, and replays declarative responsive journeys.

> Observe → Map → Specify → Build → Compare → Replay → Correct

## Reconstruct 0.5

The behavioral verification layer is now available:

- replay click, fill, keyboard, route, text, visibility, and viewport steps
- locate controls by semantic role, accessible name, label, text, placeholder, or test ID
- verify mobile menus, responsive states, keyboard dismissal, and route transitions
- capture masked checkpoint screenshots and structured DOM evidence
- run bounded accessibility audits at checkpoints or explicit audit steps
- redact filled values from stored results
- block form submission and cross-origin movement by default
- generate machine-readable results, human reports, and correction briefs
- return exit code `3` when a completed journey misses its required score

The 0.4 visual and structural evaluation loop remains fully supported.

## Quick start

Requirements: Node.js 20.19–24 and npm 10 or newer.

```bash
npm ci
npx playwright install chromium
npm run build
```

Capture and map an application:

```bash
npm run reconstruct -- crawl https://example.com \
  --out ./example-app \
  --max-pages 20 \
  --max-depth 3
```

Validate and verify the evidence:

```bash
npm run reconstruct -- validate ./example-app/appspec.json
npm run reconstruct -- verify ./example-app/appspec.json
```

Export a build package:

```bash
npm run reconstruct -- export ./example-app/appspec.json --target cursor
npm run reconstruct -- export ./example-app/appspec.json --target claude
npm run reconstruct -- export ./example-app/appspec.json --target codex
```

Evaluate a running candidate:

```bash
npm run reconstruct -- evaluate ./example-app/appspec.json \
  --candidate http://127.0.0.1:3000 \
  --allow-private-network \
  --out ./example-app/evaluation
```

Replay a responsive interaction journey:

```bash
npm run reconstruct -- journey ./journeys/mobile-navigation.json \
  --candidate http://127.0.0.1:3000 \
  --allow-private-network \
  --out ./journey-results/mobile-navigation
```

`compare` aliases `evaluate`; `replay` aliases `journey`.

## Journey output

```text
journey-output/
├── journey.json
├── accessibility.json
├── JOURNEY_REPORT.md
├── JOURNEY_CORRECTIONS.md
├── JOURNEY_MANIFEST.json
└── checkpoints/
    ├── *.json
    └── *.png
```

Journey scoring is 80% passed behavioral steps and 20% accessibility. The default overall requirement is 90; the default accessibility requirement is 80.

See [docs/JOURNEYS.md](docs/JOURNEYS.md) for the JSON contract, semantic targets, actions, scoring, outputs, and security boundaries.

## Evaluation output

```text
evaluation/
├── evaluation.json
├── REPORT.md
├── CORRECTION_PLAN.md
├── AGENT_FIX_PROMPT.md
├── EVALUATION_MANIFEST.json
├── candidate/
│   ├── pages/
│   └── screenshots/
└── diffs/
```

The route score combines visual similarity, observable interface structure, and recorded navigation behavior. The default minimum passing score is 85.

See [docs/EVALUATION.md](docs/EVALUATION.md) for scoring, output, exit codes, and boundaries.

## Capture output

```text
example-app/
├── appspec.json
└── evidence/
    ├── manifest.json
    ├── route-graph.json
    ├── pages/
    └── screenshots/
```

Every evidence artifact is content-addressed with a SHA-256 digest and byte count. `verify` checks the AppSpec, manifest, file type, file size, and digest before export or evaluation.

## Security-first design

- public-network capture, evaluation, and journeys by default
- private, loopback, link-local, metadata, multicast, reserved, and special-use destinations denied unless explicitly enabled
- every browser request and completed journey action revalidated and bounded
- semantic journey locators only; arbitrary scripts, CSS selectors, and XPath are rejected
- filled values redacted and form fields masked in screenshots
- form submission and Enter inside forms blocked by default
- Chromium sandbox, TLS verification, and CSP enforcement remain enabled
- downloads, service workers, popups, dialogs, WebSockets, and media resources restricted
- output written through restrictive staging directories and atomic commits
- captured page content treated as untrusted evidence, never trusted agent instructions
- generated manifests avoid local absolute paths

Application checks reduce risk but do not replace worker-level network isolation in a hosted deployment. Read [SECURITY.md](SECURITY.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/EVALUATION.md](docs/EVALUATION.md), and [docs/JOURNEYS.md](docs/JOURNEYS.md).

## Development

```bash
npm run verify
npx playwright install chromium
npm run test:integration
npm audit --audit-level=high
```

Repository layout:

```text
packages/
├── appspec/    # schema, validation, serialization
└── cli/        # capture, crawl, export, evaluation, journeys, correction
```

## Scope

Reconstruct documents and compares observable interfaces and behavior. It does not recover private source code, hidden system prompts, proprietary backend logic, credentials, or authorization rules that are not visible in supplied evidence.

A high evaluation or journey score does not prove backend correctness, complete accessibility compliance, data integrity, or production security.

Use Reconstruct only for public pages and applications you own or are authorized to evaluate. Respect applicable terms, privacy, intellectual property, and access controls.

## License

Apache-2.0
