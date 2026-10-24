// Combo model picker contract.
//
// Reported: "I want to add <model> from a custom provider. I can click add but
// the model cannot be added in the list."
//
// ModelSelectModal documents "Click to add, click again to remove", and its
// handleSelect() only removes when an `onDeselect` handler is supplied —
// otherwise it calls onSelect, where the duplicate guard drops the value and
// nothing changes on screen.
//
// The create form passed onDeselect; the combo CARD (the reported path) and the
// capacity-adapter picker did not. So clicking a member that was already listed
// was silently ignored, which reads exactly like "it never gets added".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const COMBOS_PAGE = new URL(
  "../../src/app/(dashboard)/dashboard/combos/page.js",
  import.meta.url
);
const COMPONENTS_INDEX = new URL("../../src/shared/components/index.js", import.meta.url);

/** Pull each <ModelSelectModal ... /> JSX block out of a source file. */
function modelSelectInstances(source) {
  const blocks = [];
  const marker = "<ModelSelectModal";
  let index = source.indexOf(marker);
  while (index !== -1) {
    // JSX blocks may span lines; take through the closing "/>".
    const close = source.indexOf("/>", index);
    blocks.push(source.slice(index, close === -1 ? source.length : close + 2));
    index = source.indexOf(marker, index + marker.length);
  }
  return blocks;
}

/**
 * Multi-select = the picker is told which values are already added and stays
 * open. A bare `closeOnSelect` prop means the picker closes after one pick, so
 * there is nothing to deselect.
 */
function isMultiSelect(block) {
  if (!block.includes("addedModelValues")) return false;
  if (!block.includes("closeOnSelect")) return true;
  return block.includes("closeOnSelect={false}");
}

describe("combo model picker keeps select AND deselect wired", () => {
  const source = readFileSync(COMBOS_PAGE, "utf8");
  const instances = modelSelectInstances(source);

  it("finds the picker instances", () => {
    expect(instances.length).toBeGreaterThanOrEqual(4);
  });

  it("every multi-select instance supplies onDeselect", () => {
    const multiSelect = instances.filter(isMultiSelect);
    expect(multiSelect.length).toBeGreaterThanOrEqual(3);
    for (const block of multiSelect) {
      expect(block, `missing onDeselect in: ${block.slice(0, 90)}`).toContain("onDeselect");
    }
  });

  it("the combo card (draftModels editor) can remove and re-add members", () => {
    const cardInstance = instances.find((block) => block.includes("draftModels"));
    expect(cardInstance).toBeTruthy();
    expect(cardInstance).toContain("onDeselect");
    // Deselect must actually drop the value, not just log it.
    expect(cardInstance).toMatch(/onDeselect=\{\(model\)\s*=>/);
  });

  it("exports ModelSelectModal with both handlers declared", () => {
    const picker = readFileSync(
      new URL("../../src/shared/components/ModelSelectModal.js", import.meta.url),
      "utf8"
    );
    expect(picker).toMatch(/onSelect,/);
    expect(picker).toMatch(/onDeselect/);
    // Documented behaviour that the callers must honour.
    expect(picker).toContain("click again to remove");
    expect(readFileSync(COMPONENTS_INDEX, "utf8")).toContain("ModelSelectModal");
  });
});
