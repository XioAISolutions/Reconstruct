import test from "node:test";
import assert from "node:assert/strict";
import { artifactNameForUrl, canonicalizeCrawlUrl, componentIdentity, discoverCrawlTargets, routeForUrl } from "../src/crawl.js";

test("canonicalizes same-origin routes and removes tracking parameters", () => {
  const url = canonicalizeCrawlUrl("/pricing/?utm_source=x&plan=pro#details", {
    baseUrl: "https://example.com/start",
    origin: "https://example.com",
    includeQuery: true
  });
  assert.equal(url.toString(), "https://example.com/pricing?plan=pro");
  assert.equal(routeForUrl(url, { includeQuery: true }), "/pricing?plan=pro");
});

test("rejects external origins and static assets", () => {
  assert.equal(canonicalizeCrawlUrl("https://other.example.net/page", { origin: "https://example.com" }), null);
  assert.equal(canonicalizeCrawlUrl("/manual.pdf", { baseUrl: "https://example.com", origin: "https://example.com" }), null);
});

test("discovers unique crawl targets", () => {
  const targets = discoverCrawlTargets([
    { href: "/about#team", text: "About" },
    { href: "/about?utm_source=x", text: "Duplicate" },
    { href: "mailto:test@example.com", text: "Email" },
    { href: "https://other.com", text: "External" }
  ], "https://example.com/", { origin: "https://example.com" });
  assert.deepEqual(targets, [{ url: "https://example.com/about", text: "About", visible: true }]);
});

test("creates stable artifact and component identities", () => {
  assert.equal(artifactNameForUrl("https://example.com/"), "home");
  assert.match(artifactNameForUrl("https://example.com/account/settings"), /^account-settings-[a-f0-9]{8}$/);
  assert.deepEqual(componentIdentity({ tag: "nav", id: "Primary Navigation" }), componentIdentity({ tag: "nav", id: "Primary Navigation" }));
});
