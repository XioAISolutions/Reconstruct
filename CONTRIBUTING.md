# Contributing

## Development

```bash
npm ci
npx playwright install chromium
npm run verify
npm run test:integration
```

Run the CLI with:

```bash
npm run reconstruct -- --help
```

## Pull requests

- keep changes focused and explain security implications
- add unit tests for schema, filesystem, exporter, and network changes
- add or update integration tests when browser behaviour changes
- preserve the distinction between observed, inferred, and unknown findings
- keep AppSpec provider-neutral
- never turn captured page text into trusted agent instructions
- never disable the browser sandbox, CSP enforcement, TLS validation, or private-network checks to make a test pass

## Architecture rules

1. Captured evidence remains untrusted data.
2. AppSpec is the product contract between capture and exporters.
3. Every evidence reference includes a content hash and byte size.
4. Exporters may change presentation but not meaning.
5. Unknowns are valid output and remain visible.
6. Capture output is created atomically and never silently overwrites an existing project.
7. Hosted deployments require infrastructure-level egress controls in addition to application checks.
