import { describe, it, expect, vi } from "vitest";
import {
  revealKeyById,
  isKeyActionBlocked,
} from "@/lib/maskedKeyClient.js";

// Deferred fetch fixture: each reveal's HTTP response completes only when the
// test releases it, so overlapping reveals can complete in REVERSED order.
function deferredFetch() {
  const pending = {};
  const fn = vi.fn(
    (url) =>
      new Promise((resolve) => {
        pending[url] = resolve;
      })
  );
  const respond = (url, body) =>
    pending[url]({ ok: true, status: 200, async json() { return body; } });
  return { fn, respond };
}

describe("G4H RED: empty-list gate tracks loading/errors before emptiness", () => {
  it("blocks while the initial key list is still loading even when empty", () => {
    expect(
      isKeyActionBlocked({ keys: [], rawKey: "", resolving: false, error: "", loading: true })
    ).toBe(true);
  });

  it("blocks on list-load error before the emptiness check", () => {
    expect(
      isKeyActionBlocked({
        keys: [],
        rawKey: "",
        resolving: false,
        error: "",
        loading: false,
        keysError: "Failed to load API keys",
      })
    ).toBe(true);
  });

  it("blocks while a reveal is pending even when the list snapshot is empty", () => {
    expect(
      isKeyActionBlocked({ keys: [], rawKey: "", resolving: true, error: "" })
    ).toBe(true);
  });

  it("preserves manual entry: settled empty list with no error stays unblocked", () => {
    expect(
      isKeyActionBlocked({
        keys: [],
        rawKey: "",
        resolving: false,
        error: "",
        loading: false,
        keysError: "",
      })
    ).toBe(false);
  });
});

describe("G4H RED: stale reveals never cross-contaminate credentials", () => {
  it("overlapping reveals complete reversed, each resolves its own credential", async () => {
    const { fn, respond } = deferredFetch();
    const pA = revealKeyById("key-a", fn);
    const pB = revealKeyById("key-b", fn);
    // Reversed completion: B's HTTP response arrives first.
    respond("/api/keys/key-b/reveal?confirm=true", { key: "RAW-B" });
    respond("/api/keys/key-a/reveal?confirm=true", { key: "RAW-A" });
    const [a, b] = await Promise.all([pA, pB]);
    expect(a).toBe("RAW-A");
    expect(b).toBe("RAW-B");
    expect(a).not.toContain("RAW-B");
  });

  it("a slow first reveal resolving after a reselection must be ignorable by id binding", async () => {
    // Consumer-side binding contract: the credential is applied only when the
    // reveal id still matches the current selection at completion time.
    const { fn, respond } = deferredFetch();
    let appliedKey = "";
    let selectedId = "key-a";
    const boundReveal = (id) =>
      revealKeyById(id, fn).then((raw) => {
        if (id === selectedId) appliedKey = raw;
      });
    const pA = boundReveal("key-a");
    selectedId = "key-b"; // user reselects before A completes
    const pB = boundReveal("key-b");
    respond("/api/keys/key-b/reveal?confirm=true", { key: "RAW-B" });
    await pB;
    expect(appliedKey).toBe("RAW-B");
    respond("/api/keys/key-a/reveal?confirm=true", { key: "RAW-A-STALE" });
    await pA;
    expect(appliedKey).toBe("RAW-B");
  });
});
