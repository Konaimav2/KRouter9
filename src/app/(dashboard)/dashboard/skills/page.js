"use client";

import Icon from "@/shared/components/Icon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
  SKILLS,
  SKILLS_REPO_URL,
  getSkillRawUrl,
  getSkillBlobUrl,
} from "@/shared/constants/skills";

function CopyButton({ value, label = "Copy link" }) {
  const { copied, copy } = useCopyToClipboard(2000);
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--color-border)] px-3 text-xs font-medium hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      aria-label={label}
      title={label}
    >
      <Icon name={copied ? "check" : "content_copy"} size={15} />
      {copied ? "Copied!" : label}
    </button>
  );
}

function SkillRow({ skill, index }) {
  const rawUrl = getSkillRawUrl(skill.id);
  return (
    <div
      className={`border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 border-l-2 px-4 py-3 sm:grid-cols-[2.5rem_minmax(14rem,1fr)_minmax(12rem,1fr)_auto] sm:items-center ${skill.isEntry ? "border-l-[var(--color-primary)]" : "border-l-transparent"}`}
    >
      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 items-start gap-3">
        <Icon name={skill.icon} className="mt-0.5 shrink-0" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{skill.name}</h3>
            {skill.isEntry && (
              <span className="text-xs font-medium text-[var(--color-primary)]">
                Start here
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {skill.description}
          </p>
        </div>
      </div>
      <div className="min-w-0">
        {skill.endpoint && (
          <code className="inline-flex border border-[var(--badge-border)] bg-[var(--badge-bg)] px-2 py-1 text-[10px] text-[var(--badge-fg)]">
            {skill.endpoint}
          </code>
        )}
        <a
          href={getSkillBlobUrl(skill.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="data-text mt-1 flex items-start gap-1 overflow-wrap-anywhere text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
        >
          <span>{rawUrl}</span>
          <Icon name="open_in_new" size={13} className="mt-0.5 shrink-0" />
        </a>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <CopyButton value={rawUrl} />
        <a
          href={getSkillBlobUrl(skill.id)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${skill.name} source`}
          title={`Open ${skill.name} source`}
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--color-border)] px-3 text-xs hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          Open <Icon name="open_in_new" size={15} />
        </a>
      </div>
    </div>
  );
}

export default function SkillsPage() {
  const entryUrl = getSkillRawUrl("krouter9");
  const prompt = `Read this skill and use it: ${entryUrl}`;
  return (
    <div className="mx-auto w-full max-w-[72rem] px-1 sm:px-0">
      <section className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
        <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">01</span>
          <h2 className="font-semibold">Skill registry</h2>
          <span className="data-text ml-auto text-xs text-[var(--color-text-muted)]">
            {SKILLS.length} skills
          </span>
        </header>
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center">
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">AI</span>
          <div className="min-w-0">
            <p className="mb-1 text-xs text-[var(--color-text-muted)]">
              Paste this to your AI
            </p>
            <code className="data-text block overflow-wrap-anywhere border border-[var(--color-border)] bg-[var(--color-code-bg)] px-3 py-2 text-xs text-[var(--p-carbon-100)]">
              {prompt}
            </code>
          </div>
          <CopyButton value={prompt} label="Copy prompt" />
        </div>
        {SKILLS.map((skill, index) => (
          <SkillRow key={skill.id} skill={skill} index={index} />
        ))}
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center">
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">
            {String(SKILLS.length + 1).padStart(2, "0")}
          </span>
          <div>
            <h3 className="text-sm font-semibold">More on GitHub</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Browse source, README, and examples.
            </p>
          </div>
          <a
            href={`${SKILLS_REPO_URL}/tree/master/skills`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--color-border)] px-3 text-sm hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            View on GitHub <Icon name="open_in_new" size={16} />
          </a>
        </div>
      </section>
    </div>
  );
}
