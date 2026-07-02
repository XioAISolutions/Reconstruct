# Reconstruct

**Turn a web application into a build-ready specification, evaluate the implementation, and generate the corrections.**

Reconstruct captures observable product evidence, converts it into a provider-neutral AppSpec, exports focused implementation packages for coding agents, and scores a candidate application against the verified source evidence.

> Observe → Map → Specify → Build → Compare → Correct

## Reconstruct 0.4

The evaluation loop is now complete:

- render every recorded candidate route
- compare candidate screenshots against verified reference PNGs
- generate route-level visual heatmaps
- score observable titles, headings, links, buttons, forms, landmarks, and design tokens
- verify recorded navigation targets and trigger text
- produce machine-readable and human-readable evaluation reports
- generate a prioritized correction plan and coding-agent fix prompt
- return exit code `3` when a completed evaluation fails its required score

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

`compare` is an alias for `evaluate`.

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

The route score is weighted from visual similarity, observable interface structure, and recorded navigation behaviour. The default minimum passing score is 85.

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

- public-network capture and evaluation by default
- private, loopback, link-local, metadata, multicast, reserved, and special-use destinations denied unless explicitly enabled
- every browser request revalidated and bounded
- Chromium sandbox, TLS verification, and CSP enforcement remain enabled
- downloads, service workers, popups, dialogs, WebSockets, and media resources restricted
- output written through restrictive staging directories and atomic commits
- captured page content treated as untrusted evidence, never trusted agent instructions
- evaluation verifies source evidence before rendering a candidate
- generated manifests avoid local absolute paths

Application checks reduce risk but do not replace worker-level network isolation in a hosted deployment. Read [SECURITY.md](SECURITY.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and [docs/EVALUATION.md](docs/EVALUATION.md).

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
└── cli/        # capture, crawl, export, evaluation, correction
```

## Scope

Reconstruct documents and compares observable interfaces and behaviour. It does not recover private source code, hidden system prompts, proprietary backend logic, credentials, or authorization rules that are not visible in supplied evidence.

A high evaluation score does not prove backend correctness, accessibility compliance, data integrity, or production security.

Use Reconstruct only for public pages and applications you own or are authorized to evaluate. Respect applicable terms, privacy, intellectual property, and access controls.

## License

Apache-2.0
