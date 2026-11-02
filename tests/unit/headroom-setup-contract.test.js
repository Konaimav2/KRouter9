import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HEADROOM_VERSION,
  HEADROOM_PORT,
  HEADROOM_IMAGE,
  HEADROOM_COMPRESSORS,
  buildHeadroomDockerfile,
  buildHeadroomRunCommand,
  headroomSampleMessages,
} from "../../src/shared/constants/headroom.js";

// The container flow is the one verified live on papi: pinned package, loopback-only
// publish, explicit acknowledgement for the in-container bind, structural compressors.
// These assertions keep the generated commands honest, and keep the UI wired to the
// SSRF-guarded proxy route rather than a direct browser call.

const UI = readFileSync(
  resolve(process.cwd(), "src/app/(dashboard)/dashboard/token-saver/TokenSaverClient.js"),
  "utf8"
);

describe("Headroom container setup constants", () => {
  it("pins the package version in both artifacts", () => {
    expect(buildHeadroomDockerfile()).toContain(`headroom-ai[proxy]==${HEADROOM_VERSION}`);
    expect(buildHeadroomRunCommand()).toContain(HEADROOM_IMAGE);
    expect(HEADROOM_IMAGE).toMatch(/^ghcr\.io\/konaimav2\/headroom:/);
  });

  it("publishes the port on loopback only", () => {
    const run = buildHeadroomRunCommand();
    expect(run).toContain(`-p 127.0.0.1:${HEADROOM_PORT}:${HEADROOM_PORT}`);
    expect(run).not.toMatch(/-p\s+0\.0\.0\.0:/);
    expect(run).not.toMatch(/-p\s+\d+:\d+/);
  });

  it("acknowledges the in-container bind explicitly", () => {
    expect(buildHeadroomRunCommand()).toContain("HEADROOM_ALLOW_UNAUTHENTICATED_BIND=1");
    expect(buildHeadroomDockerfile()).toContain("HEADROOM_ALLOW_UNAUTHENTICATED_BIND=1");
  });

  it("carries every structural compressor and no ML-only one", () => {
    const run = buildHeadroomRunCommand();
    for (const compressor of HEADROOM_COMPRESSORS) expect(run).toContain(compressor);
    expect(run).toContain("--no-subscription-tracking");
    expect(run).not.toContain("kompress");
  });

  it("produces a deterministic, non-empty sample payload", () => {
    const [message] = headroomSampleMessages();
    expect(message.role).toBe("user");
    expect(message.content.split("\n").length).toBeGreaterThan(10);
    expect(headroomSampleMessages()).toEqual(headroomSampleMessages());
  });
});

describe("Token Saver verification contract", () => {
  it("uses the published image and hides the container prompt once running", () => {
    expect(UI).toContain("HEADROOM_IMAGE");
    expect(UI).not.toContain("Copy Dockerfile");
    expect(UI).toContain("!headroomLocalUrl && !headroomRunning");
  });

  it("tests through the guarded dashboard proxy", () => {
    expect(UI).toContain("/api/headroom/proxy/v1/compress");
    expect(UI).not.toContain('fetch(`${headroomUrl}');
  });

  it("reports success and failure as text, not colour alone", () => {
    expect(UI).toContain('role="status"');
    expect(UI).toContain('role="alert"');
  });

  it("does not enable headroom from the test result", () => {
    const handler = UI.slice(
      UI.indexOf("handleVerifyService"),
      UI.indexOf("useEffect(() => {")
    );
    expect(handler).not.toContain("setHeadroomEnabled(true)");
    expect(handler).not.toContain("headroomEnabled: true");
  });
});
