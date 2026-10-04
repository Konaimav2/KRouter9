"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/components";

// Pure state derivation for the one-click Headroom setup/start button.
// `status` is the GET /api/headroom/status payload (or null while probing).
// Running → both actions disabled (idempotent re-click is a no-op).
export function deriveSetupButtonState(status, actionLoading) {
  if (!status || status.loading) {
    return { label: "Checking…", disabled: true, action: null, hint: null };
  }
  if (status.running) {
    return { label: "Headroom running", disabled: true, action: null, hint: null };
  }
  if (status.localUrl === false) {
    return {
      label: "Start Headroom",
      disabled: true,
      action: null,
      hint: "External proxy URL — start Headroom separately, then recheck.",
    };
  }
  if (!status.installed) {
    return {
      label: "Setup Headroom",
      disabled: !!actionLoading,
      action: "setup",
      hint: "Not installed. Setup installs then starts the local proxy.",
    };
  }
  return {
    label: actionLoading ? "Starting…" : "Start Headroom",
    disabled: !!actionLoading,
    action: "start",
    hint: null,
  };
}

export const HEADROOM_SETUP_SPEC = 'pip install "headroom-ai[proxy]"';
export const HEADROOM_SETUP_ERROR_SETUP_REQUIRED =
  "Setup needs `pip install \"headroom-ai[proxy]\"` (Python ≥ 3.10) — install it, then click Start.";

export default function HeadroomSetupButton() {
  const [status, setStatus] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/headroom/status", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json().catch(() => ({}));
      setStatus(res.ok ? { ...data, loading: false } : { ...data, loading: false, running: false });
    } catch {
      setStatus({ installed: false, running: false, loading: false });
    }
  }, []);

  // Initial status probe on mount (async fetch; same mount-fetch pattern as
  // other dashboard pages — not a render cascade).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const runSetupOrStart = useCallback(async () => {
    const view = deriveSetupButtonState(status, actionLoading);
    // Idempotent re-click: disabled states never fire (button disabled), and
    // this guard covers programmatic/double-submit paths.
    if (!view.action || actionLoading) return;
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/headroom/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Setup-required errors (NOT_INSTALLED / NO_PYTHON) surface as
        // actionable guidance, not a dead button.
        if (data.code === "NOT_INSTALLED" || data.code === "NO_PYTHON") {
          throw new Error(data.error || HEADROOM_SETUP_ERROR_SETUP_REQUIRED);
        }
        throw new Error(data.error || "Failed to start Headroom");
      }
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  }, [status, actionLoading, refresh]);

  const view = deriveSetupButtonState(status, actionLoading);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        disabled={view.disabled}
        onClick={runSetupOrStart}
        title={view.hint || view.label}
      >
        {actionLoading ? "Starting…" : view.label}
      </Button>
      <button
        type="button"
        onClick={refresh}
        className="text-xs text-primary underline"
      >
        Recheck
      </button>
      {view.hint && <span className="text-xs text-text-muted">{view.hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
