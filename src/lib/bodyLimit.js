// Body-size guard ported from srouter (seaavey/SRouter, MIT)
export const MAX_BODY_BYTES = 25 * 1024 * 1024;

// Returns { ok:true } or { ok:false, error } based on Content-Length header.
// Chunked bodies without Content-Length pass here (validated downstream).
export function checkBodyLimit(contentLengthHeader, maxBytes = MAX_BODY_BYTES) {
  if (!contentLengthHeader) return { ok: true };
  const len = Number(contentLengthHeader);
  if (Number.isFinite(len) && len > maxBytes) {
    return { ok: false, error: "Request body too large", code: "request_too_large" };
  }
  return { ok: true };
}
