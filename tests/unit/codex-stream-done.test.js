import { describe, expect, it } from "vitest";

import { FORMATS } from "../../open-sse/translator/formats.js";
import { createSSETransformStreamWithLogger } from "../../open-sse/utils/stream.js";
import { initTranslators } from "../../open-sse/translator/index.js";

await initTranslators();

// A codex upstream speaks the Responses API, but the downstream client asked for OpenAI
// chat completions. The translated stream used to close without "data: [DONE]" — the
// sentinel was only emitted when BOTH sides were Responses — so clients waited for a
// terminator that never arrived. Passthrough streams that already forwarded the sentinel
// then got a second one appended at flush.

async function runTransform({ input, targetFormat, sourceFormat, provider }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(input));
      controller.close();
    },
  });

  const output = stream.pipeThrough(
    createSSETransformStreamWithLogger(targetFormat, sourceFormat, provider, null, null, "test-model"),
  );

  const reader = output.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

const doneCount = (text) => (text.match(/data: \[DONE\]/g) || []).length;

describe("stream termination sentinel", () => {
  it("terminates a Responses→OpenAI translation with exactly one [DONE]", async () => {
    const input = [
      `event: response.created`,
      `data: ${JSON.stringify({ type: "response.created", response: { id: "resp_1", status: "in_progress" } })}`,
      "",
      `event: response.output_text.delta`,
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "hi" })}`,
      "",
      `event: response.completed`,
      `data: ${JSON.stringify({ type: "response.completed", response: { id: "resp_1", status: "completed" } })}`,
      "",
    ].join("\n");

    const output = await runTransform({
      input,
      targetFormat: FORMATS.OPENAI,
      sourceFormat: FORMATS.OPENAI_RESPONSES,
      provider: "codex",
    });

    expect(doneCount(output)).toBe(1);
    expect(output.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  it("does not append a second [DONE] when passthrough already forwarded one", async () => {
    const chunk = JSON.stringify({
      id: "chatcmpl_1",
      object: "chat.completion.chunk",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, delta: { content: "ok" }, finish_reason: null }],
    });

    const output = await runTransform({
      input: `data: ${chunk}\n\ndata: [DONE]\n\n`,
      targetFormat: FORMATS.OPENAI,
      sourceFormat: FORMATS.OPENAI,
      provider: "deepseek",
    });

    expect(output).toContain("chat.completion.chunk");
    expect(doneCount(output)).toBe(1);
  });

  it("still terminates a passthrough stream that never sent the sentinel", async () => {
    const chunk = JSON.stringify({
      id: "chatcmpl_2",
      object: "chat.completion.chunk",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }],
    });

    const output = await runTransform({
      input: `data: ${chunk}\n\n`,
      targetFormat: FORMATS.OPENAI,
      sourceFormat: FORMATS.OPENAI,
      provider: "deepseek",
    });

    expect(doneCount(output)).toBe(1);
  });
});
