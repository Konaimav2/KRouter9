import http from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

let server;
let baseUrl;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("strict proxy refusal (FR-3)", () => {
  it("refuses direct egress when a bound proxy fails", async () => {
    let error;
    try {
      await proxyAwareFetch(`${baseUrl}/health`, { method: "GET" }, {
        connectionProxyEnabled: true,
        connectionProxyUrl: "http://127.0.0.1:9",
        connectionProxyPoolName: "QA dead egress",
        strictProxy: true,
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeTruthy();
    expect(error.code).toBe("PROXY_STRICT_FAILED");
    expect(error.status).toBe(503);
    expect(error.message).toContain("QA dead egress");
    expect(error.message).toContain("Refusing direct egress");
  });

  it("still falls back to direct when the pool is not strict", async () => {
    const res = await proxyAwareFetch(`${baseUrl}/health`, { method: "GET" }, {
      connectionProxyEnabled: true,
      connectionProxyUrl: "http://127.0.0.1:9",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
