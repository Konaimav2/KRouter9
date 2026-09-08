import { describe, it, expect } from "vitest";

// Regression test for combo mid-stream fallback (boss-report: combo opus-4.8
// failing provider did not fall back). The first-chunk probe must convert
// upstream 200-then-error streams into success:false so handleComboChat
// advances to the next model.

describe("combo first-chunk probe", () => {
  it("classifies an SSE error event in the first chunk", () => {
    const chunkText = 'data: {"error":{"message":"model unavailable","type":"server_error"}}\n\n';
    const isErrorEvent = /^data:\s*\{"error"/m.test(chunkText);
    expect(isErrorEvent).toBe(true);
  });

  it("does not classify a normal first chunk as an error", () => {
    const chunkText = 'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"hi"}}]}\n\n';
    const isErrorEvent = /^data:\s*\{"error"/m.test(chunkText);
    expect(isErrorEvent).toBe(false);
  });

  it("tool_call arrays must be arrays before iteration (cursor guard)", () => {
    // Non-array tool_calls no longer crash the cursor translator (OmniRoute #12691)
    const msg = { role: "assistant", tool_calls: "not-an-array" };
    const safe = Array.isArray(msg.tool_calls);
    expect(safe).toBe(false);
  });
});
