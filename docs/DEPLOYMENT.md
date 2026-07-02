# Deployment hardening

The local CLI is not by itself a safe multi-tenant browser service.

## Required worker isolation

Run each capture in a disposable container or VM with no secrets. Deny access to loopback services outside the worker, RFC1918 networks, link-local ranges, cloud metadata endpoints, cluster service networks, and control-plane networks at the firewall layer.

Recommended controls:

- one capture per disposable worker
- non-root user
- read-only root filesystem
- isolated writable workspace with a strict quota
- no Docker socket, host networking, or privileged mode
- no cloud credentials, SSH agents, browser profiles, or developer home mounts
- CPU, memory, process, network-byte, disk-byte, and wall-clock limits
- outbound DNS and HTTP(S) only through a policy-enforcing proxy
- artifact encryption, retention limits, and access logging
- queue-level concurrency and per-customer rate limits

## Application settings

Never expose `--allow-private-network` in a public API. Keep TLS verification and browser sandboxing enabled. Do not accept arbitrary Chromium launch arguments from users.

## Evidence retention

Captured HTML and screenshots may contain personal or confidential information. Define retention, deletion, geographic residency, access control, and audit policies before offering hosted capture.
