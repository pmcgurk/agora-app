import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Webhooks make the server call an address the creator typed in. Left unchecked, that address could be this
// machine's own database, the storage service, or a cloud provider's metadata endpoint (169.254.169.254, which
// hands out credentials), so by default only public addresses are allowed. Someone who runs their own
// automation next to Agora can opt in with WEBHOOK_ALLOW_PRIVATE=true.

export const allowPrivateTargets = (): boolean => process.env.WEBHOOK_ALLOW_PRIVATE === "true";

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

// True for loopback, private, link-local, shared (carrier-grade NAT), documentation, multicast and other
// addresses that are not on the public internet.
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b, c] = ipv4Parts(ip)!;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (isIP(ip) === 6) {
    // An IPv4 address written inside IPv6 (::ffff:127.0.0.1, or ::ffff:7f00:1) is judged as that IPv4 address.
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return (
      ip === "::" ||
      ip === "::1" ||
      /^f[cd]/.test(ip) || // fc00::/7 unique local
      /^fe[89ab]/.test(ip) || // fe80::/10 link-local
      /^ff/.test(ip) || // multicast
      ip.startsWith("2001:db8") // documentation
    );
  }
  return true; // not an address at all: refuse
}

// Throws a readable error if the URL points at (or its name resolves to) a non-public address.
export async function assertPublicTarget(url: string): Promise<void> {
  if (allowPrivateTargets()) return;
  const hostname = new URL(url).hostname;
  const literal = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(literal) ? [literal] : (await lookup(hostname, { all: true, verbatim: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0) throw new Error("That address could not be found.");
  if (addresses.some(isPrivateAddress)) {
    throw new Error("That address is on a private network. Webhooks may only call public addresses (set WEBHOOK_ALLOW_PRIVATE=true to allow private ones).");
  }
}
