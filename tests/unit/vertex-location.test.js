import { expect, it } from "vitest";
import { VertexExecutor } from "../../open-sse/executors/vertex.js";
it.each([false, true])("scopes API keys (stream=%s)", stream => {
  const url = new URL(new VertexExecutor().buildUrl("gemini-4-argon", stream, 0, { apiKey: "key", providerSpecificData: { projectId: "project", location: "global" } }));
  expect(url.pathname).toBe(`/v1/projects/project/locations/global/publishers/google/models/gemini-4-argon:${stream ? "streamGenerateContent" : "generateContent"}`);
  expect(url.searchParams.get("key")).toBe("key");
  expect(url.searchParams.get("alt")).toBe(stream ? "sse" : null);
});
it.each(["gemini-4-argon", "gemini-4-argon(high)"])("defaults OAuth %s to global", model => {
  expect(new VertexExecutor().buildUrl(model, false, 0, { accessToken: "token", providerSpecificData: { projectId: "project" } })).toContain("/locations/global/");
});
it("defaults project-scoped API keys to global and honors explicit locations", () => {
  const executor = new VertexExecutor();
  expect(executor.buildUrl("gemini-4-argon", false, 0, { apiKey: "key", providerSpecificData: { projectId: "project" } })).toContain("/locations/global/");
  expect(executor.buildUrl("gemini-2.5-flash", false, 0, { apiKey: "key", providerSpecificData: { projectId: "project", location: "eu" } })).toContain("/locations/eu/");
});
it("preserves projectless API keys, OAuth regional bearer auth and partner endpoint", () => {
  const executor = new VertexExecutor();
  expect(executor.buildUrl("gemini-2.5-flash", false, 0, { apiKey: "key" })).toBe("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=key");
  const credentials = { accessToken: "token", providerSpecificData: { projectId: "project", location: "us-central1" } };
  const url = new URL(executor.buildUrl("gemini-2.5-flash", false, 0, credentials));
  expect(url.pathname).toContain("/locations/us-central1/");
  expect(url.searchParams.has("key")).toBe(false);
  expect(executor.buildHeaders(credentials, false).Authorization).toBe("Bearer token");
  expect(new VertexExecutor("vertex-partner").buildUrl("partner", false, 0, { apiKey: "key", providerSpecificData: { projectId: "project", location: "eu" } })).toBe("https://aiplatform.googleapis.com/v1/projects/project/locations/global/endpoints/openapi/chat/completions?key=key");
});
