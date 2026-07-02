# Contributing

Thank you for helping build Reconstruct.

## Development

```bash
pnpm install
pnpm exec playwright install chromium
pnpm test
pnpm build
```

Run the CLI directly during development:

```bash
pnpm --filter @reconstruct/cli exec node src/index.js --help
```

## Pull requests

- keep changes focused
- add tests for schema and behaviour changes
- preserve the difference between observed, inferred, and unknown findings
- keep the AppSpec provider-neutral
- document new fields and output files
- do not silently turn assumptions into facts

## Architecture rules

1. Captured evidence remains available beside the generated specification.
2. AppSpec is the product contract between capture and exporters.
3. Exporters may change presentation but not meaning.
4. Unknowns are valid output and should remain visible.
5. Capture features must remain explicit and user-controlled.
