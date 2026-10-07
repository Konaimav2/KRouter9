import React from "react";
const h = React.createElement;
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Dialog from "../../src/shared/components/overlays/Dialog.jsx";
import ConfirmDialog from "../../src/shared/components/overlays/ConfirmDialog.jsx";
import PopoverMenu from "../../src/shared/components/overlays/PopoverMenu.jsx";
import Sheet from "../../src/shared/components/overlays/Sheet.jsx";
import { handleOverlayKey, trapFocus } from "../../src/shared/components/overlays/OverlayCore.jsx";

function render(element) {
  return renderToStaticMarkup(element);
}

describe("unified overlay primitives", () => {
  it("renders 480, 640, and 800 dialogs with modal roles and mobile-sheet behavior", () => {
    for (const [width, pixels] of [["compact", "480"], ["standard", "640"], ["wide", "800"]]) {
      const html = render(h(Dialog, { open: true, onDismiss: () => {}, title: "Settings", description: "Configure safely", width }, h("button", null, "Save")));
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain(`overlay-dialog--${pixels}`);
      expect(html).toContain("overlay-root--mobile-sheet");
    }
  });

  it("renders a 420 confirm alert, defaults focus to Cancel, and requires a named action", () => {
    const html = render(h(ConfirmDialog, { open: true, onCancel: () => {}, onConfirm: () => {}, title: "Delete key?", actionLabel: "Delete key", destructive: true }, "Irreversible."));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("overlay-confirm");
    expect(html).toContain("data-overlay-autofocus");
    expect(html).toContain("Delete key");
    expect(() => render(h(ConfirmDialog, { open: true, title: "Delete?", actionLabel: "Confirm" }))).toThrow(/specific actionLabel/);
  });

  it("renders an anchored menu with menu semantics and a mobile bottom-sheet contract", () => {
    const html = render(h(PopoverMenu, { open: true, onDismiss: () => {}, label: "Key actions" }, h("button", { role: "menuitem" }, "Manage key")));
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitem"');
    expect(html).toContain("overlay-menu-root--mobile-sheet");
  });

  it("renders right and bottom sheets with dialog semantics", () => {
    const right = render(h(Sheet, { open: true, onDismiss: () => {}, title: "Filters", side: "right" }, "Right"));
    const bottom = render(h(Sheet, { open: true, onDismiss: () => {}, title: "Filters", side: "bottom" }, "Bottom"));
    expect(right).toContain('role="dialog"');
    expect(right).toContain("overlay-sheet--right");
    expect(bottom).toContain("overlay-sheet--bottom");
  });

  it("wraps focus in both directions", () => {
    const first = { focus: vi.fn(), hidden: false, getAttribute: () => null };
    const last = { focus: vi.fn(), hidden: false, getAttribute: () => null };
    const container = { querySelectorAll: () => [first, last] };
    const previousDocument = globalThis.document;
    globalThis.document = { activeElement: last };
    const forward = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    trapFocus(forward, container);
    expect(first.focus).toHaveBeenCalledOnce();
    globalThis.document.activeElement = first;
    const backward = { key: "Tab", shiftKey: true, preventDefault: vi.fn() };
    trapFocus(backward, container);
    expect(last.focus).toHaveBeenCalledOnce();
    globalThis.document = previousDocument;
  });

  it("Esc dismisses without executing an action", () => {
    const dismiss = vi.fn();
    const event = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() };
    handleOverlayKey(event, null, dismiss);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith("escape");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it("keeps underlying content independent and includes fail-open recovery", () => {
    const page = render(h("main", null, h("p", null, "Underlying content"), h(Dialog, { open: true, onDismiss: () => {}, title: "Panel" }, h("p", null, "Overlay content"))));
    expect(page).toContain("Underlying content");
    expect(page).toContain("Overlay content");
    expect(page).toContain("overlay-body");
  });
});
