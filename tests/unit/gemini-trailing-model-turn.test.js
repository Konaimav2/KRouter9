import { describe, it, expect } from "vitest";
import { openaiToAntigravityRequest } from "../../open-sse/translator/request/openai-to-gemini.js";

// Gemini / Antigravity reject a conversation whose final turn belongs to the model:
// "Requests ending with a model turn are not supported." Clients that prefill, or agents
// that replay a trailing assistant message, hit this on every request. The translator now
// closes such a conversation with a neutral user turn.

const build = (messages) =>
  openaiToAntigravityRequest("gemini-3.5-flash-low", { messages, max_tokens: 16 }, false);

const contentsOf = (out) => out?.request?.contents || out?.contents || [];

describe("Gemini request normalisation — trailing model turn", () => {
  it("closes a model-ending conversation with a user turn", () => {
    const contents = contentsOf(build([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]));

    expect(contents.length).toBeGreaterThanOrEqual(2);
    expect(contents.at(-1).role).toBe("user");
    expect(contents.at(-1).parts?.length).toBeGreaterThan(0);
  });

  it("leaves a user-ending conversation untouched", () => {
    const contents = contentsOf(build([{ role: "user", content: "only turn" }]));

    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe("user");
  });

  it("does not append twice when the tail is already a user turn after merging", () => {
    const contents = contentsOf(build([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]));

    expect(contents.at(-1).role).toBe("user");
    expect(contents).toHaveLength(3);
  });
});
