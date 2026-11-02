import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";

/**
 * True for loopback, RFC1918 and IPv6 unique-local addresses. Link-local
 * (169.254.0.0/16, fe80::/10) is deliberately rejected.
 */
export function isPrivateOrLoopback(address) {
  if (net.isIPv4(address)) {
    if (address === "0.0.0.0") return false;
    if (address.startsWith("127.")) return true;
    if (address.startsWith("10.")) return true;
    if (address.startsWith("192.168.")) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return true;
    return false;
  }
  const low = address.toLowerCase();
  if (low === "::1") return true;
  if (low === "::") return false;
  if (low.startsWith("::ffff:")) return isPrivateOrLoopback(low.slice("::ffff:".length));
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique-local
  return false; // public + link-local (fe80::/10) rejected
}

/**
 * A dns.lookup replacement that always answers with the address validated by
 * the caller. Pinning this at connect time is what closes the DNS-rebinding
 * window: the hostname is never resolved a second time by the socket.
 */
export function createPinnedLookup(address) {
  const family = net.isIP(address);
  return (hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options?.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

/**
 * Perform the outbound request against a pre-validated address while keeping
 * the original hostname for the Host header and TLS SNI.
 */
export function requestPinned(target, { method, headers, body, address } = {}) {
  const isHttps = target.protocol === "https:";
  const mod = isHttps ? https : http;
  const options = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: `${target.pathname}${target.search}`,
    method,
    headers,
    lookup: createPinnedLookup(address),
  };
  if (isHttps && !net.isIP(target.hostname)) {
    options.servername = target.hostname;
  }

  return new Promise((resolve, reject) => {
    const req = mod.request(options, resolve);
    req.on("error", reject);
    if (body) {
      const source = typeof body.pipe === "function" ? body : Readable.fromWeb(body);
      source.on("error", reject);
      source.pipe(req);
    } else {
      req.end();
    }
  });
}
