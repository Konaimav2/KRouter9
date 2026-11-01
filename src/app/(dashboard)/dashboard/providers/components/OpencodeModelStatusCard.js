"use client";

/**
 * OpencodeModelStatusCard — "is this free model still in service?"
 *
 * Upstream retires free models without warning (and can keep serving an id that its own
 * catalog omits). The static retirement table loads immediately; the live probe is an
 * explicit action because it costs one tiny upstream request per model.
 */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/shared/components";

const STATE_BADGE = {
  live: { variant: "success", label: "Available" },
  retired: { variant: "error", label: "Retired" },
  "not-free": { variant: "warning", label: "No longer free" },
  unknown: { variant: "default", label: "Unknown" },
};

const STATUS_URL = "/api/providers/opencode-free/status";

export default function OpencodeModelStatusCard() {
  const [known, setKnown] = useState(null);
  const [live, setLive] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(STATUS_URL, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => {
        if (!cancelled) setKnown(Array.isArray(data.results) ? data.results : []);
      })
      .catch(() => {
        if (!cancelled) setKnown([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError("");
    try {
      const res = await fetch(STATUS_URL, { method: "POST", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Check failed (${res.status})`);
        return;
      }
      setLive(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setError(err?.message || "Check failed");
    } finally {
      setChecking(false);
    }
  }, []);

  const rows = live || known || [];
  const summary = live
    ? live.reduce((acc, row) => {
        acc[row.state] = (acc[row.state] || 0) + 1;
        return acc;
      }, {})
    : null;

  return (
    <Card>
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Model status</h2>
          <p className="mt-1 text-xs text-text-muted">
            Free model ids can be retired without notice. Check which ids upstream still
            serves, still serves for free, or has retired.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={checking ? "progress_activity" : "health_and_safety"}
          onClick={runCheck}
          disabled={checking}
        >
          {checking ? "Checking…" : "Check models"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {summary && (
        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
          <span>{summary.live || 0} available</span>
          <span>{summary.retired || 0} retired</span>
          <span>{summary["not-free"] || 0} no longer free</span>
          <span>{summary.unknown || 0} unknown</span>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">
          {known === null ? "Loading known retirements…" : "No retired ids recorded — run a check."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => {
            const badge = STATE_BADGE[row.state] || STATE_BADGE.unknown;
            return (
              <li key={row.model} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs">{row.model}</span>
                  {row.replacement && (
                    <span className="ml-2 text-[11px] text-text-muted">use {row.replacement}</span>
                  )}
                </div>
                <Badge variant={badge.variant} size="sm">
                  {badge.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}