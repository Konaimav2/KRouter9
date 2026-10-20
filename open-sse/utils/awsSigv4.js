import crypto from "node:crypto";
import { AWS_SIGV4 } from "../config/awsConstants.js";

/** RFC3986 escaping, including characters encodeURIComponent leaves unescaped. */
export function escapeUri(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function sha256Hex(payload) {
  return crypto.createHash("sha256").update(payload ?? "", "utf8").digest("hex");
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function canonicalPath(pathname, doubleEncodePath) {
  if (!doubleEncodePath) return pathname || "/";
  return (pathname || "/").split("/").map(escapeUri).join("/") || "/";
}

function canonicalizeHeaders(headers) {
  const entries = Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => [name.toLowerCase(), String(value).trim().replace(/\s+/g, " ")])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    canonicalHeaders: entries.map(([name, value]) => `${name}:${value}\n`).join(""),
    signedHeaders: entries.map(([name]) => name).join(";"),
  };
}

/**
 * Sign a query-less request using node:crypto only. URL paths must already be escaped
 * for the wire; non-S3 services require a second escaping pass in the canonical URI.
 * Returns the headers to send, including Authorization and any signed session token.
 */
export function signAwsRequest({
  method,
  url,
  headers = {},
  body = "",
  region,
  service,
  credentials,
  doubleEncodePath = true,
  date = new Date(),
}) {
  const { accessKeyId, secretAccessKey, sessionToken } = credentials || {};
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS SigV4 requires both accessKeyId and secretAccessKey");
  }
  const parsed = new URL(url);
  // Never silently sign a query using URLSearchParams' incompatible order/escaping.
  if (parsed.search) {
    throw new Error(
      "AWS SigV4 signing does not support query strings. Move the parameters into the " +
      "request body, or add proper query canonicalisation first.",
    );
  }
  const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const headersToSign = {
    ...headers,
    host: parsed.host,
    [AWS_SIGV4.dateHeader]: amzDate,
    ...(sessionToken ? { [AWS_SIGV4.securityTokenHeader]: sessionToken } : {}),
  };
  const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headersToSign);
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalPath(parsed.pathname, doubleEncodePath),
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/${AWS_SIGV4.terminator}`;
  const stringToSign = [
    AWS_SIGV4.algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = [dateStamp, region, service, AWS_SIGV4.terminator].reduce(
    (key, part) => hmac(key, part), `${AWS_SIGV4.keyPrefix}${secretAccessKey}`,
  );
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return {
    ...headersToSign,
    Authorization: `${AWS_SIGV4.algorithm} Credential=${accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
