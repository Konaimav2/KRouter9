import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleComboChat, resetComboRotation } from "../../open-sse/services/combo.js";
const json = (data) => Response.json(data);
const log = { info() {}, warn() {} };
const filled = { choices: [{ message: { content: "next member" } }] };
beforeEach(() => resetComboRotation("wave1-empty"));
async function run(first, body = { stream: false }) {
  const handleSingleModel = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(json(filled));
  const response = await handleComboChat({ body, models: ["openai/first", "openai/second"], handleSingleModel, log, comboName: "wave1-empty", comboStrategy: "fallback" });
  return { response, handleSingleModel };
}

describe("E non-streaming zero-content combo fallback", () => {
  it.each([
    { choices: [] },
    { choices: [{ message: { content: "  " }, finish_reason: "stop" }] },
    { choices: [{ message: { content: null }, finish_reason: "incomplete" }] },
    { choices: [{ message: { content: [{ type: "text", text: "" }] } }] },
    { content: [], stop_reason: "end_turn" },
    { content: [{ type: "text", text: " " }] },
    { object: "response", output: [], status: "completed" },
  ])("advances past empty %j", async (empty) => {
    const { response, handleSingleModel } = await run(json(empty));
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
    expect(await response.json()).toEqual(filled);
  });
  it.each([
    filled,
    { choices: [{ message: { tool_calls: [{ id: "call", function: { name: "f", arguments: "{}" } }] } }] },
    { choices: [{ message: { reasoning_content: "thinking" } }] },
    { choices: [{ message: { reasoning: "thinking" } }] },
    { choices: [{ message: { content: "" } }, { message: { content: "second choice" } }] },
    { content: [{ type: "tool_use", id: "call", name: "f", input: {} }] },
    { content: [{ type: "thinking", thinking: "reasoning" }] },
    { object: "response", output: [{ type: "message", content: [{ type: "output_text", text: "hello" }] }] },
    { object: "response", output: [{ type: "function_call", name: "f", arguments: "{}" }] },
    { unrelated: "unknown response formats are not assumed empty" },
  ])("preserves usable or unknown %j", async (payload) => {
    const { response, handleSingleModel } = await run(json(payload));
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual(payload);
  });
  it("does not consume or retry streaming bytes", async () => {
    const bytes = "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\ndata: [DONE]\n\n";
    const { response, handleSingleModel } = await run(new Response(bytes, { headers: { "content-type": "text/event-stream" } }), { stream: true });
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe(bytes);
  });
  it("returns the final empty member untouched", async () => {
    const empty = { choices: [] };
    const handleSingleModel = vi.fn(async () => json(empty));
    const response = await handleComboChat({ body: { stream: false }, models: ["openai/only"], handleSingleModel, log, comboStrategy: "fallback" });
    expect(await response.json()).toEqual(empty);
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
  });
  it("preserves malformed JSON rather than misclassifying it", async () => {
    const { response, handleSingleModel } = await run(new Response("not JSON", { headers: { "content-type": "application/json" } }));
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("not JSON");
  });
});
