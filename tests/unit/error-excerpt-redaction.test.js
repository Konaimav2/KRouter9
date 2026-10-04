import { describe, expect, it } from "vitest";
import { errorExcerptOf } from "@/app/(dashboard)/dashboard/usage/components/usageMeta.js";

const expectRedacted = (input, secrets) => {
  const output = errorExcerptOf(input);
  expect(output).toContain("[REDACTED");
  for (const secret of secrets) expect(output).not.toContain(secret);
};

describe("request-detail error excerpt redaction", () => {
  it("redacts key-shaped credentials", () => {
    expectRedacted("upstream rejected sk-live_abcdefghijklmnopqrstuvwxyz", ["sk-live_abcdefghijklmnopqrstuvwxyz"]);
    expectRedacted("authorization: Bearer abcdefghijklmnopqrstuvwxyz", ["abcdefghijklmnopqrstuvwxyz"]);
  });

  it("redacts provider-prefixed and contextual high-entropy credentials", () => {
    expectRedacted("upstream rejected gsk_abcdefghijklmnopqrstuvwxyz123456", ["gsk_abcdefghijklmnopqrstuvwxyz123456"]);
    expectRedacted("upstream rejected xai-abcdefghijklmnopqrstuvwxyz123456", ["xai-abcdefghijklmnopqrstuvwxyz123456"]);
    expectRedacted("upstream rejected tvo-abcdefghijklmnopqrstuvwxyz123456", ["tvo-abcdefghijklmnopqrstuvwxyz123456"]);
    expectRedacted("auth AbCdEf0123456789_-AbCdEf", ["AbCdEf0123456789_-AbCdEf"]);
  });

  it("redacts credentials in quoted JSON properties", () => {
    expectRedacted('credentials {"apiKey":"plaincredentialvalue123456"}', ["plaincredentialvalue123456"]);
    expectRedacted("credentials {'api_key' : 'anothercredentialvalue123456'}", ["anothercredentialvalue123456"]);
  });

  it("does not treat ordinary long text, URLs, model ids, or UUIDs as credentials", () => {
    const unchanged = [
      "ThisisalongplainEnglishwordwithoutsecrets",
      "model anthropic/claude-sonnet-4-20250514",
      "request 123e4567-e89b-12d3-a456-426614174000",
    ];
    for (const message of unchanged) expect(errorExcerptOf(message)).toBe(message);
    expect(errorExcerptOf("documentation https://example.com/guides/getting-started"))
      .toBe("documentation [REDACTED_URL]");
  });

  it("redacts URLs with authentication before truncation", () => {
    expectRedacted(
      "connect failed https://alice:correct-horse@private-relay.example:8443/path?token=secret",
      ["alice", "correct-horse", "private-relay.example", "secret"],
    );
  });

  it("redacts proxy hosts and IP excerpts", () => {
    expectRedacted("proxy gateway.proxy.internal refused 10.24.8.91:8080", ["gateway.proxy.internal", "10.24.8.91", "8080"]);
  });

  it("leaves clean operational messages unchanged", () => {
    expect(errorExcerptOf("Rate limit exceeded; retry later")).toBe("Rate limit exceeded; retry later");
  });
});
