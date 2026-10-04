import { describe, it, expect, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  execSync: vi.fn(() => { throw new Error("not found"); }),
  execFileSync: vi.fn(() => { throw new Error("no python"); }),
}));

vi.mock("child_process", () => ({
  execSync: mocks.execSync,
  execFileSync: mocks.execFileSync,
  spawn: vi.fn(),
}));

vi.mock("@/lib/dataDir.js", () => ({ DATA_DIR: "/tmp/u3c-headroom-test" }));

const { getHeadroomSetupState } = await import("../../src/lib/headroom/setup.js");

afterEach(() => {
  vi.clearAllMocks();
});

describe("U3c F13 RED: headroom one-click setup state", () => {
  it("reports needsSetup when CLI is not installed", async () => {
    global.fetch = vi.fn(async () => new Response("no", { status: 500 }));
    const state = await getHeadroomSetupState("http://localhost:8787");
    expect(state.installed).toBe(false);
    expect(state.action).toBe("setup");
    expect(state.canOneClickSetup).toBe(true);
  });

  it("reports start action when installed but stopped", async () => {
    mocks.execSync.mockImplementation((cmd) => {
      if (String(cmd).includes("which") || String(cmd).includes("where")) {
        return Buffer.from("/usr/local/bin/headroom\n");
      }
      if (String(cmd).includes("--version")) return Buffer.from("Python 3.12.0\n");
      throw new Error("unexpected");
    });
    global.fetch = vi.fn(async () => new Response("no", { status: 500 }));
    const state = await getHeadroomSetupState("http://localhost:8787");
    expect(state.installed).toBe(true);
    expect(state.running).toBe(false);
    expect(state.action).toBe("start");
  });

  it("reports running with disabled setup/start (idempotent re-click)", async () => {
    mocks.execSync.mockImplementation((cmd) => {
      if (String(cmd).includes("which") || String(cmd).includes("where")) {
        return Buffer.from("/usr/local/bin/headroom\n");
      }
      if (String(cmd).includes("--version")) return Buffer.from("Python 3.12.0\n");
      throw new Error("unexpected");
    });
    global.fetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const state = await getHeadroomSetupState("http://localhost:8787");
    expect(state.running).toBe(true);
    expect(state.action).toBe("none");
    expect(state.setupDisabled).toBe(true);
    expect(state.startDisabled).toBe(true);
  });
});
