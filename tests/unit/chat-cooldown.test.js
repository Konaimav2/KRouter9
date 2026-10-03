import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sourceUrl = new URL("../../src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const helperSource = source.match(/export function canCreateChat\([^]*?\n\}/)?.[0];

if (!helperSource) throw new Error("canCreateChat helper is not exported");

const canCreateChat = Function(`${helperSource.replace("export ", "")}\nreturn canCreateChat;`)();

function createGate({ cooldownMs = 3000 } = {}) {
  let lastCreatedAtMs = 0;
  let inFlight = false;
  let allowed = 0;

  return {
    attempt(nowMs) {
      if (inFlight || !canCreateChat(lastCreatedAtMs, nowMs, cooldownMs)) return false;
      inFlight = true;
      lastCreatedAtMs = nowMs;
      allowed += 1;
      return true;
    },
    settle() {
      inFlight = false;
    },
    count() {
      return allowed;
    },
  };
}

describe("chat creation cooldown", () => {
  it("allows only one of two invocations within the cooldown", () => {
    const gate = createGate();

    expect(gate.attempt(10_000)).toBe(true);
    gate.settle();
    expect(gate.attempt(10_001)).toBe(false);
    expect(gate.count()).toBe(1);
  });

  it("allows another creation once the cooldown has elapsed", () => {
    const gate = createGate();

    expect(gate.attempt(10_000)).toBe(true);
    gate.settle();
    expect(gate.attempt(13_000)).toBe(true);
    expect(gate.count()).toBe(2);
  });

  it("blocks while creation is in flight regardless of elapsed time", () => {
    const gate = createGate();

    expect(gate.attempt(10_000)).toBe(true);
    expect(gate.attempt(20_000)).toBe(false);
    expect(gate.count()).toBe(1);
  });
});
