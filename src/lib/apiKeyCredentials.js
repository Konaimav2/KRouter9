// One pure credential-source contract shared by middleware, inference and
// discovery. null means genuinely absent; "" means explicitly invalid/empty.
export function extractApiKey(request) {
  if (!request) return null;
  const authorization = request.headers.get("Authorization");
  if (authorization !== null) {
    const match = /^Bearer (\S+)$/.exec(authorization);
    return match ? match[1] : "";
  }
  for (const name of ["x-api-key", "x-goog-api-key"]) {
    const value = request.headers.get(name);
    if (value !== null) return value.trim() && !/\s/.test(value) ? value : "";
  }
  const params = request.nextUrl?.searchParams || (request.url ? new URL(request.url).searchParams : null);
  if (!params?.has("key")) return null;
  const key = params.get("key");
  return key?.trim() && !/\s/.test(key) ? key : "";
}
