import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The Change Log popup rendered CHANGELOG.md through marked() with no stylesheet at all:
// Tailwind's preflight strips heading sizes and list markers, so every release block looked
// like one flat paragraph. These assertions lock the reading hierarchy and the dialog
// semantics that make the menu usable.

const CSS = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const MODAL = readFileSync(
  new URL("../../src/shared/components/ChangelogModal.js", import.meta.url),
  "utf8"
);

function rule(selector) {
  const index = CSS.indexOf(selector);
  return index === -1 ? "" : CSS.slice(index, CSS.indexOf("}", index) + 1);
}

describe("change log menu readability", () => {
  it("gives the rendered changelog a heading hierarchy", () => {
    expect(rule(".changelog-body h1")).toMatch(/font-size:/);
    expect(rule(".changelog-body h2")).toMatch(/font-size:/);
    expect(rule(".changelog-body h3")).toMatch(/font-size:/);
    // The version heading must stay in view while its section scrolls.
    expect(rule(".changelog-body h2")).toMatch(/position:\s*sticky/);
  });

  it("restores list markers and readable spacing", () => {
    expect(CSS).toMatch(/\.changelog-body ul\s*\{[^}]*list-style:\s*disc/);
    expect(CSS).toMatch(/\.changelog-body li\s*\{[^}]*margin:/);
    expect(CSS).toMatch(/\.changelog-body p\s*\{[^}]*margin:/);
    expect(rule(".changelog-body")).toMatch(/line-height:/);
  });

  it("styles inline code and code blocks", () => {
    expect(rule(".changelog-body code")).toMatch(/font-family:/);
    expect(rule(".changelog-body pre")).toMatch(/overflow-x:\s*auto/);
  });

  it("uses the dialog semantics and a wider reading column", () => {
    expect(MODAL).toContain('role="dialog"');
    expect(MODAL).toContain("aria-modal");
    expect(MODAL).toMatch(/max-w-4xl/);
    expect(MODAL).toContain("changelog-body");
    expect(MODAL).toMatch(/overscroll-contain/);
  });

  it("keeps loading and error states visible", () => {
    expect(MODAL).toContain("Loading...");
    expect(MODAL).toContain('role="alert"');
  });
});
