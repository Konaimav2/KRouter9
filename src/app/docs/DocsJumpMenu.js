"use client";

export default function DocsJumpMenu({ sections, variant = "select" }) {
  const jumpToSection = (id) => {
    if (!id) return;
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.focus({ preventScroll: true });
  };

  if (variant === "links") {
    return sections.map(([id, label]) => (
      <button
        key={id}
        type="button"
        onClick={() => jumpToSection(id)}
        className="block w-full py-1.5 text-left text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
      >
        {label}
      </button>
    ));
  }

  return (
    <div className="mb-6 sm:hidden">
      <label htmlFor="docs-jump" className="mb-2 block text-sm font-medium">Jump to section</label>
      <select id="docs-jump" className="h-11 w-full rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3" defaultValue="" onChange={(event) => jumpToSection(event.target.value)}>
        <option value="" disabled>Choose a section</option>
        {sections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </div>
  );
}
