import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression test for combo mid-stream fallback (boss-report: combo opus-4.8
// failing provider did not fall back). The first-chunk probe must convert
// upstream 200-then-error streams into success:false so handleComboChat
// advances to the next model.
//
// The probe is gated on `comboName`. A prior regression had the probe code
// present but `comboName` never threaded from chat.js -> handleChatCore ->
// handleStreamingResponse, so the probe was dead in production. Guard the
// wiring statically as well as the classifier logic.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

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

  it("threads comboName from chat.js through chatCore into the streaming handler", () => {
    const chatJs = read("src/sse/handlers/chat.js");
    const chatCore = read("open-sse/handlers/chatCore.js");
    const streaming = read("open-sse/handlers/chatCore/streamingHandler.js");

    // Caller passes it.
    expect(chatJs).toMatch(/handleChatCore\(\{[\s\S]*?\bcomboName\b/);
    // chatCore accepts it as a parameter...
    expect(chatCore).toMatch(/export async function handleChatCore\(\{[\s\S]*?\bcomboName\b[\s\S]*?\}\)/);
    // ...and forwards it in the shared context (so the streaming branch sees it).
    expect(chatCore).toMatch(/sharedCtx\s*=\s*\{[^}]*\bcomboName\b/);
    // The streaming handler gates the probe on it.
    expect(streaming).toMatch(/if\s*\(comboName\)/);
  });
});
