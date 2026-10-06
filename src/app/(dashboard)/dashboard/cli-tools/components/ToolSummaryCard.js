"use client";

import Link from "next/link";
import Image from "next/image";
import Icon from "@/shared/components/Icon";

function getStatus(status, tool) {
  if (tool?.configType === "guide")
    return {
      label: "Installation guide",
      glyph: "◇",
      tone: "text-[var(--color-info)]",
    };
  if (!status)
    return {
      label: "Unknown",
      glyph: "○",
      tone: "text-[var(--color-text-muted)]",
    };
  if (!status.installed)
    return {
      label: "Not installed",
      glyph: "◇",
      tone: "text-[var(--color-warning)]",
    };
  if (status.has9Router)
    return {
      label: "Connected",
      glyph: "●",
      tone: "text-[var(--color-success)]",
    };
  return {
    label: "Not configured",
    glyph: "◇",
    tone: "text-[var(--color-warning)]",
  };
}

export default function ToolSummaryCard({ toolId, tool, status, rowNumber }) {
  const state = getStatus(status, tool);
  const endpoint =
    status?.baseUrl ||
    status?.endpoint ||
    status?.model ||
    tool.settingsFile ||
    tool.description;

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] sm:items-center">
      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">
        {String(rowNumber).padStart(2, "0")}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center">
          {tool.image ? (
            <Image
              src={tool.image}
              alt=""
              width={32}
              height={32}
              className="size-8 object-contain"
              sizes="32px"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Icon name={tool.icon || "terminal"} />
          )}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{tool.name}</h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            {tool.description}
          </p>
        </div>
      </div>
      <div className="min-w-0">
        <p className={`flex items-center gap-2 text-sm ${state.tone}`}>
          <span aria-hidden="true">{state.glyph}</span>
          <span>{state.label}</span>
        </p>
        <p className="data-text mt-1 truncate text-xs text-[var(--color-text-muted)]">
          {endpoint}
        </p>
      </div>
      <Link
        href={`/dashboard/cli-tools/${toolId}`}
        className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--color-border)] px-3 text-sm hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        Configure <Icon name="chevron_right" size={16} />
      </Link>
    </div>
  );
}
