# Security policy

## Reporting

Report suspected vulnerabilities privately to the XIO AI Solutions maintainers. Do not include secrets, customer data, or exploit payloads in a public issue.

Include the affected version or commit, reproduction conditions, impact, and a minimal proof of concept when safe to do so.

## Supported versions

Security fixes are applied to the latest release line. Pre-release builds and historical commits may receive fixes only when needed to protect users upgrading to the latest version.

## Security boundaries

Reconstruct treats every target page and every captured string as untrusted input. Public capture blocks local, private, link-local, multicast, and special-use network destinations by default. Files are written through a new staging directory with restrictive permissions and integrity hashes.

`--allow-private-network` deliberately relaxes the network boundary for authorized local testing. Do not expose that mode to untrusted users.

## Hosted deployments

Application-level URL validation reduces risk but is not a substitute for infrastructure isolation. A hosted service must run browser workers in disposable containers or virtual machines with:

- an outbound firewall that denies private and metadata networks
- no cloud instance credentials or service-account tokens
- no mounted developer home directory or Docker socket
- strict CPU, memory, process, disk, request, and execution-time limits
- a read-only base filesystem and isolated per-job workspace
- independent malware scanning and retention controls for generated artifacts

See `docs/THREAT_MODEL.md` and `docs/DEPLOYMENT.md`.
