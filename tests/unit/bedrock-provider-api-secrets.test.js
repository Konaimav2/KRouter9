import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
const SESSION_TOKEN = "FwoGZX-saved-session-token";
const SECRET = "synthetic-secret-access-key";
let tempDir, list, create, detail, update, stored;
const request = (method, body) => new Request("https://router.local/api/providers", {
  method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
const context = (id) => ({ params: Promise.resolve({ id }) });
async function createAws(provider = "bedrock") {
  const response = await create(request("POST", { provider, name: `${provider} account`, apiKey: SECRET,
    providerSpecificData: { accessKeyId: "ASIAEXAMPLE", sessionToken: SESSION_TOKEN, region: "us-east-1" },
    connectionProxyEnabled: true, connectionProxyUrl: "http://user:proxy-secret@proxy.local:3128",
  }));
  expect(response.status).toBe(201);
  return response.json();
}
beforeEach(async () => {
  tempDir = fs.mkdtempSync("/tmp/opencode/bedrock-api-");
  process.env.DATA_DIR = tempDir;
  delete global._dbAdapter;
  vi.resetModules();
  ({ GET: list, POST: create } = await import("@/app/api/providers/route.js"));
  ({ GET: detail, PUT: update } = await import("@/app/api/providers/[id]/route.js"));
  ({ getProviderConnectionById: stored } = await import("@/models/index.js"));
});
afterEach(() => {
  global._dbAdapter?.instance?.close?.();
  delete global._dbAdapter;
  vi.resetModules();
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});
describe("Bedrock provider API secret boundaries", () => {
  it.each(["bedrock", "bedrock-xai"])("redacts %s credentials in create, both list modes, detail and update without mutating storage", async (provider) => {
    const created = await createAws(provider);
    const id = created.connection.id;
    const bodies = [created];
    for (const mode of ["", "?mode=full"]) {
      const response = await list(new Request(`https://router.local/api/providers${mode}`));
      expect(response.status).toBe(200);
      bodies.push(await response.json());
    }
    bodies.push(await (await detail(request("GET"), context(id))).json());
    bodies.push(await (await update(request("PUT", { name: "Renamed" }), context(id))).json());
    for (const body of bodies) {
      const serialized = JSON.stringify(body);
      for (const secret of [SECRET, SESSION_TOKEN, "proxy-secret"]) expect(serialized).not.toContain(secret);
    }
    expect(created.connection.providerSpecificData).toMatchObject({ accessKeyId: "ASIAEXAMPLE", region: "us-east-1" });
    expect(created.connection.providerSpecificData).not.toHaveProperty("sessionToken");
    expect(await stored(id)).toMatchObject({ apiKey: SECRET, providerSpecificData: { sessionToken: SESSION_TOKEN } });
  });
  it.each(["bedrock", "bedrock-xai"])("creates %s with a local AWS profile and no API key", async (provider) => {
    const response = await create(request("POST", { provider, name: "SSO", providerSpecificData: { profile: "my-sso-profile", region: "us-east-1" } }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(await stored(body.connection.id)).toMatchObject({ providerSpecificData: { profile: "my-sso-profile" } });
  });
  it.each(["", "   ", 123, {}, []])("does not bypass the API-key requirement with an invalid profile %j", async (profile) => {
    const response = await create(request("POST", { provider: "bedrock", providerSpecificData: { profile } }));
    expect(response.status).toBe(400);
  });
  it("preserves a saved session token on blank edit, replaces it on entry, clears it only on null", async () => {
    const { connection } = await createAws();
    for (const [incoming, expected] of [["", SESSION_TOKEN], ["replacement-token", "replacement-token"], [null, undefined]]) {
      const response = await update(request("PUT", { providerSpecificData: { region: "us-west-2", sessionToken: incoming } }), context(connection.id));
      expect(response.status).toBe(200);
      expect(JSON.stringify(await response.json())).not.toContain(expected || "replacement-token");
      const saved = await stored(connection.id);
      expect(saved.providerSpecificData.region).toBe("us-west-2");
      expect(saved.providerSpecificData.sessionToken).toBe(expected);
      if (incoming === null) expect(saved.providerSpecificData).not.toHaveProperty("sessionToken");
    }
  });
  it("shares ordinary OAuth/API-key and proxy sanitization without mutating its input", async () => {
    const { toProviderConnectionResponse } = await import("@/lib/providerConnectionResponse.js");
    const connection = { provider: "bedrock", apiKey: SECRET, accessToken: "access-secret", refreshToken: "refresh-secret", idToken: "id-secret",
      providerSpecificData: { profile: "sso", sessionToken: SESSION_TOKEN, connectionProxyUrl: "http://u:proxy-secret@proxy.local" } };
    const safe = toProviderConnectionResponse(connection);
    expect(safe).not.toHaveProperty("apiKey");
    for (const key of ["accessToken", "refreshToken", "idToken"]) expect(safe).not.toHaveProperty(key);
    expect(safe.providerSpecificData).not.toHaveProperty("sessionToken");
    expect(safe.providerSpecificData).not.toHaveProperty("connectionProxyUrl");
    expect(safe.providerSpecificData.connectionProxyUrlMasked).not.toContain("proxy-secret");
    expect(connection.providerSpecificData.sessionToken).toBe(SESSION_TOKEN);
    expect(path.dirname(tempDir)).toBe("/tmp/opencode");
  });
});
