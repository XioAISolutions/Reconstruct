import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UserInputError } from "./fs.js";

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
  ".test",
  ".example",
  ".invalid",
  ".arpa",
  ".onion"
];

function ipv4ToInt(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function inIpv4Cidr(value, base, prefix) {
  const valueInt = ipv4ToInt(value);
  const baseInt = ipv4ToInt(base);
  if (valueInt === null || baseInt === null) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (valueInt & mask) === (baseInt & mask);
}

function expandIpv6(address) {
  let input = address.toLowerCase().split("%")[0];
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    const ipv4 = input.slice(lastColon + 1);
    const value = ipv4ToInt(ipv4);
    if (value === null) return null;
    const high = ((value >>> 16) & 0xffff).toString(16);
    const low = (value & 0xffff).toString(16);
    input = `${input.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  if (left.length + right.length > 8) return null;
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return groups.map((part) => Number.parseInt(part, 16));
}

function ipv6ToBigInt(address) {
  const groups = expandIpv6(address);
  if (!groups) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function inIpv6Cidr(value, base, prefix) {
  const valueInt = ipv6ToBigInt(value);
  const baseInt = ipv6ToBigInt(base);
  if (valueInt === null || baseInt === null) return false;
  if (prefix === 0) return true;
  const shift = 128n - BigInt(prefix);
  return (valueInt >> shift) === (baseInt >> shift);
}

export function isPublicIp(address) {
  const version = isIP(address);
  if (version === 4) {
    const blocked = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.88.99.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4]
    ];
    return !blocked.some(([base, prefix]) => inIpv4Cidr(address, base, prefix));
  }

  if (version === 6) {
    const normalized = address.replace(/^\[|\]$/g, "");
    if (inIpv6Cidr(normalized, "::ffff:0:0", 96)) {
      const value = ipv6ToBigInt(normalized);
      const mapped = Number(value & 0xffffffffn);
      const ipv4 = `${(mapped >>> 24) & 255}.${(mapped >>> 16) & 255}.${(mapped >>> 8) & 255}.${mapped & 255}`;
      return isPublicIp(ipv4);
    }
    if (!inIpv6Cidr(normalized, "2000::", 3)) return false;
    const blocked = [
      ["2001::", 32],
      ["2001:10::", 28],
      ["2001:20::", 28],
      ["2001:db8::", 32],
      ["2002::", 16]
    ];
    return !blocked.some(([base, prefix]) => inIpv6Cidr(normalized, base, prefix));
  }

  return false;
}

function normalizedHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
}

export async function assertAllowedUrl(input, { allowPrivateNetwork = false, resolver = lookup, dnsTimeoutMs = 2_000 } = {}) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    throw new UserInputError(`Invalid URL: ${String(input)}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UserInputError(`Unsupported URL protocol: ${url.protocol}`);
  if (url.username || url.password) throw new UserInputError("URLs containing credentials are not accepted");
  const hostname = normalizedHostname(url);
  if (!hostname || hostname.length > 253) throw new UserInputError("Invalid URL hostname");
  if (hostname === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    if (!allowPrivateNetwork) throw new UserInputError(`Private or special-use hostname is blocked: ${hostname}`);
  }

  if (allowPrivateNetwork) return url;

  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new UserInputError(`Private or special-use IP address is blocked: ${hostname}`);
    return url;
  }

  let results;
  let timer;
  try {
    results = await Promise.race([
      resolver(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`DNS lookup exceeded ${dnsTimeoutMs}ms`)), dnsTimeoutMs);
      })
    ]);
  } catch (error) {
    throw new UserInputError(`Could not resolve ${hostname}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!Array.isArray(results) || results.length === 0) throw new UserInputError(`Hostname did not resolve: ${hostname}`);
  const blocked = results.map((entry) => entry.address).filter((address) => !isPublicIp(address));
  if (blocked.length) throw new UserInputError(`Hostname resolves to a private or special-use address: ${hostname}`);
  return url;
}

export function createRequestGuard({
  allowPrivateNetwork = false,
  maxRequests = 300,
  resolver = lookup,
  dnsTimeoutMs = 2_000,
  blockResourceTypes = new Set(["media"])
} = {}) {
  let requestCount = 0;
  let blockedCount = 0;
  let truncated = false;
  const hosts = new Set();

  return {
    async handle(route) {
      requestCount += 1;
      if (requestCount > maxRequests) {
        truncated = true;
        blockedCount += 1;
        await route.abort("blockedbyclient");
        return;
      }

      const request = route.request();
      if (blockResourceTypes.has(request.resourceType())) {
        blockedCount += 1;
        await route.abort("blockedbyclient");
        return;
      }

      const requestUrl = request.url();
      if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:") || requestUrl === "about:blank") {
        await route.continue();
        return;
      }

      try {
        const url = await assertAllowedUrl(requestUrl, { allowPrivateNetwork, resolver, dnsTimeoutMs });
        hosts.add(normalizedHostname(url));
        await route.continue();
      } catch {
        blockedCount += 1;
        await route.abort("blockedbyclient");
      }
    },
    snapshot() {
      return {
        requestCount,
        blockedCount,
        truncated,
        hosts: [...hosts].sort()
      };
    }
  };
}
