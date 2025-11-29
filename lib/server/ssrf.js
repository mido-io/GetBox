
import dns from "dns/promises";

const PRIVATE_RANGES = [
  // IPv4
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  // IPv6
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^fec0:/,
  /^::ffff:127\./, // IPv4-mapped loopback
];

export async function isAllowedUrl(raw) {
  try {
    if (!raw) return false;
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const host = u.hostname;

    // 1. Direct IP check (IPv4 & IPv6)
    // Simple regex for IPv4
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      for (const re of PRIVATE_RANGES) if (re.test(host)) return false;
      return true;
    }
    // Simple regex for IPv6 (contains colon)
    if (host.includes(':')) {
      for (const re of PRIVATE_RANGES) if (re.test(host)) return false;
      // If it's a raw IPv6 literal, we might want to be careful, but usually safe if not private
      return true;
    }

    // 2. DNS Resolution (Anti-Rebinding)
    // We resolve the hostname to ALL addresses and check EACH one.
    // If ANY address is private, we block the request to be safe.
    const addresses = await dns.lookup(host, { all: true });

    if (!addresses || addresses.length === 0) return false;

    for (const addr of addresses) {
      const ip = addr.address;
      for (const re of PRIVATE_RANGES) {
        if (re.test(ip)) {
          console.warn(`SSRF Blocked: ${host} resolved to private IP ${ip}`);
          return false;
        }
      }
    }

    return true;
  } catch (e) {
    // If DNS fails or URL is invalid, deny
    console.error("SSRF Check Error:", e.message);
    return false;
  }
}
