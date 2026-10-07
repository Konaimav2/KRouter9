"use client";

import { useMemo, useState } from "react";
import Icon from "@/shared/components/Icon";
import { PopoverMenu } from "@/shared/components/overlays";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { SKILLS, SKILLS_REPO_URL, getSkillRawUrl, getSkillBlobUrl } from "@/shared/constants/skills";

const secondary = "inline-flex min-h-[var(--touch-h)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,currentColor_36%,transparent)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

function CopyButton({ value, label, copiedLabel = "Link copied" }) {
  const { copied, copy } = useCopyToClipboard(2000);
  return <button type="button" onClick={() => copy(value)} className={secondary} aria-label={label}><Icon name={copied ? "check" : "content_copy"} size={15} />{copied ? copiedLabel : label}</button>;
}

function ActionMenu({ skill, sourceUrl }) {
  const [open, setOpen] = useState(false);
  return <div className="relative"><button type="button" className={secondary} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(true)}>Actions</button><PopoverMenu open={open} onDismiss={() => setOpen(false)} label={`Actions for ${skill.name}`}><a role="menuitem" className="block min-h-[var(--touch-h)] px-3 py-2" href={sourceUrl} target="_blank" rel="noopener noreferrer">Open source <span className="sr-only">(opens in a new tab)</span></a><a role="menuitem" className="block min-h-[var(--touch-h)] px-3 py-2" href={`${SKILLS_REPO_URL}/tree/master/skills`} target="_blank" rel="noopener noreferrer">View repository <span className="sr-only">(opens in a new tab)</span></a></PopoverMenu></div>;
}

function SkillRow({ skill }) {
  const [expanded, setExpanded] = useState(false);
  const rawUrl = getSkillRawUrl(skill.id);
  const sourceUrl = getSkillBlobUrl(skill.id);
  const longPurpose = skill.description.length > 110;
  return <article className="grid gap-[var(--space-3)] border-b border-[color-mix(in_srgb,currentColor_18%,transparent)] bg-[var(--surface)] p-[var(--space-4)] last:border-b-0 hover:bg-[var(--surface-hover)] sm:grid-cols-[minmax(10rem,0.8fr)_minmax(16rem,1.5fr)_minmax(9rem,0.6fr)_auto] sm:items-start">
    <div className="min-w-0"><h2 className="text-sm font-semibold text-[var(--text)]">{skill.name}</h2>{skill.isEntry && <span className="text-xs text-[var(--primary)]">Start here</span>}</div>
    <div className="min-w-0"><p className={`text-sm text-[var(--text-muted)] ${!expanded && longPurpose ? "line-clamp-2" : ""}`}>{skill.description}</p>{longPurpose && <button type="button" className="mt-1 text-xs text-[var(--primary)] hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Collapse purpose" : "Show full purpose"}</button>}</div>
    <code className="break-all font-mono text-xs text-[var(--text-muted)]">{skill.endpoint || "—"}</code>
    <div className="flex flex-wrap gap-[var(--space-2)] sm:justify-end"><CopyButton value={rawUrl} label={`Copy link for ${skill.name}`} /><ActionMenu skill={skill} sourceUrl={sourceUrl} /></div>
  </article>;
}

export default function SkillsPage() {
  const [query, setQuery] = useState("");
  const entryUrl = getSkillRawUrl("krouter9");
  const prompt = `Read this skill and use it: ${entryUrl}`;
  const filtered = useMemo(() => SKILLS.filter((skill) => `${skill.name} ${skill.description} ${skill.endpoint || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  return <main className="mx-auto w-full max-w-[72rem] space-y-[var(--space-6)] px-1 sm:px-0">
    <header className="flex flex-wrap items-start justify-between gap-[var(--space-4)]"><div><h1 className="text-[length:var(--text-xl)] font-semibold text-[var(--text)]">Skills</h1><p className="mt-[var(--space-1)] text-sm text-[var(--text-muted)]">Install a focused capability into your coding agent.</p></div><a className={secondary} href={`${SKILLS_REPO_URL}/tree/master/skills`} target="_blank" rel="noopener noreferrer">View repository <span className="sr-only">(opens in a new tab)</span><Icon name="open_in_new" size={15} /></a></header>
    <section className="border border-[color-mix(in_srgb,currentColor_18%,transparent)] bg-[var(--surface)] p-[var(--space-4)]"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">Start here</p><h2 className="mt-[var(--space-1)] text-[length:var(--text-lg)] font-semibold">Install <code className="font-mono">using-krouter9</code></h2><ol className="my-[var(--space-3)] grid gap-[var(--space-2)] text-sm text-[var(--text-muted)] sm:grid-cols-2"><li>1. Copy the prompt</li><li>2. Paste it into your agent</li></ol><div className="flex flex-col gap-[var(--space-3)] sm:flex-row"><code tabIndex={0} aria-label="Installation prompt" className="min-w-0 flex-1 break-all rounded-[var(--radius-field)] border border-[color-mix(in_srgb,currentColor_18%,transparent)] bg-[var(--surface)] p-[var(--space-3)] font-mono text-xs text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">{prompt}</code><CopyButton value={prompt} label="Copy prompt" copiedLabel="Prompt copied" /></div></section>
    <section className="overflow-hidden rounded-[var(--radius-field)] border border-[color-mix(in_srgb,currentColor_18%,transparent)] bg-[var(--surface)]"><div className="flex flex-wrap items-center gap-[var(--space-3)] border-b border-[color-mix(in_srgb,currentColor_18%,transparent)] p-[var(--space-4)]"><label className="sr-only" htmlFor="skill-search">Search skills</label><input id="skill-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" className="h-[var(--control-h)] min-w-0 flex-1 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,currentColor_36%,transparent)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"/><span aria-live="polite" className="text-xs text-[var(--text-muted)]">{filtered.length} results</span>{query && <button type="button" onClick={() => setQuery("")} className="text-sm text-[var(--primary)]">Clear search</button>}</div>
      {filtered.length ? <><div className="hidden grid-cols-[minmax(10rem,0.8fr)_minmax(16rem,1.5fr)_minmax(9rem,0.6fr)_auto] gap-[var(--space-3)] border-b border-[color-mix(in_srgb,currentColor_18%,transparent)] px-[var(--space-4)] py-[var(--space-2)] text-xs font-semibold text-[var(--text-muted)] sm:grid"><span>Skill</span><span>Purpose</span><span>Endpoint</span><span>Actions</span></div>{filtered.map((skill) => <SkillRow key={skill.id} skill={skill} />)}</> : <div className="p-[var(--space-8)] text-center"><p>No skills match this search.</p><button type="button" onClick={() => setQuery("")} className="mt-2 text-[var(--primary)]">Clear search</button></div>}
      <footer className="p-[var(--space-3)] text-xs text-[var(--text-muted)]">Source: Konaimav2/KRouter9 skills</footer>
    </section>
  </main>;
}
