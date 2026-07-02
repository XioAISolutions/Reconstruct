import test from "node:test";
import assert from "node:assert/strict";
import { assertAllowedUrl, isPublicIp } from "../src/security.js";

test("classifies public and non-public IPv4 addresses", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("1.1.1.1"), true);
  assert.equal(isPublicIp("127.0.0.1"), false);
  assert.equal(isPublicIp("10.1.2.3"), false);
  assert.equal(isPublicIp("169.254.169.254"), false);
  assert.equal(isPublicIp("192.168.1.1"), false);
  assert.equal(isPublicIp("100.64.0.1"), false);
  assert.equal(isPublicIp("203.0.113.10"), false);
});

test("classifies public and non-public IPv6 addresses", () => {
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("fc00::1"), false);
  assert.equal(isPublicIp("fe80::1"), false);
  assert.equal(isPublicIp("2001:db8::1"), false);
  assert.equal(isPublicIp("::ffff:127.0.0.1"), false);
});

test("blocks credentials, localhost, and private DNS answers", async () => {
  await assert.rejects(() => assertAllowedUrl("https://user:pass@example.com"), /credentials/);
  await assert.rejects(() => assertAllowedUrl("http://localhost"), /blocked/);
  await assert.rejects(() => assertAllowedUrl("https://tracker.example"), /blocked/);
  await assert.rejects(() => assertAllowedUrl("http://2130706433"), /blocked/);
  await assert.rejects(() => assertAllowedUrl("http://0x7f000001"), /blocked/);
  await assert.rejects(() => assertAllowedUrl("https://example.com", {
    resolver: async () => [{ address: "127.0.0.1", family: 4 }]
  }), /private or special-use/);
});

test("times out stalled DNS resolution", async () => {
  await assert.rejects(() => assertAllowedUrl("https://example.net", {
    dnsTimeoutMs: 10,
    resolver: async () => new Promise(() => {})
  }), /exceeded 10ms/);
});

test("allows public DNS answers and explicit private-network mode", async () => {
  const publicUrl = await assertAllowedUrl("https://example.com", {
    resolver: async () => [{ address: "93.184.216.34", family: 4 }]
  });
  assert.equal(publicUrl.hostname, "example.com");
  const local = await assertAllowedUrl("http://127.0.0.1:3000", { allowPrivateNetwork: true });
  assert.equal(local.hostname, "127.0.0.1");
});
