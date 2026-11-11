"use client";

import Icon from "@/shared/components/Icon";
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, Button, Badge, Input } from "@/shared/components";
import { pickDefaultKeyId, labelForMaskedKey, isRunBlocked } from "@/lib/maskedKeyClient";
import { useOnDemandKey } from "@/shared/hooks/useOnDemandKey";
import { getGatewayOrigin, isDefaultGatewayOrigin } from "@/shared/utils/gatewayOrigin";

/**
 * Shared MITM infrastructure card — manages SSL cert + server start/stop.
 * DNS per-tool is handled separately in MitmToolCard.
 */
export default function MitmServerCard({ apiKeys, cloudEnabled, onStatusChange }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [sudoPassword, setSudoPasswordState] = useState("");
  // Mirror of the typed sudo password, read at the moment an action runs.
  // Retry closures and the port-443 conflict never capture the value itself.
  const sudoPasswordRef = useRef("");
  const [maskedKeys, setMaskedKeys] = useState(() => apiKeys || []);
  const [selectedKeyId, setSelectedKeyId] = useState(() => pickDefaultKeyId(apiKeys || []));
  // Manual entry only (used when no stored keys exist). Stored keys are never
  // revealed on mount: the raw key is fetched when Start is clicked.
  const [manualApiKey, setManualApiKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [actionError, setActionError] = useState(null);
  // Empty until mount, then the page origin (or the server-reported value).
  const [mitmRouterBaseUrl, setMitmRouterBaseUrl] = useState("");
  const [port443Conflict, setPort443Conflict] = useState(null);
  const onDemand = useOnDemandKey();

  const setSudoPassword = (value) => {
    sudoPasswordRef.current = value;
    setSudoPasswordState(value);
  };
  const clearSudoPassword = () => setSudoPassword("");

  // Never keep the sudo password after the card goes away.
  useEffect(() => () => { sudoPasswordRef.current = ""; }, []);

  const serverIsWindows = status?.isWin === true;
  const canRunWithoutPassword = serverIsWindows || status?.hasCachedPassword || status?.needsSudoPassword === false;
  const isAdmin = status?.isAdmin !== false;
  // No privilege: not admin/root AND (Win OR no cached sudo password)
  const noPrivilege = !isAdmin && (serverIsWindows || (!status?.hasCachedPassword && status?.needsSudoPassword !== false));

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/cli-tools/antigravity-mitm");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        // The server reports its documented default when nothing was saved;
        // show the origin this dashboard really runs on instead.
        if (data.mitmRouterBaseUrl) {
          setMitmRouterBaseUrl(isDefaultGatewayOrigin(data.mitmRouterBaseUrl) ? getGatewayOrigin({ loopback: true }) : data.mitmRouterBaseUrl);
        }
        onStatusChange?.(data);
      }
    } catch {
      setStatus({ running: false, certExists: false, dnsStatus: {} });
    }
  }, [onStatusChange]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchStatus();
    });
  }, [fetchStatus]);

  // Default router base derives from the current origin after mount, so the
  // field shows the port the dashboard really runs on (no hydration mismatch).
  // The MITM server dials it from this machine, so localhost is pinned to the
  // loopback address.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMitmRouterBaseUrl((current) => current || getGatewayOrigin({ loopback: true }));
  }, []);

  useEffect(() => {
    const keys = apiKeys || [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaskedKeys(keys);
    const id = pickDefaultKeyId(keys);
    // Selection only: the key itself is resolved when Start is clicked. Any
    // cached or revealed key from a previous list is dropped.
    onDemand.reset();
    setKeyError("");
    clearSudoPassword();
    setSelectedKeyId(id || "");
  }, [apiKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = (action) => {
    setActionError(null);
    // Wait for status to load before deciding whether to show sudo modal
    if (!status) return;
    if (canRunWithoutPassword) {
      doAction(action, "");
    } else {
      setPendingAction(action);
      setShowPasswordModal(true);
      setModalError(null);
    }
  };

  // Retry of a failed Start re-reads the password at retry time. If it was
  // cleared (modal closed, selection changed) and one is needed, ask again.
  const retryStart = (forceKillPort443 = false) => {
    const password = sudoPasswordRef.current;
    if (!canRunWithoutPassword && !password) {
      handleAction("start");
      return;
    }
    doAction("start", password, forceKillPort443);
  };

  const doAction = async (action, password, forceKillPort443 = false) => {
    setLoading(true);
    setActionError(null);
    try {
      let res;
      if (action === "trust-cert") {
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trust-cert", sudoPassword: password }),
        });
      } else if (action === "start") {
        let keyToUse = maskedKeys.length === 0 ? (manualApiKey.trim() || null) : null;
        if (!keyToUse && selectedKeyId) {
          // Lazy reveal at click time. A failure (429 included) shows an
          // inline alert with Retry and leaves Start enabled.
          await onDemand.withKey(selectedKeyId, (raw) => { keyToUse = raw; }, "start", {
            retry: () => retryStart(forceKillPort443),
          });
          if (!keyToUse) {
            setLoading(false);
            setPendingAction(null);
            return;
          }
        }
        if (!keyToUse) {
          setKeyError("No API key selected — pick a key or enter one manually");
          setLoading(false);
          setPendingAction(null);
          return;
        }
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: keyToUse,
            sudoPassword: password,
            mitmRouterBaseUrl: mitmRouterBaseUrl.trim() || getGatewayOrigin({ loopback: true }),
            forceKillPort443,
          }),
        });
      } else {
        res = await fetch("/api/cli-tools/antigravity-mitm", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sudoPassword: password }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "PORT_443_BUSY" && data.portOwner) {
          // The password stays only in the ref until Kill & Start or Cancel.
          sudoPasswordRef.current = password;
          setShowPasswordModal(false);
          setSudoPasswordState("");
          setPort443Conflict({ owner: data.portOwner });
          return;
        }
        setActionError(data.error || `Failed to ${action} MITM server`);
        return;
      }
      setShowPasswordModal(false);
      clearSudoPassword();
      setPort443Conflict(null);
      await fetchStatus();
    } catch (e) {
      setActionError(e.message || "Network error");
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const handleKillAndStart = () => {
    doAction("start", sudoPasswordRef.current, true);
  };

  const handleConfirmPassword = () => {
    if (!sudoPassword.trim()) {
      setModalError("Sudo password is required");
      return;
    }
    doAction(pendingAction, sudoPassword);
  };

  const isRunning = status?.running;
  // Keys arrive via props with no load signal from the parent: the list is
  // treated as settled (manual entry when empty). Reveal state never blocks.
  const keyBlocked = isRunBlocked({ keys: maskedKeys, selectedId: selectedKeyId, loading: false, keysError: "" });
  const selectedKey = maskedKeys.find((k) => k.id === selectedKeyId);
  const revealedKey = onDemand.revealedFor(selectedKeyId);

  return (
    <>
      <Card padding="sm" className="border-primary/20 bg-primary/5">
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Icon name="security" className="text-primary text-[20px]" />
              <span className="font-semibold text-sm text-text-main">MITM Server</span>
              {isRunning ? (
                <Badge variant="success" size="sm">Running</Badge>
              ) : (
                <Badge variant="default" size="sm">Stopped</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs text-text-muted" data-i18n-skip="true">
              {[
                { label: "Cert", ok: status?.certExists },
                { label: "Trusted", ok: status?.certTrusted },
                { label: "Server", ok: isRunning },
              ].map(({ label, ok }) => (
                <span key={label} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${ok ? "text-green-600" : "text-text-muted"}`}>
                  <Icon name={ok ? "check_circle" : "cancel"} className="text-[12px]" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Purpose & How it works */}
          <div className="px-2 py-2 rounded-lg bg-surface/50 border border-border/50 flex flex-col gap-2">
            <p className="text-[11px] text-text-muted leading-relaxed">
              <span className="font-medium text-text-main">Purpose:</span> Use Antigravity IDE & GitHub Copilot → with ANY provider/model from KRouter9
            </p>
            <p className="text-[11px] text-text-muted leading-relaxed">
              <span className="font-medium text-text-main">How it works:</span> Antigravity/Copilot IDE request → DNS redirect to localhost:443 → MITM proxy intercepts → KRouter9 → response to Antigravity/Copilot
            </p>
          </div>

          {/* Base URL + API Key — same row pattern as Claude Code / cli-tools */}
          <div className="flex flex-col gap-2">
            <div className="grid gap-1 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
              <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">KRouter9 Base URL</span>
              <Icon name="arrow_forward" className="hidden text-text-muted text-[14px] sm:inline" />
              <input
                type="text"
                value={mitmRouterBaseUrl}
                onChange={(e) => setMitmRouterBaseUrl(e.target.value)}
                aria-label="KRouter9 base URL"
                placeholder="http://127.0.0.1:<port>"
                disabled={isRunning}
                className="flex-1 min-w-0 min-h-11 px-2 py-1.5 bg-surface rounded border border-border text-xs text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              />
            </div>
            {!isRunning && (
              <div className="grid gap-1 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-2">
                <span className="text-xs font-semibold text-text-main sm:text-right sm:text-sm">API Key</span>
                <Icon name="arrow_forward" className="hidden text-text-muted text-[14px] sm:inline" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {maskedKeys.length > 0 ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <select
                        aria-label="API key for the MITM server"
                        value={selectedKeyId}
                        onChange={(e) => {
                          onDemand.reset();
                          setKeyError("");
                          clearSudoPassword();
                          setSelectedKeyId(e.target.value);
                        }}
                        className="flex-1 min-w-0 min-h-11 px-2 py-1.5 bg-surface rounded border border-border text-xs text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        <option value="">Select API key</option>
                        {maskedKeys.map((key) => (
                          <option key={key.id} value={key.id}>{labelForMaskedKey(key)}</option>
                        ))}
                      </select>
                      {selectedKeyId && (
                        <button
                          type="button"
                          onClick={() => (revealedKey ? onDemand.hide() : onDemand.reveal(selectedKeyId))}
                          aria-pressed={!!revealedKey}
                          aria-label={revealedKey ? `Hide ${selectedKey?.name || "API key"}` : `Reveal ${selectedKey?.name || "API key"}`}
                          disabled={onDemand.pending === "reveal"}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded border border-border px-2 text-[11px] text-text-muted hover:text-primary transition-colors disabled:opacity-50"
                        >
                          <Icon name={revealedKey ? "visibility_off" : "visibility"} className="text-[14px]" />
                          {revealedKey ? "Hide" : "Reveal"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <input
                      type="password"
                      value={manualApiKey}
                      aria-label="API key"
                      onChange={(e) => { setKeyError(""); setManualApiKey(e.target.value); }}
                      placeholder={cloudEnabled ? "Enter API key" : "Enter API key manually"}
                      className="flex-1 min-w-0 min-h-11 px-2 py-1.5 bg-surface rounded border border-border text-xs text-text-main focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  )}
                  {revealedKey && (
                    <code className="block break-all rounded bg-surface px-2 py-1 text-[11px] font-mono text-text-main">{revealedKey}</code>
                  )}
                  {keyError && <span role="alert" className="text-[11px] text-red-500 break-words">{keyError}</span>}
                  {onDemand.error && (
                    <span role="alert" className="flex flex-wrap items-center gap-2 text-[11px] text-red-500">
                      <span className="break-words">{onDemand.error}</span>
                      <button type="button" onClick={onDemand.retry} className="underline hover:text-primary">Retry</button>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" data-i18n-skip="true">
            {status?.certExists && !status?.certTrusted && (
              <button
                onClick={() => handleAction("trust-cert")}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs font-medium text-yellow-600 transition-colors hover:bg-yellow-500/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
              >
                <Icon name="verified_user" className="text-[16px]" />
                Trust Cert
              </button>
            )}
            {isRunning ? (
              <button
                onClick={() => handleAction("stop")}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50 sm:w-auto sm:py-1.5"
              >
                <Icon name="stop_circle" className="text-[16px]" />
                Stop Server
              </button>
            ) : (
              <button
                onClick={() => handleAction("start")}
                disabled={loading || !status || (serverIsWindows && !isAdmin) || keyBlocked}
                title={serverIsWindows && !isAdmin ? "Administrator required" : undefined}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50 min-h-11 sm:w-auto sm:py-1.5"
              >
                <Icon name="play_circle" className="text-[16px]" />
                Start Server
              </button>
            )}
            {isRunning && (
              <p className="text-xs text-text-muted">Enable DNS per tool below to activate interception</p>
            )}
          </div>

          {/* Action error */}
          {actionError && (
            <div className="flex items-start gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
              <Icon name="error" className="text-[14px] mt-0.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Windows admin warning */}
          {serverIsWindows && !isAdmin && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600 border border-red-500/20">
              <Icon name="shield_lock" className="text-[14px]" />
              <span>Administrator required — restart KRouter9 as Administrator to use MITM</span>
            </div>
          )}
        </div>
      </Card>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Sudo Password Required</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <Icon name="warning" className="text-yellow-500 text-[20px]" />
              <p className="text-xs text-text-muted">Required for SSL certificate and server startup</p>
            </div>
            <Input
              type="password"
              placeholder="Enter sudo password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleConfirmPassword(); }}
            />
            {modalError && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs bg-red-500/10 text-red-600">
                <Icon name="error" className="text-[14px]" />
                <span>{modalError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowPasswordModal(false); clearSudoPassword(); setModalError(null); }} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmPassword} loading={loading}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Port 443 Conflict Modal */}
      {port443Conflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xl sm:p-6">
            <h3 className="font-semibold text-text-main">Port 443 Already In Use</h3>
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <Icon name="warning" className="text-yellow-500 text-[20px]" />
              <div className="flex flex-col gap-1 text-xs text-text-muted">
                <p>Port 443 is currently used by another process:</p>
                <p className="font-mono text-text-main" data-i18n-skip="true">
                  {port443Conflict.owner.name} (PID {port443Conflict.owner.pid})
                </p>
                <p>Kill this process to start MITM Server?</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setPort443Conflict(null); clearSudoPassword(); setLoading(false); }} disabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleKillAndStart} loading={loading}>
                Kill & Start
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
