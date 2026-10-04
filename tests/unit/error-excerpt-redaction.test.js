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
