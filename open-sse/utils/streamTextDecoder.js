// Shared streaming UTF-8 decoder. A single TextDecoder with { stream: true }
// must span all chunks of one stream; decoding each chunk independently
// replaces multibyte characters split across chunk boundaries with U+FFFD.
export function createStreamDecoder() {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return {
    decode(chunk) {
      if (typeof chunk === "string") return chunk;
      return decoder.decode(chunk, { stream: true });
    },
    flush() {
      return decoder.decode();
    },
  };
}
