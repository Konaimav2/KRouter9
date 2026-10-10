import React from "react";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it } from "vitest";
const code = transformSync(readFileSync(new URL("../../src/app/(dashboard)/dashboard/endpoint/components/EndpointRow.js", import.meta.url), "utf8"), { presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
const mod = { exports: {} };
new Function("require", "module", "exports", "React", code)(() => ({ Check: () => null, Copy: () => null }), mod, mod.exports, React);
const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
function luminance(hex) { const channels = hex.match(/\w\w/g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return channels.reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0); }
function contrast(a,b) { const values = [luminance(a), luminance(b)].sort((x,y) => y-x); return (values[0]+.05)/(values[1]+.05); }
function themeColor(name, light) { const root = css.slice(css.indexOf(":root {"), css.indexOf(":root:not(.dark)")); const themed = light ? root + css.slice(css.indexOf(":root:not(.dark)"), css.indexOf("@theme")) : root; const matches = [...themed.matchAll(new RegExp(`--${name}:([^;]+);`, "g"))]; const value = matches.at(-1)[1]; return value.startsWith("var(") ? themeColor(value.slice(6,-1), light) : value.slice(1); }
describe("endpoint row disabled readability and actions layout", () => {
  it("uses the registered disabled text token", () => {
    const row = mod.exports.default({ label: "Cloudflare", status: "Off", disabled: true });
    const button = row.props.children[4].props.children[0];
    expect(button.props.disabled).toBe(true);
    expect(button.props.className).toContain("disabled:text-text-disabled");
  });
  it.each([false,true])("disabled text contrast is at least 4.5 for light=%s", light => {
    expect(contrast(themeColor("color-text-disabled", light), themeColor("color-surface", light))).toBeGreaterThanOrEqual(4.5);
  });
  it("lets actions wrap inside a minmax cell and keeps mobile stacked", () => {
    const row = mod.exports.default({ label: "Cloudflare" });
    expect(row.props.className).toContain("md:grid-cols-[7rem_8rem_minmax(0,1fr)_7rem_minmax(9rem,auto)]");
    expect(row.props.className).not.toMatch(/(?<!md:)grid-cols-/);
    expect(row.props.children[4].props.className).toContain("flex-wrap");
    expect(row.props.children[4].props.className).toContain("min-w-0");
  });
});
