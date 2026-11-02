"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import Icon from "@/shared/components/Icon";

const subscribeToOrigin = () => () => {};

export default function SetupWizardCard({ tools = [] }) {
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTools = normalizedQuery
    ? tools.filter((tool) => `${tool.name} ${tool.id}`.toLowerCase().includes(normalizedQuery))
    : tools;
  // Derived, not an effect: the first visible tool is the default, and a filter that hides
  // the previous selection moves to the first match instead of leaving a dead control.
  const selectedToolId =
    selectedId && visibleTools.some((tool) => tool.id === selectedId)
      ? selectedId
      : visibleTools[0]?.id || "";
  const selected = tools.find((t) => t.id === selectedToolId) || null;
  const [checking, setChecking] = useState(false);
  const [statusState, setStatusState] = useState(null);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef(null);

  // Server and first client render agree on ""; the snapshot switches to the real
  // origin after hydration, so the snippet never causes a text mismatch.
  const origin = useSyncExternalStore(
    subscribeToOrigin,
    () => window.location.origin,
    () => ""
  );

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleToolChange = (e) => {
    setSelectedId(e.target.value);
    setStatusState(null);
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/cli-tools/all-statuses");
      if (!res.ok) {
        setStatusState("check-failed");
        return;
      }
      const data = await res.json();
      const toolData = data?.[selectedToolId];
      if (toolData === undefined) {
        // No status checker registered for this client.
        setStatusState("unavailable");
      } else if (toolData === null) {
        // The batch endpoint uses null when the getter threw.
        setStatusState("check-failed");
      } else if (toolData.error) {
        setStatusState("check-failed");
      } else if (toolData.installed === true) {
        setStatusState("detected");
      } else if (toolData.installed === false) {
        setStatusState("absent");
      } else {
        setStatusState("unavailable");
      }
    } catch {
      setStatusState("check-failed");
    } finally {
      setChecking(false);
    }
  };

  const baseUrl = origin ? `${origin}/v1` : "";
  const interpolate = (value) => String(value).replaceAll("{{baseUrl}}", baseUrl);
  // The catalog stores copyable values under guideSteps; steps is a legacy alias.
  const guideSteps = selected?.guideSteps ?? selected?.steps;
  const stepValues = Array.isArray(guideSteps)
    ? guideSteps.map((step) => step.value).filter(Boolean).map(interpolate)
    : [];
  const snippet = !origin
    ? ""
    : stepValues.length > 0
      ? stepValues.join("\n\n")
      : selected?.envVars?.baseUrl
        ? `export ${selected.envVars.baseUrl}="${baseUrl}"`
        : `export ANTHROPIC_BASE_URL="${baseUrl}"`;

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // clipboard write failed
    }
  };

  const renderStatus = () => {
    if (!statusState) return null;

    if (statusState === "detected") {
      return (
        <span
          data-state="detected"
          className="inline-flex min-h-[48px] items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-success)]"
        >
          <Icon name="check_circle" size={16} />
          <span>Detected</span>
        </span>
      );
    }

    if (statusState === "unavailable") {
      return (
        <span
          data-state="unavailable"
          className="inline-flex min-h-[48px] items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-text-muted)]"
        >
          <Icon name="help" size={16} />
          <span>No checker for this client</span>
        </span>
      );
    }

    if (statusState === "absent") {
      return (
        <span
          data-state="absent"
          className="inline-flex min-h-[48px] items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-warning)]"
        >
          <Icon name="cancel" size={16} />
          <span>Absent</span>
        </span>
      );
    }

    if (statusState === "check-failed") {
      return (
        <span
          data-state="check-failed"
          className="inline-flex min-h-[48px] items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]"
        >
          <Icon name="warning" size={16} />
          <span>Check failed</span>
        </span>
      );
    }

    return null;
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-3">
      {/* Step 1: Select Tool */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="setup-tool-select"
          className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]"
        >
          Step 1: Select Client
        </label>
        <label
          htmlFor="setup-tool-search"
          className="text-xs text-[var(--color-text-muted)]"
        >
          Find a client
        </label>
        <input
          id="setup-tool-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name or id"
          className="min-h-[48px] w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        />
        {visibleTools.length > 0 ? (
          <select
            id="setup-tool-select"
            value={selectedToolId}
            onChange={handleToolChange}
            aria-label="Client to set up"
            className="min-h-[48px] w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            {visibleTools.map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.name}
              </option>
            ))}
          </select>
        ) : (
          <p role="status" className="text-xs text-[var(--color-text-muted)]">
            No client matches this filter.
          </p>
        )}
      </div>

      {/* Step 2: Check Status */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Step 2: Check Status
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={checking || !selectedToolId}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded border border-[var(--button-border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--button-secondary-fg)] transition-colors hover:bg-[var(--button-secondary-bg-hover)] disabled:opacity-50 focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            <Icon
              name={checking ? "progress_activity" : "refresh"}
              size={16}
              className={checking ? "animate-spin" : ""}
            />
            <span>{checking ? "Checking..." : "Check Status"}</span>
          </button>
          {renderStatus()}
        </div>
      </div>

      {/* Step 3: Generated Snippet */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Step 3: Environment Setup
        </span>
        {selected?.settingsFile ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Config file: <code className="font-mono">{selected.settingsFile}</code>
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <pre
            suppressHydrationWarning
            className="min-h-[48px] flex-1 overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-code-bg)] px-3 py-3 font-mono text-xs text-[var(--color-text)] flex items-center"
          >
            <code>{snippet || "Resolving gateway URL…"}</code>
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!snippet}
            className="inline-flex min-h-[48px] min-w-[96px] shrink-0 items-center justify-center gap-2 rounded border border-[var(--button-border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-sm font-medium text-[var(--button-secondary-fg)] transition-colors hover:bg-[var(--button-secondary-bg-hover)] focus:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            aria-label="Copy environment variable snippet"
          >
            <Icon name={copied ? "check" : "copy"} size={16} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
