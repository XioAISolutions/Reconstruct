# Changelog

All notable changes to this project are documented here.

## 0.3.0 - Unreleased

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
