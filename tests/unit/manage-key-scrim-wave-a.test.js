import React from "react";
import PropTypes from "prop-types";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it, vi } from "vitest";
import { handleOverlayKey } from "../../src/shared/components/overlays/OverlayCore.jsx";
const states = []; let cursor = 0;
const hooks = { ...React, useState: (v) => { const i = cursor++; if (!(i in states)) states[i] = v; return [states[i], (n) => { states[i] = typeof n === "function" ? n(states[i]) : n; }]; } };
const stub = () => null;
const dialogStub = () => null;
const confirmStub = () => null;
const mocks = { react: hooks, "prop-types": { __esModule: true, default: PropTypes }, "@/shared/components/Icon": { __esModule: true, default: stub }, "@/shared/components": { Button: stub, Input: stub, Select: stub, Toggle: stub }, "@/shared/components/overlays": { Dialog: dialogStub, ConfirmDialog: confirmStub } };
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
  it("Escape uses the same dirty check, never saves or rotates, and permits keeping edits", () => {
    states.length = 0; const close = vi.fn(); const save = vi.fn(); const rotate = vi.fn();
    const render = () => { cursor = 0; return mod.exports.default({ apiKey: { id: "fixture", name: "Fixture" }, onClose: close, onSaved: save, onRotated: rotate }); };
    const escape = () => handleOverlayKey({ key: "Escape", preventDefault() {}, stopPropagation() {} }, null, find(render(), n => n.type === mocks["@/shared/components/overlays"].Dialog).props.onDismiss);
    escape(); expect(close).toHaveBeenCalledOnce();
    states[0] = "Dirty"; escape(); expect(close).toHaveBeenCalledOnce();
    const confirm = () => find(render(), n => n.type === mocks["@/shared/components/overlays"].ConfirmDialog);
    expect(confirm().props.open).toBe(true);
    confirm().props.onCancel(); expect(confirm().props.open).toBe(false);
    expect(states[0]).toBe("Dirty"); escape(); confirm().props.onConfirm();
    expect(close).toHaveBeenCalledTimes(2); expect(save).not.toHaveBeenCalled(); expect(rotate).not.toHaveBeenCalled();
  });
});
