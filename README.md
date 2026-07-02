# Reconstruct

**Turn a web application into a build-ready specification for AI coding agents.**

Reconstruct captures observable product evidence, converts it into a neutral `AppSpec`, and exports focused implementation packages for Cursor, Claude Code, Codex, and other coding agents.

> Observe → Specify → Build → Compare → Correct

## Goals

- capture routes, screens, forms, links, and visible interface states
- preserve screenshots, HTML, and structured evidence
- classify findings as `observed`, `inferred`, or `unknown`
- generate a versioned AppSpec with confidence and evidence references
- export practical build plans and acceptance criteria for coding agents

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
pnpm reconstruct capture https://example.com --out ./example-reconstruction
pnpm reconstruct validate ./example-reconstruction/appspec.json
pnpm reconstruct export ./example-reconstruction/appspec.json --target cursor
```

## Repository layout

```text
packages/
├── appspec/    # schema, types, and validation
├── capture/    # browser evidence collection
├── exporters/  # coding-agent build packages
└── cli/        # reconstruct command
```

## Responsible use

Use Reconstruct for public pages and applications you own or are authorized to evaluate. Respect applicable terms, privacy, intellectual property, and access controls.

## License

Apache-2.0
