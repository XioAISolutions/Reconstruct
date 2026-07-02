# Changelog

All notable changes to this project will be documented in this file.

## 0.2.0 - Unreleased

### Added

- strict AppSpec 0.2 validation and a published JSON Schema
- explicit `observed`, `inferred`, and `unknown` assessments with confidence values
- duplicate-ID, unsafe-path, excessive-depth, oversized-input, cyclic-object, and prototype-pollution defenses
- private-network, loopback, link-local, multicast, reserved, transition-address, and special-use hostname blocking
- DNS lookup timeouts and validation of every resolved address
- validation of the initial target, browser requests, redirects, and final URL
- bounded capture controls for requests, navigation time, HTML bytes, page height, and browser resources
- isolated browser contexts with service workers, downloads, dialogs, popups, WebSockets, and media resources restricted
- inert HTML evidence that removes executable and navigation-capable elements and redacts sensitive query values
- restrictive file modes, protected output paths, safe relative-path handling, staging directories, and atomic project/export commits
- SHA-256 evidence and export manifests
- `verify` command for checking AppSpec, manifests, file type, file size, and artifact digests before export
- coding-agent trust-boundary documents that classify captured content as untrusted evidence
- unit tests for schema, network policy, filesystem handling, integrity verification, and exporters
- a real Chromium integration test for capture, redaction, inert evidence, and manifest verification
- hardened CI across supported Node versions, browser integration CI, weekly dependency auditing, and repository policy checks
- Dependabot configuration for npm and GitHub Actions
- security, deployment, operations, threat-model, AppSpec, support, and repository-governance documentation

### Changed

- migrated the repository from pnpm to native npm workspaces with a committed lockfile
- pinned runtime dependencies to exact versions
- AppSpec findings now use explicit assessment objects
- export packages include the validated source AppSpec and integrity metadata
- existing output directories are no longer overwritten
- browser screenshots fall back through bounded Playwright and CDP capture paths while recording the method used

### Security

- Chromium sandboxing, TLS verification, and content-security protections are required by repository policy
- hosted deployments are documented as requiring disposable, non-root, externally firewalled workers
- public capture denies private-network access unless an operator explicitly enables local authorized testing
