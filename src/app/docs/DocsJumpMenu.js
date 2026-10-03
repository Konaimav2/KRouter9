"use client";

export default function DocsJumpMenu({ sections }) {
  const handleChange = (event) => {
    const id = event.target.value;
    if (!id) return;
    const section = document.getElementById(id);
    if (!section) return;
    globalThis.history.replaceState(null, "", `#${id}`);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.focus({ preventScroll: true });
  };

  return (
    <div className="mb-6 sm:hidden">
      <label htmlFor="docs-jump" className="mb-2 block text-sm font-medium">Jump to section</label>
      <select id="docs-jump" className="h-11 w-full rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3" defaultValue="" onChange={handleChange}>
        <option value="" disabled>Choose a section</option>
        {sections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </div>
  );
}
