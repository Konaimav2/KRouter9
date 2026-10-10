import React from "react";
import { readFileSync, existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it, vi } from "vitest";
import { CLI_TOOLS } from "../../src/shared/constants/cliTools.js";
const path = new URL("../../src/app/(dashboard)/dashboard/cli-tools/components/KRouter9ToolCard.js", import.meta.url);
describe("Wave C KRouter9 card", () => {
  it("is registered with its own card renderer", () => {
    expect(CLI_TOOLS.krouter9?.name).toBe("KRouter9");
    const detail = readFileSync(new URL("../../src/app/(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient.js", import.meta.url), "utf8");
    expect(detail).toMatch(/case "krouter9":\s*return <KRouter9ToolCard/);
  });
  it("offers download-review-run rather than curl piped to bash; copies no secrets", async () => {
    expect(existsSync(path)).toBe(true);
    const copied = [];
    const mocks = { react: { ...React, useState: (v) => [v, () => {}] }, "@/shared/components": { Button: ({ children, ...props }) => React.createElement("button", props, children) }, "@/shared/hooks/useCopyToClipboard": { useCopyToClipboard: () => ({ copy: vi.fn(async (text) => copied.push(text)) }) } };
    const mod = { exports: {} };
    const compiled = transformSync(readFileSync(path, "utf8"), { filename: path.pathname, presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
    new Function("require", "module", "exports", "React", compiled)((name) => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, mod, mod.exports, mocks.react);
    const tree = mod.exports.default({ apiKeys: [{ key: "synthetic-must-not-be-read" }], baseUrl: "https://user:synthetic@host.example.test" });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("https://raw.githubusercontent.com/Konaimav2/KRouter9/main/scripts/krouter9-setup.sh");
    expect(html).toContain("Review"); expect(html).not.toContain("synthetic"); expect(html).not.toMatch(/\|\s*bash/);
    function buttons(node) { if (!node || typeof node !== "object") return []; return [...(node.props?.onClick ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(buttons)]; }
    for (const button of buttons(tree)) await button.props.onClick();
    expect(copied.length).toBeGreaterThan(0); expect(copied.join("\n")).not.toContain("synthetic");
  });
});
