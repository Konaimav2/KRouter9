import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it, vi } from "vitest";

const sourcePath = new URL("../../src/app/(dashboard)/dashboard/quota/page.js", import.meta.url);
const compiledPage = transformSync(readFileSync(sourcePath, "utf8"), {
  filename: sourcePath.pathname,
  presets: [[presetReact, { runtime: "classic" }]],
  plugins: [transformModulesCommonjs],
}).code;

const ProviderLimits = vi.fn(({ sort }) => React.createElement(
  "section",
  { "aria-label": "Provider limits", "data-sort": sort },
  "Provider quota rows",
));

const moduleMocks = {
  react: React,
  "lucide-react": {
    ShieldCheck: (props) => React.createElement("svg", props),
  },
  "@/shared/components/Loading": {
    CardSkeleton: () => React.createElement("div", null, "Loading quota"),
  },
  "../usage/components/ProviderLimits": {
    __esModule: true,
    default: ProviderLimits,
  },
};

const pageModule = { exports: {} };
new Function("require", "module", "exports", "React", compiledPage)(
  (specifier) => {
    if (!(specifier in moduleMocks)) throw new Error(`Unexpected quota import: ${specifier}`);
    return moduleMocks[specifier];
  },
  pageModule,
  pageModule.exports,
  React,
);
const QuotaPage = pageModule.exports.default;

describe("quota dashboard surface", () => {
  it("renders the quota heading and masking assurance", () => {
    const html = renderToStaticMarkup(React.createElement(QuotaPage));

    expect(html).toContain(">Quota</h1>");
    expect(html).toContain("Accounts are ordered globally by their next reset.");
    expect(html).toContain("Account identities are masked by default");
    expect(html).toContain("Provider quota rows");
  });

  it("requests globally expiring-first provider limits", () => {
    ProviderLimits.mockClear();
    renderToStaticMarkup(React.createElement(QuotaPage));

    expect(ProviderLimits).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "expiring" }),
      undefined,
    );
  });
});
