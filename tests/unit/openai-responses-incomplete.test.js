/**
 * Regression: upstream `response.incomplete` (e.g. max_output_tokens burned
 * on reasoning, zero content items) must translate to finish_reason "length"
 * with usage — never a dead "stop" turn with empty text. Captured live from
 * muse-spark-1.3-contributor-free via the 9r path.
 */
import { describe, it, expect } from "vitest";
import { openaiResponsesToOpenAIResponse } from "../../open-sse/translator/response/openai-responses.js";

const INCOMPLETE_EVENT = {
  type: "response.incomplete",
  sequence_number: 3,
  response: {
    id: "resp_6ab0cd6aee1e1a72d12c4d9b",
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    usage: {
      input_tokens: 3938, output_tokens: 600, total_tokens: 4538,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 597 },
    },
  },
};

function freshState() {
  return { seq: 0, started: true, chatId: "chatcmpl-test", created: 1 };
}

describe("response.incomplete translation", () => {
  it("maps max_output_tokens exhaustion to finish_reason length + usage", () => {
    const out = openaiResponsesToOpenAIResponse(structuredClone(INCOMPLETE_EVENT), freshState());
    expect(out).toBeTruthy();
    expect(out.choices[0].finish_reason).toBe("length");
    expect(out.usage.prompt_tokens).toBe(3938);
    expect(out.usage.completion_tokens).toBe(600);
  });

  it("keeps tool_calls finish when calls were already emitted", () => {
    const state = { ...freshState(), toolCallIndex: 1 };
    const out = openaiResponsesToOpenAIResponse(structuredClone(INCOMPLETE_EVENT), state);
    expect(out.choices[0].finish_reason).toBe("tool_calls");
  });

  it("emits length only once on repeated incomplete events", () => {
    const state = freshState();
    const first = openaiResponsesToOpenAIResponse(structuredClone(INCOMPLETE_EVENT), state);
    const second = openaiResponsesToOpenAIResponse(structuredClone(INCOMPLETE_EVENT), state);
    expect(first.choices[0].finish_reason).toBe("length");
    expect(second).toBeNull();
  });
});
