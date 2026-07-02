# Crawling

Reconstruct uses a bounded same-origin breadth-first crawl.

## Discovery

Links are discovered from anchor elements after each page loads. Reconstruct removes fragments, strips common tracking parameters, normalizes trailing slashes, and ignores common static-file extensions.

The origin is fixed after the first successful page finishes redirecting. Links outside that origin are recorded neither as crawl targets nor as observed application flows.

## Limits

Defaults for `crawl`:

- 20 pages
- depth 3
- 2,000 total browser requests
- 30-second navigation timeout per page
- 250 ms between page navigations
- 2 MB sanitized HTML per page
- 12,000-pixel screenshot height per page

A crawl is marked truncated when a page, request, HTML, screenshot, or queue limit prevents complete collection.

## Query strings

Queries are ignored by default. This prevents faceted navigation, calendars, search pages, and tracking parameters from creating effectively infinite route sets.

`--include-query` retains non-tracking parameters and sorts them into a stable canonical order. Use it only when the query genuinely selects distinct application states.

## Behaviour not attempted

The crawler does not:

- submit forms
- click arbitrary buttons
- authenticate
- execute recorded user journeys
- bypass access controls
- cross origins
- infer hidden backend routes

Those capabilities require explicit authorized workflows and separate review.

## Politeness

Keep crawl limits low, use a delay, and operate only where authorized. Hosted deployments should add tenant quotas, target policies, concurrency controls, total network-byte limits, and worker-level egress filtering.
