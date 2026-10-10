import React from "react";
import PropTypes from "prop-types";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it } from "vitest";
const states = []; let cursor = 0;
const hooks = { ...React, useState: (v) => { const i = cursor++; if (!(i in states)) states[i] = v; return [states[i], (n) => { states[i] = typeof n === "function" ? n(states[i]) : n; }]; } };
const stub = () => null;
const mocks = { react: hooks, "prop-types": { __esModule: true, default: PropTypes }, "@/shared/components/Icon": { __esModule: true, default: stub }, "@/shared/components": { Button: stub, Input: stub, Select: stub, Toggle: stub }, "@/shared/components/overlays": { Dialog: stub, ConfirmDialog: stub } };
const code = transformSync(readFileSync(process.env.WAVE_A_SCRIM_SOURCE || new URL("../../src/app/(dashboard)/dashboard/endpoint/components/ManageKeyModal.js", import.meta.url), "utf8"), { presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
const mod = { exports: {} };
new Function("require", "module", "exports", "React", code)((s) => { if (!mocks[s]) throw new Error(s); return mocks[s]; }, mod, mod.exports, hooks);
function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const r = find(child, predicate); if (r) return r; } return null; }
describe("Manage key scrim dirty-check", () => {
  it("routes clean and dirty scrim dismissal through the shared close guard", () => {
    states.length = 0; let closed = 0;
    const render = () => { cursor = 0; return mod.exports.default({ apiKey: { id: "fixture", name: "Fixture" }, onClose: () => closed++ }); };
    let tree = render(); let dialog = find(tree, (n) => n.type === mocks["@/shared/components/overlays"].Dialog);
    expect(dialog.props.dismissOnScrim).not.toBe(false);
    dialog.props.onDismiss(); expect(closed).toBe(1);
    states[0] = "Changed"; tree = render(); dialog = find(tree, (n) => n.type === mocks["@/shared/components/overlays"].Dialog);
    dialog.props.onDismiss(); expect(closed).toBe(1);
    tree = render(); expect(find(tree, (n) => n.type === mocks["@/shared/components/overlays"].ConfirmDialog).props.open).toBe(true);
  });
});
