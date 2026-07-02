# Threat model

## Assets

Reconstruct must protect the operator's network, filesystem, credentials, source environment, generated evidence, and downstream coding agents.

## Trust boundaries

- target URLs are untrusted
- DNS answers and redirects are untrusted
- page scripts, DOM text, screenshots, and HTML are untrusted
- AppSpec files supplied to `validate` or `export` are untrusted
- exported prompts may be consumed by powerful coding agents

## Primary threats

### Server-side request forgery

A target may resolve or redirect to loopback, RFC1918, link-local, cloud metadata, multicast, reserved, IPv4-mapped IPv6, or transition addresses. Reconstruct validates the initial URL, every intercepted HTTP request, and the final URL. Special-use host suffixes are denied by default.

DNS can change between validation and the browser connection. Therefore a multi-tenant hosted deployment must also enforce an outbound firewall outside the Node.js process.

### Browser escape and resource exhaustion

A malicious page may open popups, start downloads, register service workers, request excessive resources, produce enormous HTML, or create an extremely tall page. Reconstruct uses an isolated context, rejects downloads, blocks service workers, dismisses dialogs and popups, limits requests, caps HTML and screenshot size, and applies bounded timeouts.

The browser must remain sandboxed. Do not add `--no-sandbox`.

### Prompt injection

Captured content can contain instructions aimed at coding agents. Exporters escape captured labels and generate `UNTRUSTED_EVIDENCE.md`. Agents are instructed to treat evidence as data and never execute commands or disclose secrets because captured text requests it.

### Filesystem abuse

Output paths may target sensitive directories or escape through traversal. Reconstruct rejects protected output paths, uses safe relative paths, writes through same-directory temporary files, creates a staging directory, and atomically renames completed projects. Existing outputs are never overwritten silently.

### Malformed AppSpec input

A crafted JSON document may contain duplicate identifiers, unsafe paths, excessive nesting, huge arrays, invalid hashes, prototype-pollution keys, or unsupported URLs. AppSpec validation rejects these conditions before export.

### Supply-chain compromise

Dependencies use exact versions and a committed lockfile. CI has read-only repository permissions. Dependabot reviews npm and GitHub Actions dependencies. Maintainers should enable GitHub secret scanning, Dependabot alerts, and CodeQL default setup when available for the repository plan.

## Out of scope for the local CLI

- defeating browser zero-days without operating-system isolation
- guaranteeing privacy after a user intentionally captures sensitive authenticated content
- proving ownership or authorization of a target
- preventing an administrator from deliberately enabling unsafe private-network mode
