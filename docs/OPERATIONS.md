# Operations

## Limits

Enforce limits at both the application and worker layers. The CLI bounds navigation time, request count, HTML size, screenshot height, AppSpec size, and evidence verification size. Hosted workers should additionally limit total network bytes, CPU, memory, processes, open files, disk space, and wall-clock duration.

## Logging

Log job identifiers, target origin, duration, blocked request count, total evidence bytes, truncation, exit status, and software version. Do not log URL credentials, cookies, authorization headers, page contents, form values, or raw evidence by default.

## Retention

Treat screenshots, HTML, and DOM evidence as potentially sensitive. Define automatic deletion, customer deletion controls, encryption, access auditing, backup exclusions, and incident-response procedures before hosting captures.

## Abuse controls

Use authenticated accounts, rate limits, per-tenant quotas, target allow/deny policies, concurrency caps, and anomaly detection. Suspend jobs that repeatedly target blocked network ranges or exceed resource limits.

## Updates

Review Playwright and Chromium updates promptly. Browser updates are security updates. Run the unit, integration, audit, and policy workflows before release.
