# Changelog

All notable changes to this project are documented here.

## 0.5.0 - Unreleased

### Added

- `journey` command with `replay` alias
- declarative responsive and interaction scenarios
- semantic locators by role, accessible name, label, placeholder, text, or test ID
- allowlisted click, fill, keyboard, viewport, route, text, visibility, checkpoint, and audit actions
- responsive viewport transitions and keyboard-state verification
- bounded accessibility scoring at checkpoints and explicit audit steps
- masked checkpoint screenshots and structured DOM evidence
- `journey.json`, `accessibility.json`, `JOURNEY_REPORT.md`, and `JOURNEY_CORRECTIONS.md`
- content-addressed journey manifests
- journey unit tests and real Chromium passing/failing regression coverage

### Security

- arbitrary JavaScript, CSS selectors, XPath, uploads, and page-provided instructions are not supported by journey files
- candidate location is revalidated after every completed action
- cross-origin movement is rejected
- form-submit controls and Enter inside forms are blocked by default
- filled values are redacted in stored results
- form fields are masked in checkpoint screenshots
- browser request ceilings, Chromium sandboxing, TLS verification, CSP enforcement, popup blocking, dialog dismissal, download blocking, service-worker blocking, and WebSocket restrictions remain active

## 0.4.0 - 2026-07-02

### Added

- `evaluate` command with `compare` alias
- candidate route rendering against verified AppSpec evidence
- bounded visual similarity scoring and route-level heatmaps
- observable structure scoring for titles, headings, links, buttons, forms, landmarks, and design tokens
- recorded navigation-flow verification
- overall and per-route pass/fail thresholds
- `evaluation.json`, `REPORT.md`, `CORRECTION_PLAN.md`, and `AGENT_FIX_PROMPT.md`
- content-addressed evaluation manifests
- evaluator unit and real Chromium integration coverage

### Security

- source evidence is verified before evaluation begins
- candidate URLs use the existing public/private network guard and request ceiling
- downloads, popups, dialogs, service workers, and WebSockets remain restricted
- candidate content remains untrusted evidence and is never executed as agent instructions
- evaluation manifests record the AppSpec digest rather than a local filesystem path
- Chromium sandbox remains enabled in application code and CI

## 0.3.0 - 2026-07-02

### Added

- same-origin breadth-first application crawling
- `crawl` CLI command with page, depth, request, delay, HTML, screenshot, and query controls
- route canonicalization with fragment removal, tracking-parameter removal, and static-asset filtering
- stable evidence filenames derived from canonical routes
- multi-screen AppSpec generation
- shared-component detection across captured routes
- structured navigation flows with source screen, trigger, and target screen
- route graph evidence stored at `evidence/route-graph.json`
- `SITE_MAP.md` and `ROUTE_GRAPH.json` agent exports
- multi-page integration coverage

### Changed

- AppSpec version advanced to 0.3.0
- evidence types now include `map`
- capture metadata records page count, failures, crawl limits, and screenshot methods
- export plans account for recorded routes and observed navigation flows
- request ceiling increased for bounded multi-page runs

### Security

- crawling remains same-origin and sequential
- external origins and common static assets are never queued
- every navigation still passes the existing URL and browser-request guards
- query strings are excluded by default to constrain route explosion

## 0.2.0 - 2026-07-02

- production hardening, strict AppSpec validation, bounded browser capture, evidence integrity verification, agent trust boundaries, expanded CI, dependency auditing, and operational documentation
