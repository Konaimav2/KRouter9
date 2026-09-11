import { describe, it, expect } from "vitest";
import { detectSoftError } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// The "200 trap": upstream answers HTTP 200 with an error/empty body. The
// non-streaming path must treat these as fallback-eligible failures.
describe("non-stream 200-trap detection", () => {
  it("flags an OpenAI error envelope on 200", () => {
    expect(detectSoftError({ error: { message: "overloaded" } }, FORMATS.OPENAI)).toBe("overloaded");
  });

  it("does NOT flag a non-message error field on an otherwise valid body (V7)", () => {
    const body = { choices: [{ message: { role: "assistant", content: "hi" } }], error: "warning: retry happened" };
    expect(detectSoftError(body, FORMATS.OPENAI)).toBeNull();
  });

  it("does NOT flag a bare string error with no object shape (V7)", () => {
    // Must be an explicit envelope; a stray string is not enough.
    expect(detectSoftError({ error: "capacity" }, FORMATS.OPENAI)).toBe("upstream returned no choices");
  });

  it("flags an Anthropic error envelope", () => {
    const body = { type: "error", error: { type: "overloaded_error", message: "busy" } };
    expect(detectSoftError(body, FORMATS.CLAUDE)).toBe("busy");
  });

  it("flags a failed Responses object", () => {
    const body = { object: "response", status: "failed", error: { message: "boom" } };
    expect(detectSoftError(body, FORMATS.OPENAI_RESPONSES)).toBe("boom");
  });

  it("flags chat body with no choices", () => {
    expect(detectSoftError({ id: "x", object: "chat.completion" }, FORMATS.OPENAI)).toBe("upstream returned no choices");
  });

  it("passes a normal completion", () => {
    const body = { choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }] };
    expect(detectSoftError(body, FORMATS.OPENAI)).toBeNull();
  });

  it("does not flag a valid Claude message (no choices field)", () => {
    const body = { type: "message", role: "assistant", content: [{ type: "text", text: "hi" }] };
    expect(detectSoftError(body, FORMATS.CLAUDE)).toBeNull();
  });

  it("does not reject non-chat payloads missing choices", () => {
    expect(detectSoftError({ output: [] }, FORMATS.OPENAI_RESPONSES)).toBeNull();
  });
});
