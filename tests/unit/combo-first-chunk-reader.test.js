import { describe, it, expect } from "vitest";
import { reenqueueFirstChunk } from "../../open-sse/handlers/chatCore/streamingHandler.js";

// Native ReadableStream runtime test for the combo first-chunk probe.
// Regression: the probe read the first chunk with getReader() but the
// re-wrap then called getReader() *again* on the same (locked) stream, which
// throws TypeError("ReadableStream is locked"). The fix reuses the original
// reader.
function sseStream(chunks) {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

async function drain(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

describe("combo first-chunk reenqueue", () => {
  it("reuses the locked reader instead of throwing", async () => {
    const src = sseStream(['data: {"a":1}\n\n', 'data: {"b":2}\n\n', "data: [DONE]\n\n"]);
    const reader = src.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);

    // Before the fix this line threw: ReadableStream is locked.
    const rewrapped = reenqueueFirstChunk(reader, first.value);

    // First chunk is preserved, remainder is drained.
    const text = await drain(rewrapped);
    expect(text).toContain('{"a":1}');
    expect(text).toContain('{"b":2}');
    expect(text).toContain("[DONE]");
  });

  it("does not throw when the source errors after the first chunk", async () => {
    const enc = new TextEncoder();
    let i = 0;
    const src = new ReadableStream({
      pull(controller) {
        if (i++ === 0) controller.enqueue(enc.encode("data: first\n\n"));
        else controller.error(new Error("upstream died"));
      },
    });
    const reader = src.getReader();
    const first = await reader.read();
    const rewrapped = reenqueueFirstChunk(reader, first.value);
    await expect(drain(rewrapped)).rejects.toThrow("upstream died");
  });

  it("cancel releases the underlying reader", async () => {
    const src = sseStream(['data: {"a":1}\n\n', 'data: {"b":2}\n\n']);
    const reader = src.getReader();
    const first = await reader.read();
    const rewrapped = reenqueueFirstChunk(reader, first.value);
    await rewrapped.cancel();
    // Source is now free — a fresh reader must be obtainable.
    expect(() => src.getReader()).not.toThrow();
  });

  it("does not produce an unhandled rejection when a pending read is abandoned", async () => {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      // A stream that never yields: read() stays pending.
      const src = new ReadableStream({ start() { /* never enqueue */ } });
      const reader = src.getReader();
      const readPromise = reader.read();
      readPromise.catch(() => {}); // mirror the production guard
      // Simulate the timeout path's abandon(): cancel then release.
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
