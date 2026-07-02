# Reconstruct

**Turn a web application into a build-ready, evidence-backed specification for AI coding agents.**

Reconstruct captures observable product evidence, converts it into a provider-neutral `AppSpec`, and exports focused implementation packages for Cursor, Claude Code, Codex, and other coding agents.

> Observe → Specify → Build → Compare → Correct

## Security-first design

- public-network capture by default; private, loopback, link-local, metadata, multicast, and special-use destinations are denied
- every browser request is revalidated and bounded
- isolated browser context with downloads and service workers disabled
- output projects are staged, hashed, and atomically committed
- existing directories are never silently overwritten
- captured page text is treated as untrusted data, not agent instructions
- AppSpec validation rejects unsafe paths, duplicate IDs, malformed hashes, excessive nesting, and prototype-pollution keys

Application checks reduce risk but do not replace infrastructure isolation for hosted deployments. Read [SECURITY.md](SECURITY.md), [the threat model](docs/THREAT_MODEL.md), and [deployment controls](docs/DEPLOYMENT.md).

## Quick start

Requirements: Node.js 20.19–24 and npm 10 or newer.

```bash
npm ci
npx playwright install chromium
npm run build

npm run reconstruct -- capture https://example.com --out ./example-reconstruction
npm run reconstruct -- validate ./example-reconstruction/appspec.json
npm run reconstruct -- verify ./example-reconstruction/appspec.json
npm run reconstruct -- export ./example-reconstruction/appspec.json --target cursor
```

The output directory must not already exist.

## Capture controls

```bash
npm run reconstruct -- capture https://example.com \
  --out ./example-reconstruction \
  --timeout 30000 \
  --max-requests 300 \
  --max-html-bytes 2000000 \
  --max-page-height 12000
```

`--allow-private-network` exists only for explicit, authorized local testing. Never expose it in a public or multi-tenant service.

## Output

```text
example-reconstruction/
├── appspec.json
└── evidence/
    ├── manifest.json
    ├── pages/
    │   ├── home.html
    │   └── home.json
    └── screenshots/
        └── home.png
```

Each evidence reference includes a SHA-256 digest and byte size. Run `verify` to check the manifest and artifact contents before trusting or exporting a project. The AppSpec records capture limits, request counts, truncation, assumptions, and unknowns.

## Agent exports

Targets:

- `cursor`
- `claude`
- `codex`
- `markdown`

Each export includes:

- the validated `appspec.json`
- product, architecture, design-system, implementation, and acceptance-test documents
- an explicit untrusted-evidence boundary
- a SHA-256 export manifest
- target-specific agent instructions where applicable

## Development

```bash
npm run verify
npx playwright install chromium
npm run test:integration
```

Operational guidance: [repository settings](docs/REPOSITORY_SETTINGS.md) and [hosted operations](docs/OPERATIONS.md).

Repository layout:

```text
packages/
├── appspec/    # schema, validation, serialization
└── cli/        # network guard, capture, exports, CLI
```

## Scope

Reconstruct documents observable interfaces and behaviour. It does not claim to recover private source code, hidden system prompts, proprietary backend logic, or authorization rules that are not visible in supplied evidence.

Use it only for public pages and applications you own or are authorized to evaluate. Respect applicable terms, privacy, intellectual property, and access controls.

## License

Apache-2.0
