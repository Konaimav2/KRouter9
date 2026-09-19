import { describe, it, expect } from "vitest";
import {
  buildAbortedResponsesTerminalBytes,
  buildAbortedOpenAITerminalBytes,
  buildAbortedClaudeTerminalBytes,
} from "../../open-sse/utils/responsesStreamHelpers.js";
import { createErrorResult, unavailableResponse } from "../../open-sse/utils/error.js";

const dec = new TextDecoder();

describe("abort terminal bytes", () => {
  it("openai terminal carries a non-empty error + DONE", () => {
    const text = dec.decode(buildAbortedOpenAITerminalBytes("[prov/m] stream closed before completion"));
    expect(text).toContain('"error"');
    expect(text).toContain("[prov/m] stream closed before completion");
    expect(text).toContain("[DONE]");
    expect(text).not.toContain("�");
  });

  it("openai terminal defaults when message empty", () => {
    const text = dec.decode(buildAbortedOpenAITerminalBytes(""));
    expect(text).toContain("stream closed before completion");
  });

  it("claude terminal uses an event:error frame", () => {
    const text = dec.decode(buildAbortedClaudeTerminalBytes("boom"));
    expect(text).toContain("event: error");
    expect(text).toContain("boom");
  });

  it("responses terminal still intact", () => {
    const text = dec.decode(buildAbortedResponsesTerminalBytes());
    expect(text).toContain("response.failed");
    expect(text).toContain("[DONE]");
  });
});

describe("error envelope never empty (F7)", () => {
  it("createErrorResult falls back on empty message", async () => {
    for (const bad of ["", "   ", null, undefined]) {
      const r = createErrorResult(502, bad);
      expect(r.error.length).toBeGreaterThan(0);
      const body = await r.response.json();
      expect(body.error.message.length).toBeGreaterThan(0);
    }
  });

  it("unavailableResponse falls back on empty message", async () => {
    const r = unavailableResponse(503, "", new Date(Date.now() + 60000).toISOString(), "reset after 60s");
    const body = await r.json();
    expect(body.error.message.length).toBeGreaterThan(0);
    expect(body.error.message).toContain("reset after 60s");
  });
});
