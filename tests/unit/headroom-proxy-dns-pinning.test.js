import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { createPinnedLookup, isPrivateOrLoopback, requestPinned } from "../../src/lib/headroom/pinnedRequest.js";

describe("Headroom target validation", () => {
  it("accepts loopback, RFC1918 and unique-local addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.10", "172.16.0.1", "::1", "fc00::1", "fd12::34"]) {
      expect(isPrivateOrLoopback(address), address).toBe(true);
    }
  });

  it("rejects public, link-local and unspecified addresses", () => {
    for (const address of ["8.8.8.8", "169.254.169.254", "172.32.0.1", "0.0.0.0", "::", "fe80::1", "2606:4700::1111"]) {
      expect(isPrivateOrLoopback(address), address).toBe(false);
    }
  });
});

describe("pinned DNS lookup", () => {
  it("always answers with the validated address, never the hostname", () => {
    const lookup = createPinnedLookup("10.0.0.7");
    let result;
    lookup("rebind.example", {}, (error, address, family) => {
      expect(error).toBeNull();
      result = { address, family };
    });
    expect(result).toEqual({ address: "10.0.0.7", family: 4 });
  });

  it("supports the all:true form used by dual-stack callers", () => {
    const lookup = createPinnedLookup("::1");
    let result;
    lookup("rebind.example", { all: true }, (error, addresses) => {
      expect(error).toBeNull();
      result = addresses;
    });
    expect(result).toEqual([{ address: "::1", family: 6 }]);
  });
});

describe("requestPinned", () => {
  let server;
  let port;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ path: req.url, host: req.headers.host, body }));
        });
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ host: req.headers.host, path: req.url }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("connects to the validated address even when the hostname does not resolve", async () => {
    // rebind.invalid never resolves. If the socket performed its own lookup this fails.
    const target = new URL(`http://rebind.invalid:${port}/health`);
    const response = await requestPinned(target, {
      method: "GET",
      headers: {},
      address: "127.0.0.1",
    });
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(Buffer.concat(chunks).toString("utf8"))).toEqual({
      host: `rebind.invalid:${port}`,
      path: "/health",
    });
  });

  it("streams a request body to the pinned address", async () => {
    const target = new URL(`http://rebind.invalid:${port}/compress`);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"hello":"world"}'));
        controller.close();
      },
    });
    const response = await requestPinned(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      address: "127.0.0.1",
    });
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    expect(JSON.parse(Buffer.concat(chunks).toString("utf8"))).toEqual({
      path: "/compress",
      host: `rebind.invalid:${port}`,
      body: '{"hello":"world"}',
    });
  });
});
