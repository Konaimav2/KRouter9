import { describe, it, expect } from "vitest";
import { createResponsesApiTransformStream } from "../../open-sse/transformer/responsesTransformer.js";
import { createStreamDecoder } from "../../open-sse/utils/streamTextDecoder.js";

async function runThrough(chunks) {
  const ts = createResponsesApiTransformStream(null);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = ts.readable.getReader();
  const writer = ts.writable.getWriter();
  const pump = (async () => {
    for (const c of chunks) await writer.write(typeof c === "string" ? enc.encode(c) : c);
    await writer.close();
  })();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  await pump;
  return out;
}

function sseLine(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe("streaming UTF-8 decode", () => {
  it("shared decoder keeps multibyte chars split across chunks", () => {
    const d = createStreamDecoder();
    const enc = new TextEncoder();
    const bytes = enc.encode("日本語テスト🎉");
    const a = d.decode(bytes.slice(0, 5));
    const b = d.decode(bytes.slice(5)) + d.flush();
    expect(a + b).toBe("日本語テスト🎉");
    expect(a + b).not.toContain("�");
  });

  it("responses transformer preserves split multibyte content", async () => {
    const line = sseLine({ choices: [{ index: 0, delta: { content: "日本語テスト🎉" } }] });
    const bytes = new TextEncoder().encode(line);
    const mid = bytes.length - 5; // split inside the emoji byte sequence
    const out = await runThrough([bytes.slice(0, mid), bytes.slice(mid)]);
    expect(out).toContain("日本語テスト🎉");
    expect(out).not.toContain("�");
  });

  it("still emits normal ASCII deltas", async () => {
    const out = await runThrough([
      sseLine({ choices: [{ index: 0, delta: { content: "Hello" } }] }),
      sseLine({ choices: [{ index: 0, delta: { content: " world" } }] }),
    ]);
    expect(out).toContain("Hello");
    expect(out).toContain(" world");
  });
});

describe("caveman wenyan opt-in", () => {
  it("falls back to ultra without explicit opt-in", async () => {
    const { resolveCavemanLevel } = await import("../../open-sse/rtk/caveman.js");
    expect(resolveCavemanLevel("wenyan", {})).toBe("ultra");
    expect(resolveCavemanLevel("wenyan-ultra", {})).toBe("ultra");
    expect(resolveCavemanLevel("wenyan-lite", {})).toBe("ultra");
    expect(resolveCavemanLevel("full", {})).toBe("full");
    expect(resolveCavemanLevel("wenyan", { wenyanOptIn: true })).toBe("wenyan");
    expect(resolveCavemanLevel(["wenyan"], {})).toBeNull();
    expect(resolveCavemanLevel("__proto__", {})).toBeNull();
    expect(resolveCavemanLevel("nope", {})).toBeNull();
  });
});
