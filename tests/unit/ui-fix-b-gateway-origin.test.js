// Wave B (ui-fix plan, F11): curl and config snippets derive the gateway
// origin from the page (or NEXT_PUBLIC_BASE_URL) instead of a hardcoded
// 20128. The SSR-only fallback lives in exactly one place: gatewayOrigin.js.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const SRC = new URL("../../src/", import.meta.url);
const UTIL = "shared/utils/gatewayOrigin.js";
const DASH = "app/(dashboard)/dashboard/";
const B_FILES = [
  `${DASH}media-providers/combo/[id]/page.js`,
  `${DASH}media-providers/[kind]/[id]/components/SttExampleCard.js`,
  `${DASH}media-providers/[kind]/[id]/components/EmbeddingExampleCard.js`,
  `${DASH}media-providers/[kind]/[id]/components/GenericExampleCard.js`,
  `${DASH}media-providers/[kind]/[id]/components/TtsExampleCard.js`,
  `${DASH}cli-tools/components/MitmServerCard.js`,
  `${DASH}cli-tools/components/DefaultToolCard.js`,
  `${DASH}cli-tools/components/GrokBuildToolCard.js`,
  `${DASH}cli-tools/components/DeepSeekTuiToolCard.js`,
  `${DASH}cli-tools/components/HermesToolCard.js`,
  `${DASH}cli-tools/components/JcodeToolCard.js`,
  `${DASH}cli-tools/components/OpenClawToolCard.js`,
  `${DASH}cli-tools/[toolId]/ToolDetailClient.js`,
  "lib/maskedKeyClient.js",
];

async function load() {
  expect(existsSync(new URL(UTIL, SRC))).toBe(true);
  return import("@/shared/utils/gatewayOrigin.js");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Wave B F11: getGatewayOrigin", () => {
  it("returns the page origin on the client", async () => {
    const { getGatewayOrigin } = await load();
    vi.stubGlobal("window", { location: { origin: "http://10.0.0.5:8080" } });
    expect(getGatewayOrigin()).toBe("http://10.0.0.5:8080");
  });

  it("maps localhost to 127.0.0.1 when loopback is requested", async () => {
    const { getGatewayOrigin } = await load();
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    expect(getGatewayOrigin({ loopback: true })).toBe("http://127.0.0.1:3000");
    expect(getGatewayOrigin()).toBe("http://localhost:3000");
  });

  it("falls back to NEXT_PUBLIC_BASE_URL without a window (SSR)", async () => {
    const { getGatewayOrigin } = await load();
    vi.stubGlobal("window", undefined);
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://gateway.example.test:20140/");
    expect(getGatewayOrigin()).toBe("http://gateway.example.test:20140");
  });
});

describe("Wave B F11: no hardcoded 20128 left in B-owned files", () => {
  it.each(B_FILES)("%s has no localhost:20128 / 127.0.0.1:20128 literal", (file) => {
    const source = readFileSync(new URL(file, SRC), "utf8");
    expect(source).not.toMatch(/(localhost|127\.0\.0\.1):20128/);
  });

  it("the SSR fallback lives only in gatewayOrigin.js", () => {
    expect(existsSync(new URL(UTIL, SRC))).toBe(true);
    expect(readFileSync(new URL(UTIL, SRC), "utf8")).toMatch(/20128/);
  });
});
