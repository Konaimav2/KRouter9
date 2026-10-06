"use client";

import { useState, useEffect } from "react";
import { CLI_TOOLS, MITM_TOOLS } from "@/shared/constants/cliTools";
import { MitmLinkCard } from "./components";
import ToolSummaryCard from "./components/ToolSummaryCard";

const ALL_STATUSES_URL = "/api/cli-tools/all-statuses";

function RowSkeleton({ number }) {
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid animate-pulse gap-3 px-4 py-3 sm:grid-cols-[2.5rem_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] sm:items-center">
      <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">{String(number).padStart(2, "0")}</span>
      <span className="h-8 bg-[var(--color-surface-raised)]" />
      <span className="h-5 bg-[var(--color-surface-raised)]" />
      <span className="h-10 w-24 bg-[var(--color-surface-raised)]" />
    </div>
  );
}

export default function CLIToolsPageClient({ machineId }) {
  const [loading, setLoading] = useState(true);
  const [toolStatuses, setToolStatuses] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(ALL_STATUSES_URL);
        if (res.ok && mounted) setToolStatuses(await res.json());
      } catch (error) {
        console.log("Error fetching tool statuses:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const regularTools = Object.entries(CLI_TOOLS);
  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-1 sm:px-0">
      <section className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
        <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">01</span>
          <h2 className="font-semibold">Installed clients</h2>
          <span className="data-text ml-auto text-xs text-[var(--color-text-muted)]">
            {regularTools.length} registered
          </span>
        </header>
        {loading
          ? regularTools
              .slice(0, 6)
              .map(([, tool], index) => (
                <RowSkeleton key={tool.id} number={index + 1} />
              ))
          : regularTools.map(([toolId, tool], index) => (
              <ToolSummaryCard
                key={toolId}
                rowNumber={index + 1}
                toolId={toolId}
                tool={tool}
                status={toolStatuses[toolId]}
              />
            ))}
      </section>
      <section className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
        <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">02</span>
          <h2 className="font-semibold">Interception tools</h2>
          <span className="data-text ml-auto text-xs text-[var(--color-text-muted)]">
            {mitmTools.length} registered
          </span>
        </header>
        {mitmTools.map(([toolId, tool], index) => (
          <MitmLinkCard key={toolId} rowNumber={index + 1} tool={tool} />
        ))}
      </section>
    </div>
  );
}
