// RED: non-streaming chat client -> Responses-API upstream (muse-spark)
// must return choices[0].message.content, not raw Responses JSON.
import { describe, it, expect } from "vitest";
import { translateNonStreamingResponse } from "../../open-sse/handlers/chatCore/nonStreamingHandler.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const RESPONSES_BODY = {
  id: "resp_123",
  object: "response",
  created_at: 1700000000,
  model: "muse-spark-1.3-contributor-free",
  status: "completed",
  background: false,
  error: null,
  output: [
    { type: "reasoning", summary: [{ type: "summary_text", text: "thinking..." }] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "OK", annotations: [] }] },
  ],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
};

describe("responses upstream -> chat client (non-streaming)", () => {
  it("converts text to choices[0].message.content", () => {
    const out = translateNonStreamingResponse(RESPONSES_BODY, FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI);
    expect(out.choices?.[0]?.message?.content).toBe("OK");
    expect(out.choices?.[0]?.finish_reason).toBe("stop");
  });
  it("maps usage to prompt/completion tokens", () => {
    const out = translateNonStreamingResponse(RESPONSES_BODY, FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI);
    expect(out.usage?.prompt_tokens).toBe(10);
    expect(out.usage?.completion_tokens).toBe(5);
  });
  it("converts function_call items to tool_calls", () => {
    const body = {
      ...RESPONSES_BODY,
      output: [
        { type: "function_call", call_id: "call_1", name: "get_weather", arguments: '{"city":"NYC"}' },
      ],
    };
    const out = translateNonStreamingResponse(body, FORMATS.OPENAI_RESPONSES, FORMATS.OPENAI);
    expect(out.choices?.[0]?.message?.tool_calls?.[0]?.function?.name).toBe("get_weather");
    expect(out.choices?.[0]?.finish_reason).toBe("tool_calls");
  });
  it("claude client gets a message body, not raw responses JSON", () => {
    const out = translateNonStreamingResponse(RESPONSES_BODY, FORMATS.OPENAI_RESPONSES, FORMATS.CLAUDE);
    expect(out.type).toBe("message");
    expect(JSON.stringify(out)).not.toContain('"object":"response"');
  });
});
