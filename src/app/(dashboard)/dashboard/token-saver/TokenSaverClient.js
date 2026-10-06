"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button, Input, Toggle, ConfirmModal } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getCurrentLocale, onLocaleChange } from "@/i18n/runtime";
import {
  WENYAN_LOCALES,
  CAVEMAN_LEVELS,
  PONYTAIL_LEVELS,
} from "../endpoint/endpointConstants";

export default function TokenSaverClient() {
  const [rtkEnabled, setRtkEnabledState] = useState(true);
  const [headroomEnabled, setHeadroomEnabled] = useState(false);
  const [headroomUrl, setHeadroomUrl] = useState("http://localhost:8787");
  const [headroomTimeoutMs, setHeadroomTimeoutMs] = useState(3000);
  const [headroomStatus, setHeadroomStatus] = useState({
    installed: false,
    running: false,
    python: null,
    loading: true,
  });
  const [headroomActionLoading, setHeadroomActionLoading] = useState(false);
  const [headroomActionError, setHeadroomActionError] = useState("");
  const [headroomExtras, setHeadroomExtras] = useState({
    version: null,
    extras: { code: false, ml: false },
    available: ["code", "ml"],
    loading: false,
  });
  const [pendingExtras, setPendingExtras] = useState([]);
  const [extrasActionLoading, setExtrasActionLoading] = useState(false);
  const [extrasActionError, setExtrasActionError] = useState("");
  const [removingExtra, setRemovingExtra] = useState(null);
  const [installLog, setInstallLog] = useState("");
  const [extrasConfirm, setExtrasConfirm] = useState(null);
  const [codeAware, setCodeAware] = useState(false);
  const [kompress, setKompress] = useState(true);
  const [restartingProxy, setRestartingProxy] = useState(false);
  const logPollRef = useRef(null);
  const [cavemanEnabled, setCavemanEnabled] = useState(false);
  const [cavemanLevel, setCavemanLevel] = useState("full");
  const [ponytailEnabled, setPonytailEnabled] = useState(false);
  const [ponytailLevel, setPonytailLevel] = useState("full");
  const [pxpipeEnabled, setPxpipeEnabled] = useState(false);
  const [pxpipeMinChars, setPxpipeMinChars] = useState(25000);
  const [pxpipeStatus, setPxpipeStatus] = useState({
    installed: false,
    installing: false,
    running: false,
    version: null,
    loading: true,
  });
  const [pxpipeHealth, setPxpipeHealth] = useState(null);
  const [showPxpipeModal, setShowPxpipeModal] = useState(false);
  const [pxpipeActionLoading, setPxpipeActionLoading] = useState(false);
  const [pxpipeActionError, setPxpipeActionError] = useState("");
  const [locale, setLocale] = useState("en");

  const { copied, copy } = useCopyToClipboard();

  const patchSetting = async (patch) => {
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (error) {
      console.log("Error updating setting:", error);
    }
  };

  // Locale synchronization intentionally updates local presentation state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(getCurrentLocale());
    return onLocaleChange(() => setLocale(getCurrentLocale()));
  }, []);

  const isWenyanLocale = WENYAN_LOCALES.includes(locale);
  const visibleCavemanLevels = isWenyanLocale
    ? CAVEMAN_LEVELS
    : CAVEMAN_LEVELS.filter((lvl) => !lvl.wenyan);

  // Leaving a Wenyan locale restores the supported non-Wenyan level.
  useEffect(() => {
    const current = CAVEMAN_LEVELS.find((lvl) => lvl.id === cavemanLevel);
    if (current?.wenyan && !isWenyanLocale) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCavemanLevel("ultra");
      patchSetting({ cavemanLevel: "ultra" });
    }
  }, [isWenyanLocale, cavemanLevel]);

  const handleRtkEnabled = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtkEnabled: value }),
      });
      if (res.ok) setRtkEnabledState(value);
    } catch (error) {
      console.log("Error updating rtkEnabled:", error);
    }
  };

  const handleCavemanEnabled = (value) => {
    setCavemanEnabled(value);
    patchSetting({ cavemanEnabled: value });
  };

  const handleHeadroomEnabled = (value) => {
    const nextUrl = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(nextUrl);
    setHeadroomEnabled(value);
    patchSetting({ headroomEnabled: value, headroomUrl: nextUrl });
  };

  const handleHeadroomUrlBlur = async () => {
    const next = headroomUrl.trim() || "http://localhost:8787";
    setHeadroomUrl(next);
    await patchSetting({ headroomUrl: next });
    refreshHeadroomStatus();
  };

  const refreshHeadroomStatus = useCallback(async () => {
    setHeadroomStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/headroom/status", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      setHeadroomStatus({ ...data, loading: false });
      if (!data?.installed) {
        setHeadroomExtras({
          version: null,
          extras: { code: false, ml: false },
          available: ["code", "ml"],
          loading: false,
        });
        setPendingExtras([]);
        return;
      }
      try {
        const er = await fetch("/api/headroom/extras", {
          headers: { "Cache-Control": "no-store" },
        });
        if (!er.ok) throw new Error("extras status failed");
        const ed = await er.json();
        setHeadroomExtras((s) => ({
          ...s,
          version: ed.version ?? null,
          extras: ed.extras || { code: false, ml: false },
          available: ed.available || ["code", "ml"],
          loading: false,
        }));
        setPendingExtras([]);
      } catch {
        setHeadroomExtras({
          version: null,
          extras: { code: false, ml: false },
          available: ["code", "ml"],
          loading: false,
        });
        setPendingExtras([]);
      }
    } catch {
      setHeadroomStatus({
        installed: false,
        running: false,
        python: null,
        loading: false,
      });
      setHeadroomExtras({
        version: null,
        extras: { code: false, ml: false },
        available: ["code", "ml"],
        loading: false,
      });
      setPendingExtras([]);
    }
  }, []);

  const handleHeadroomStart = useCallback(async () => {
    setHeadroomActionError("");
    setHeadroomActionLoading(true);
    try {
      const res = await fetch("/api/headroom/start", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start proxy");
      await refreshHeadroomStatus();
    } catch (e) {
      setHeadroomActionError(e.message);
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const handleHeadroomStop = useCallback(async () => {
    setHeadroomActionLoading(true);
    try {
      await fetch("/api/headroom/stop", { method: "POST" });
      await refreshHeadroomStatus();
    } finally {
      setHeadroomActionLoading(false);
    }
  }, [refreshHeadroomStatus]);

  const togglePendingExtra = (extra) => {
    setPendingExtras((cur) =>
      cur.includes(extra) ? cur.filter((e) => e !== extra) : [...cur, extra]
    );
  };

  // Poll the install log tail while a pip install/uninstall is running.
  const startLogPolling = useCallback(() => {
    setInstallLog("");
    if (logPollRef.current) clearInterval(logPollRef.current);
    const tick = async () => {
      try {
        const r = await fetch("/api/headroom/extras?log=1", {
          headers: { "Cache-Control": "no-store" },
        });
        const d = await r.json().catch(() => ({}));
        if (typeof d.log === "string") setInstallLog(d.log);
      } catch { /* ignore transient poll errors */ }
    };
    tick();
    logPollRef.current = setInterval(tick, 1500);
  }, []);

  const stopLogPolling = useCallback(() => {
    if (logPollRef.current) {
      clearInterval(logPollRef.current);
      logPollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopLogPolling(), [stopLogPolling]);

  const installExtrasConfirmed = useCallback(async () => {
    if (pendingExtras.length === 0) return;
    setExtrasActionLoading(true);
    setExtrasActionError("");
    startLogPolling();
    try {
      const res = await fetch("/api/headroom/extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: pendingExtras }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Install failed");
      setHeadroomExtras((s) => ({
        ...s,
        version: data.version ?? s.version,
        extras: data.extras || s.extras,
      }));
      setPendingExtras([]);
    } catch (e) {
      setExtrasActionError(e.message);
    } finally {
      stopLogPolling();
      setExtrasActionLoading(false);
    }
  }, [pendingExtras, startLogPolling, stopLogPolling]);

  const removeExtraConfirmed = useCallback(async (extra) => {
    setRemovingExtra(extra);
    setExtrasActionError("");
    startLogPolling();
    try {
      const res = await fetch("/api/headroom/extras", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: [extra] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Remove failed");
      setHeadroomExtras((s) => ({
        ...s,
        version: data.version ?? s.version,
        extras: data.extras || s.extras,
      }));
    } catch (e) {
      setExtrasActionError(e.message);
    } finally {
      stopLogPolling();
      setRemovingExtra(null);
    }
  }, [startLogPolling, stopLogPolling]);

  const handleInstallExtras = useCallback(() => {
    if (pendingExtras.length === 0) return;
    // Warn about the heavy ~1GB torch download before installing [ml].
    if (pendingExtras.includes("ml")) {
      setExtrasConfirm({
        title: "Install [ml]",
        message: "[ml] downloads ~1 GB (torch + huggingface-hub). Continue?",
        confirmText: "Install",
        variant: "primary",
        onConfirm: installExtrasConfirmed,
      });
      return;
    }
    installExtrasConfirmed();
  }, [pendingExtras, installExtrasConfirmed]);

  const handleRemoveExtra = useCallback((extra) => {
    setExtrasConfirm({
      title: `Remove [${extra}]`,
      message: `Remove [${extra}] and its packages?`,
      confirmText: "Remove",
      variant: "danger",
      onConfirm: () => removeExtraConfirmed(extra),
    });
  }, [removeExtraConfirmed]);

  // Toggle an extra's active state (persist setting), then restart the proxy so
  // the new --code-aware / --disable-kompress flags take effect.
  const toggleExtraActive = useCallback(async (extra, value) => {
    setExtrasActionError("");
    if (extra === "code") setCodeAware(value);
    if (extra === "ml") setKompress(value);
    const key = extra === "code" ? "headroomCodeAware" : "headroomKompress";
    await patchSetting({ [key]: value });
    if (!headroomStatus.running) return;
    setRestartingProxy(true);
    try {
      const res = await fetch("/api/headroom/restart", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Restart failed");
      await refreshHeadroomStatus();
    } catch (e) {
      setExtrasActionError(e.message);
    } finally {
      setRestartingProxy(false);
    }
  }, [headroomStatus.running, refreshHeadroomStatus]);

  const handleCavemanLevel = (level) => {
    setCavemanLevel(level);
    // Picking a wenyan level is the explicit opt-in (server falls back to
    // "ultra" without it); leaving wenyan clears the opt-in.
    const picked = CAVEMAN_LEVELS.find((lvl) => lvl.id === level);
    patchSetting({ cavemanLevel: level, cavemanWenyanOptIn: !!picked?.wenyan });
  };

  const handlePonytailEnabled = (value) => {
    setPonytailEnabled(value);
    patchSetting({ ponytailEnabled: value });
  };

  const handlePonytailLevel = (level) => {
    setPonytailLevel(level);
    patchSetting({ ponytailLevel: level });
  };

  const refreshPxpipeStatus = useCallback(async () => {
    setPxpipeStatus((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/pxpipe/status", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      setPxpipeStatus({ ...data, loading: false });
      if (typeof data.minChars === "number") setPxpipeMinChars(data.minChars);
    } catch {
      setPxpipeStatus({ installed: false, installing: false, running: false, version: null, loading: false });
    }
  }, []);

  const runPxpipeHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/pxpipe/health", { method: "POST" });
      setPxpipeHealth(await res.json());
    } catch (e) {
      setPxpipeHealth({ healthy: false, checks: [], error: e.message });
    }
  }, []);

  const pxpipeAction = useCallback(
    async (endpoint) => {
      setPxpipeActionError("");
      setPxpipeActionLoading(true);
      try {
        const res = await fetch(`/api/pxpipe/${endpoint}`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `PXPIPE ${endpoint} failed`);
        await refreshPxpipeStatus();
        await runPxpipeHealth();
      } catch (e) {
        setPxpipeActionError(e.message);
      } finally {
        setPxpipeActionLoading(false);
      }
    },
    [refreshPxpipeStatus, runPxpipeHealth]
  );

  const handlePxpipeEnabled = (value) => {
    setPxpipeEnabled(value);
    patchSetting({ pxpipeEnabled: value });
  };

  const handlePxpipeMinCharsBlur = () => {
    const next = Math.max(0, Number(pxpipeMinChars) || 25000);
    setPxpipeMinChars(next);
    patchSetting({ pxpipeMinChars: next });
  };

  const handleHeadroomTimeoutBlur = () => {
    const raw = Math.round(Number(headroomTimeoutMs));
    const next = Number.isFinite(raw) && raw > 0 ? raw : 3000;
    setHeadroomTimeoutMs(next);
    patchSetting({ headroomTimeoutMs: next });
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setRtkEnabledState(data.rtkEnabled !== false);
          setHeadroomEnabled(!!data.headroomEnabled);
          setHeadroomUrl(data.headroomUrl || "http://localhost:8787");
          if (typeof data.headroomTimeoutMs === "number") setHeadroomTimeoutMs(data.headroomTimeoutMs);
          setCodeAware(data.headroomCodeAware === true);
          setKompress(data.headroomKompress !== false);
          setCavemanEnabled(!!data.cavemanEnabled);
          setCavemanLevel(data.cavemanLevel || "full");
          setPonytailEnabled(!!data.ponytailEnabled);
          setPonytailLevel(data.ponytailLevel || "full");
          setPxpipeEnabled(!!data.pxpipeEnabled);
          if (typeof data.pxpipeMinChars === "number") setPxpipeMinChars(data.pxpipeMinChars);
          refreshHeadroomStatus();
          // PRD: run the PXPIPE health check automatically when the page opens
          refreshPxpipeStatus().then(runPxpipeHealth);
        }
      } catch {}
    };
    loadSettings();
  }, [refreshHeadroomStatus, refreshPxpipeStatus, runPxpipeHealth]);

  const headroomRunning = !!headroomStatus.running;
  const headroomStatusLabel = headroomStatus.loading
    ? "Checking…"
    : headroomRunning
      ? "Running"
      : headroomStatus.localUrl !== false && !headroomStatus.installed
        ? "Not installed"
        : headroomStatus.localUrl !== false
          ? "Stopped"
          : "External";
  const headroomLocalUrl = headroomStatus.localUrl !== false;
  const headroomCanStart = !!headroomStatus.canStart;
  const headroomManaged =
    headroomLocalUrl && !!headroomStatus.managedPid;

  const pxpipeHealthy = pxpipeHealth?.healthy === true;
  const pxpipeStatusLabel = pxpipeStatus.loading
    ? "Checking…"
    : pxpipeStatus.installing
      ? "Installing…"
      : !pxpipeStatus.installed
        ? "Not installed"
        : pxpipeHealthy
          ? "Healthy"
          : pxpipeStatus.running
            ? "Running"
            : "Stopped";
  const pxpipeChipClass =
    pxpipeHealthy || pxpipeStatus.running
      ? "bg-success/15 text-success"
      : "bg-warning/15 text-warning";

  const headroomSteps = [
    {
      id: "environment",
      label: "Environment check",
      state: headroomStatus.loading ? "Checking" : headroomStatus.python ? "Ready" : "Needs attention",
      body: headroomStatus.python ? `Python ${headroomStatus.python} detected.` : "Python ≥ 3.10 and pip are required for local managed mode.",
      recovery: !headroomStatus.loading && !headroomStatus.python ? "Install Python and pip for this platform, then re-check." : null,
    },
    {
      id: "install",
      label: "Install",
      state: headroomStatus.installed ? "Complete" : "Approval required",
      body: 'Package source: PyPI package headroom-ai with the proxy extra. Installation never runs on page load.',
      command: 'pip install "headroom-ai[proxy]"',
      recovery: !headroomStatus.installed ? "Run the reviewed command externally, then re-check." : null,
    },
    {
      id: "verify",
      label: "Verify service",
      state: headroomRunning ? "Reachable" : "Not reachable",
      body: headroomRunning ? `Service responds at ${headroomUrl}.` : `Start the service at ${headroomUrl}, then verify again.`,
      recovery: !headroomRunning ? "Check the process and port; external URLs must be started separately." : null,
    },
    {
      id: "enable",
      label: "Enable",
      state: headroomEnabled ? "Enabled" : headroomRunning ? "Ready" : "Blocked",
      body: headroomRunning ? "Route prompts through /v1/compress before provider routing." : "Enable becomes available after the service is reachable.",
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div role="tablist" aria-label="Token saver workspace" className="inline-flex border border-border bg-surface-2 p-1">
          <button type="button" role="tab" aria-selected="true" className="min-h-10 bg-primary px-4 text-sm font-semibold text-white">Context</button>
          <button type="button" role="tab" aria-selected="false" className="min-h-10 px-4 text-sm text-text-muted">Output</button>
        </div>
        <p className="font-mono text-xs tabular-nums text-text-muted">{[rtkEnabled, headroomEnabled, cavemanEnabled, ponytailEnabled].filter(Boolean).length} / 4 stages enabled</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section aria-labelledby="pipeline-title" className="border border-border bg-surface">
          <header className="border-b border-border bg-surface-2 px-4 py-3">
            <h2 id="pipeline-title" className="font-semibold">Compression pipeline</h2>
            <p className="mt-1 text-xs text-text-muted">Input moves through each enabled context stage before routing.</p>
          </header>
          {[
            { index: "01", title: "Tool output · RTK", detail: "git, grep, trees, and logs → 60–90% fewer input tokens", enabled: rtkEnabled, toggle: handleRtkEnabled },
            { index: "02", title: "Context · Headroom", detail: "Prompt compression through the verified Headroom service", enabled: headroomEnabled, toggle: handleHeadroomEnabled, disabled: !headroomRunning },
            { index: "03", title: "LLM output · Caveman", detail: "Terse response posture → fewer output tokens", enabled: cavemanEnabled, toggle: handleCavemanEnabled },
            { index: "04", title: "Coding posture · Ponytail", detail: "YAGNI, reuse, and deletion-over-addition guidance", enabled: ponytailEnabled, toggle: handlePonytailEnabled },
          ].map((stage) => (
            <div key={stage.index} className="grid gap-3 border-b border-border p-4 last:border-b-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
              <span className="font-mono text-xs tabular-nums text-primary">{stage.index}</span>
              <div><h3 className="font-semibold">{stage.title}</h3><p className="mt-1 text-sm text-text-muted">{stage.detail}</p><p className={`mt-1 text-xs ${stage.enabled ? "text-success" : "text-text-muted"}`}>{stage.enabled ? "Enabled" : stage.disabled ? "Waiting for verification" : "Disabled"}</p></div>
              <Toggle checked={stage.enabled} disabled={stage.disabled} onChange={() => stage.toggle(!stage.enabled)} />
            </div>
          ))}
        </section>

        <aside aria-labelledby="savings-title" className="border border-border bg-surface p-4">
          <h2 id="savings-title" className="font-semibold">Current savings evidence</h2>
          <dl className="mt-4 grid grid-cols-2 gap-px bg-border">
            <div className="bg-surface-2 p-3"><dt className="text-xs text-text-muted">Before</dt><dd className="mt-1 font-mono text-xl tabular-nums">— tokens</dd></div>
            <div className="bg-surface-2 p-3"><dt className="text-xs text-text-muted">After</dt><dd className="mt-1 font-mono text-xl tabular-nums">— tokens</dd></div>
            <div className="col-span-2 bg-surface-2 p-3"><dt className="text-xs text-text-muted">Saved</dt><dd className="mt-1 font-mono text-xl tabular-nums">Awaiting measured traffic</dd></div>
          </dl>
          <p className="mt-3 text-xs text-text-muted">Evidence appears after a request passes through an enabled saver; estimates are never presented as billing.</p>
        </aside>
      </div>

      <section aria-labelledby="headroom-title" className="border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-3">
          <div><h2 id="headroom-title" className="font-semibold">Headroom setup rail</h2><p className="mt-1 text-xs text-text-muted">Environment check → Install → Verify service → Enable</p></div>
          <Button size="sm" variant="secondary" onClick={refreshHeadroomStatus} disabled={headroomStatus.loading}>{headroomStatus.loading ? "Checking…" : "Re-check"}</Button>
        </header>
        <ol className="relative divide-y divide-border">
          {headroomSteps.map((step, index) => (
            <li key={step.id} className="grid gap-3 p-4 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
              <span className="grid size-9 place-items-center border-2 border-primary font-mono text-sm text-primary">{index + 1}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{step.label}</h3><span className="text-xs font-semibold text-text-muted">{step.state}</span></div>
                <p className="mt-1 text-sm text-text-muted">{step.body}</p>
                {step.command && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><pre className="min-w-0 flex-1 overflow-x-auto border border-border bg-[var(--color-code-bg)] p-3 font-mono text-xs">{step.command}</pre><Button size="sm" variant="secondary" onClick={() => copy(step.command)}>{copied ? "Copied" : "Copy command"}</Button></div>}
                {step.id === "verify" && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]"><Input value={headroomUrl} onChange={(event) => setHeadroomUrl(event.target.value)} onBlur={handleHeadroomUrlBlur} aria-label="Headroom proxy URL" /><Input value={String(headroomTimeoutMs)} onChange={(event) => setHeadroomTimeoutMs(event.target.value)} onBlur={handleHeadroomTimeoutBlur} aria-label="Headroom timeout in milliseconds" /></div>}
                {step.id === "verify" && headroomCanStart && !headroomRunning && <Button className="mt-3" size="sm" onClick={handleHeadroomStart} disabled={headroomActionLoading}>{headroomActionLoading ? "Starting…" : "Start service"}</Button>}
                {step.id === "verify" && headroomManaged && headroomRunning && <Button className="mt-3" size="sm" variant="secondary" onClick={handleHeadroomStop} disabled={headroomActionLoading}>Stop service</Button>}
                {step.id === "enable" && <div className="mt-3 flex items-center gap-3"><Toggle checked={headroomEnabled} disabled={!headroomRunning} onChange={() => handleHeadroomEnabled(!headroomEnabled)} /><span className="text-sm">Use Headroom for context compression</span></div>}
                {step.recovery && <p className="mt-2 border-l-2 border-warning pl-3 text-xs text-warning">Recovery: {step.recovery}</p>}
              </div>
            </li>
          ))}
        </ol>
        {headroomStatus.installed && (
          <div className="border-t border-border bg-surface-2 p-4">
            <p className="mb-2 text-xs text-text-muted">Compression extras{headroomExtras.version ? ` · v${headroomExtras.version}` : ""}</p>
            {headroomExtras.available.map((extra) => {
              const installed = !!headroomExtras.extras[extra];
              const pending = pendingExtras.includes(extra);
              const active = extra === "code" ? codeAware : kompress;
              return (
                <div key={extra} className="flex flex-wrap items-center gap-3 border-t border-border py-2 text-xs first:border-t-0">
                  <code className="font-medium">[{extra}]</code>
                  <span className={installed ? "text-success" : "text-text-muted"}>{installed ? "Installed" : "Not installed"}</span>
                  {installed ? (
                    <>
                      <span>{active ? "Active" : "Inactive"}</span>
                      <Toggle size="sm" checked={active} disabled={restartingProxy} onChange={() => toggleExtraActive(extra, !active)} />
                      <button type="button" onClick={() => handleRemoveExtra(extra)} disabled={removingExtra === extra} className="text-danger underline">{removingExtra === extra ? "Uninstalling…" : "Uninstall"}</button>
                    </>
                  ) : (
                    <label className="flex items-center gap-2"><input type="checkbox" checked={pending} onChange={() => togglePendingExtra(extra)} /> Select to install</label>
                  )}
                </div>
              );
            })}
            {pendingExtras.length > 0 && <Button size="sm" onClick={handleInstallExtras} disabled={extrasActionLoading}>{extrasActionLoading ? "Installing…" : `Install [proxy,${pendingExtras.join(",")}]`}</Button>}
            {extrasActionError && <p className="mt-2 text-xs text-danger">{extrasActionError}</p>}
            {restartingProxy && <p className="mt-2 text-xs text-text-muted">Restarting proxy…</p>}
            {(extrasActionLoading || removingExtra) && installLog && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap bg-[var(--color-code-bg)] p-2 text-[10px] leading-tight text-text-muted">{installLog}</pre>}
            <p className="mt-2 text-xs text-text-muted">Installing adds the package; activate an installed extra with its toggle. The code extra enables AST compression. The ml extra enables Kompress-v2 and adds about 1 GB.</p>
          </div>
        )}
        {headroomActionError && <p className="border-t border-danger bg-danger/10 p-3 text-sm text-danger">{headroomActionError}</p>}
      </section>

      <section aria-labelledby="pxpipe-title" className="border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-3">
          <div><h2 id="pxpipe-title" className="font-semibold">PXPIPE</h2><p className="mt-1 text-xs text-text-muted">Multimodal prompt encoding for prompts above the configured threshold.</p></div>
          <span className={`text-xs font-semibold ${pxpipeChipClass}`}>{pxpipeStatusLabel}{pxpipeStatus.version ? ` · v${pxpipeStatus.version}` : ""}</span>
        </header>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Use PXPIPE</span><Toggle checked={pxpipeEnabled} onChange={() => handlePxpipeEnabled(!pxpipeEnabled)} /></div>
            <label className="grid gap-1 text-sm font-medium">Minimum prompt size (chars)<Input value={String(pxpipeMinChars)} onChange={(event) => setPxpipeMinChars(event.target.value)} onBlur={handlePxpipeMinCharsBlur} aria-label="PXPIPE minimum prompt size in characters" /></label>
            <div className="flex flex-wrap gap-2">
              {!pxpipeStatus.installed ? <Button size="sm" onClick={() => pxpipeAction("install")} disabled={pxpipeActionLoading || pxpipeStatus.installing}>{pxpipeActionLoading || pxpipeStatus.installing ? "Installing…" : "Install"}</Button> : pxpipeStatus.running ? <><Button size="sm" variant="secondary" onClick={() => pxpipeAction("restart")} disabled={pxpipeActionLoading}>Restart</Button><Button size="sm" variant="secondary" onClick={() => pxpipeAction("stop")} disabled={pxpipeActionLoading}>Stop</Button></> : <Button size="sm" onClick={() => pxpipeAction("start")} disabled={pxpipeActionLoading}>{pxpipeActionLoading ? "Starting…" : "Start"}</Button>}
              {pxpipeStatus.installed && <Button size="sm" variant="secondary" onClick={() => pxpipeAction("install")} disabled={pxpipeActionLoading}>Repair</Button>}
              <Button size="sm" variant="secondary" onClick={() => refreshPxpipeStatus().then(runPxpipeHealth)}>Re-check</Button>
              <a href="/dashboard/pxpipe#logs" className="inline-flex min-h-9 items-center border border-border px-3 text-sm">Open logs</a>
            </div>
            {pxpipeActionError && <p className="text-sm text-danger">{pxpipeActionError}</p>}
          </div>
          <div className="border border-border p-3">
            <p className="mb-2 text-sm font-medium">Health check</p>
            {pxpipeHealth?.checks?.length > 0 ? pxpipeHealth.checks.map((check) => <div key={check.id} className="flex items-center justify-between gap-3 py-1 text-xs"><span className={check.ok ? "text-success" : "text-warning"}>{check.ok ? "Ready" : "Needs attention"} · {check.label}</span>{check.detail && <span className="max-w-[50%] truncate font-mono text-text-muted">{check.detail}</span>}</div>) : <p className="text-xs text-text-muted">No health result yet.</p>}
            {pxpipeHealth?.error && <p className="mt-2 text-xs text-danger">{pxpipeHealth.error}</p>}
          </div>
        </div>
      </section>

      <section aria-labelledby="output-title" className="border border-border bg-surface">
        <header className="border-b border-border bg-surface-2 px-4 py-3"><h2 id="output-title" className="font-semibold">Output compression</h2></header>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="border-l-2 border-primary pl-3"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Caveman</h3><p className="text-sm text-text-muted">Choose response terseness.</p></div><Toggle checked={cavemanEnabled} onChange={() => handleCavemanEnabled(!cavemanEnabled)} /></div>{cavemanEnabled && <div className="mt-3 flex flex-wrap gap-2">{visibleCavemanLevels.map((level) => <button key={level.id} type="button" onClick={() => handleCavemanLevel(level.id)} className={`border px-3 py-2 text-xs ${cavemanLevel === level.id ? "border-primary text-primary" : "border-border"}`}>{level.label}</button>)}</div>}</div>
          <div className="border-l-2 border-primary pl-3"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Ponytail</h3><p className="text-sm text-text-muted">Choose coding restraint.</p></div><Toggle checked={ponytailEnabled} onChange={() => handlePonytailEnabled(!ponytailEnabled)} /></div>{ponytailEnabled && <div className="mt-3 flex flex-wrap gap-2">{PONYTAIL_LEVELS.map((level) => <button key={level.id} type="button" onClick={() => handlePonytailLevel(level.id)} className={`border px-3 py-2 text-xs ${ponytailLevel === level.id ? "border-primary text-primary" : "border-border"}`}>{level.label}</button>)}</div>}</div>
        </div>
      </section>

      <ConfirmModal
        isOpen={!!extrasConfirm}
        onClose={() => setExtrasConfirm(null)}
        onConfirm={() => {
          const fn = extrasConfirm?.onConfirm;
          setExtrasConfirm(null);
          fn?.();
        }}
        title={extrasConfirm?.title}
        message={extrasConfirm?.message}
        confirmText={extrasConfirm?.confirmText}
        variant={extrasConfirm?.variant}
      />
    </div>
  );
}
