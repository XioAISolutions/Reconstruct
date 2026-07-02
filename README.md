# Reconstruct

**Turn a web application into a build-ready, evidence-backed specification for AI coding agents.**

Reconstruct captures observable product evidence, converts it into a provider-neutral `AppSpec`, and exports focused implementation packages for Cursor, Claude Code, Codex, and other coding agents.

> Observe → Map → Specify → Build → Compare → Correct

## What changed in 0.3

Reconstruct can now map an application rather than stopping at one page:

- same-origin breadth-first crawling
- configurable page, depth, request, delay, HTML, and screenshot limits
- route normalization and tracking-parameter removal
- static-asset and external-origin filtering
- one evidence bundle per captured screen
- shared-component detection across routes
- observed navigation flows with source, trigger, and target
- `evidence/route-graph.json`
- `SITE_MAP.md` and `ROUTE_GRAPH.json` in agent exports

Single-page capture remains available and backward compatible.

## Quick start

Requirements: Node.js 20.19–24 and npm 10 or newer.

```bash
npm ci
npx playwright install chromium
npm run build
```

Capture one page:

```bash
npm run reconstruct -- capture https://example.com --out ./example-page
```

Map an application:

```bash
npm run reconstruct -- crawl https://example.com \
  --out ./example-app \
  --max-pages 20 \
  --max-depth 3 \
  --crawl-delay 250
```

Validate and verify:

```bash
npm run reconstruct -- validate ./example-app/appspec.json
npm run reconstruct -- verify ./example-app/appspec.json
```

Export for a coding agent:

```bash
npm run reconstruct -- export ./example-app/appspec.json --target cursor
npm run reconstruct -- export ./example-app/appspec.json --target claude
npm run reconstruct -- export ./example-app/appspec.json --target codex
```

## Crawl behaviour

The crawler is intentionally conservative:

- it follows only HTTP(S) links on the first successfully loaded page's origin
- it removes fragments and common tracking parameters
- it ignores common static-file extensions
- it does not submit forms or click arbitrary buttons
- it does not cross origins
- it captures sequentially rather than flooding the target
- it records pages that fail after the first successful page
- it stops at configured page, depth, request, and time limits

Query strings are ignored by default to prevent infinite route expansion. Use `--include-query` when query parameters genuinely represent distinct application states.

Read [docs/CRAWLING.md](docs/CRAWLING.md) before increasing limits or operating a hosted service.

## Output

```text
example-app/
├── appspec.json
└── evidence/
    ├── manifest.json
    ├── route-graph.json
    ├── pages/
    │   ├── home.html
    │   ├── home.json
    │   └── pricing-xxxxxxxx.json
    └── screenshots/
        ├── home.png
        └── pricing-xxxxxxxx.png
```

Every evidence artifact is content-addressed with a SHA-256 digest and byte count. `verify` checks the AppSpec, manifest, file type, file size, and digest before an export is generated.

## Agent export package

Every export now contains:

- `appspec.json`
- `PRODUCT.md`
- `SITE_MAP.md`
- `ROUTE_GRAPH.json`
- `ARCHITECTURE.md`
- `DESIGN_SYSTEM.md`
- `IMPLEMENTATION_PLAN.md`
- `ACCEPTANCE_TESTS.md`
- `UNTRUSTED_EVIDENCE.md`
- target-specific agent instructions
- `RECONSTRUCT_MANIFEST.json`

## Security-first design

- public-network capture by default
- private, loopback, link-local, metadata, multicast, reserved, and special-use destinations denied
- browser requests revalidated and bounded
- Chromium sandbox, TLS verification, and CSP enforcement remain enabled
- downloads, service workers, popups, dialogs, WebSockets, and media resources restricted
- output written through restrictive staging directories and atomic commits
- captured page content treated as untrusted evidence, never trusted agent instructions
- AppSpec validation rejects unsafe paths, duplicate IDs, malformed hashes, excessive nesting, and prototype-pollution keys

Application checks reduce risk but do not replace worker-level network isolation in a hosted deployment. Read [SECURITY.md](SECURITY.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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
└── cli/        # network guard, crawl, capture, exports, CLI
```

## Scope

Reconstruct documents observable interfaces and behaviour. It does not claim to recover private source code, hidden system prompts, proprietary backend logic, or authorization rules that are not visible in supplied evidence.

Use it only for public pages and applications you own or are authorized to evaluate. Respect applicable terms, privacy, intellectual property, and access controls.

## License

Apache-2.0
