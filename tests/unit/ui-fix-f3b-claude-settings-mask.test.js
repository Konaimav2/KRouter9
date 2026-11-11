// F3b: GET /api/cli-tools/claude-settings must never return the raw token from
// ~/.claude/settings.json; POST must never persist a masked echo over the real one.
// Fixtures use fake tokens and a temp HOME only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maskGatewayKey } from "@/lib/db/repos/apiKeysRepo.js";

const REAL = "sk-test-FAKE-f3b-real-token-0001";
const API_KEY = "sk-test-FAKE-f3b-api-key-0002";
let home, prevHome, route, settingsPath;

const post = (body) =>
  route.POST(new Request("http://x/api/cli-tools/claude-settings", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
const onDisk = () => JSON.parse(fs.readFileSync(settingsPath, "utf8"));

beforeEach(async () => {
  prevHome = process.env.HOME;
  home = fs.mkdtempSync(path.join(os.tmpdir(), "f3b-"));
  process.env.HOME = home;
  fs.mkdirSync(path.join(home, ".claude"));
  settingsPath = path.join(home, ".claude", "settings.json");
  fs.writeFileSync(settingsPath, JSON.stringify({
    theme: "dark",
    env: { ANTHROPIC_BASE_URL: "http://localhost:20128/v1", ANTHROPIC_AUTH_TOKEN: REAL, ANTHROPIC_API_KEY: API_KEY },
  }));
  route = await import("@/app/api/cli-tools/claude-settings/route.js");
});
afterEach(() => {
  process.env.HOME = prevHome;
  fs.rmSync(home, { recursive: true, force: true });
});

describe("claude-settings GET masks secrets", () => {
  it("returns masked token + hasToken, never the raw value", async () => {
    const res = await route.GET();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(REAL);
    expect(text).not.toContain(API_KEY);
    const data = JSON.parse(text);
    expect(data.hasToken).toBe(true);
    expect(data.settings.env.ANTHROPIC_AUTH_TOKEN).toBe(maskGatewayKey(REAL));
    expect(data.settings.env.ANTHROPIC_API_KEY).toBe(maskGatewayKey(API_KEY));
    expect(data.settings.env.ANTHROPIC_BASE_URL).toBe("http://localhost:20128/v1");
    expect(data.settings.theme).toBe("dark");
    expect(data.hasKRouter9).toBe(true);
  });

  it("hasToken is false when the file has no token", async () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ env: { ANTHROPIC_BASE_URL: "http://x/v1" } }));
    const data = await (await route.GET()).json();
    expect(data.hasToken).toBe(false);
    expect(data.settings.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });
});

describe("claude-settings POST never persists a masked value", () => {
  it("omitted token keeps the file token", async () => {
    await post({ env: { ANTHROPIC_BASE_URL: "http://localhost:20128" } });
    expect(onDisk().env.ANTHROPIC_AUTH_TOKEN).toBe(REAL);
  });

  it("masked echo of the current token is ignored", async () => {
    const res = await post({ env: { ANTHROPIC_AUTH_TOKEN: maskGatewayKey(REAL), ANTHROPIC_API_KEY: maskGatewayKey(API_KEY) } });
    expect(res.status).toBe(200);
    expect(onDisk().env.ANTHROPIC_AUTH_TOKEN).toBe(REAL);
    expect(onDisk().env.ANTHROPIC_API_KEY).toBe(API_KEY);
  });

  it("any bullet-masked or placeholder value is ignored", async () => {
    await post({ env: { ANTHROPIC_AUTH_TOKEN: "sk-tes•••••0001" } });
    await post({ env: { ANTHROPIC_AUTH_TOKEN: "????????" } });
    expect(onDisk().env.ANTHROPIC_AUTH_TOKEN).toBe(REAL);
  });

  it("a genuinely new token is still written", async () => {
    await post({ env: { ANTHROPIC_AUTH_TOKEN: "sk-test-FAKE-f3b-new-token-0003" } });
    expect(onDisk().env.ANTHROPIC_AUTH_TOKEN).toBe("sk-test-FAKE-f3b-new-token-0003");
  });
});
