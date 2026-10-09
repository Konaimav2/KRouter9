"use client";
/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import { Button, Input, CardSkeleton, Toggle } from "@/shared/components";
import { Dialog, ConfirmDialog } from "@/shared/components/overlays";
import { AlertCircle, Check, CheckCircle2, CloudUpload, Copy, Eye, EyeOff, KeyRound, LoaderCircle, Power, Search, Settings, ShieldCheck, Trash2 } from "lucide-react";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import {
  TUNNEL_BENEFITS,
  TUNNEL_PING_INTERVAL_MS,
  TUNNEL_PING_MAX_MS,
  STATUS_POLL_FAST_MS,
  REACHABLE_MISS_THRESHOLD,
  CLIENT_PING_FAST_MS,
} from "./endpointConstants";
import { clientPingUrl, clientPingAny } from "./endpointPing";
import EndpointRow from "./components/EndpointRow";
import ManageKeyModal from "./components/ManageKeyModal";
import StatusAlert from "./components/StatusAlert";
import Tooltip from "./components/Tooltip";
import SecurityWarning from "./components/SecurityWarning";
export default function APIPageClient({ machineId }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [manageKey, setManageKey] = useState(null);
  const [rotatedKey, setRotatedKey] = useState(null);
  const [keyQuery, setKeyQuery] = useState("");
  const [keyStatus, setKeyStatus] = useState("all");
  const [keySort, setKeySort] = useState("name");

  const [requireApiKey, setRequireApiKey] = useState(false);
  const [requireLogin, setRequireLogin] = useState(true);
  const [hasPassword, setHasPassword] = useState(true);
 const [tunnelDashboardAccess, setTunnelDashboardAccess] = useState(false);

 // Cloudflare Tunnel state
  const [tunnelChecking, setTunnelChecking] = useState(true);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelReachable, setTunnelReachable] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelProgress, setTunnelProgress] = useState("");
  const [tunnelStatus, setTunnelStatus] = useState(null);
  const [showEnableTunnelModal, setShowEnableTunnelModal] = useState(false);
  const [showDisableTunnelModal, setShowDisableTunnelModal] = useState(false);

  // Tailscale state
  const [tsEnabled, setTsEnabled] = useState(false);
  const [tsReachable, setTsReachable] = useState(false);
  const [tsUrl, setTsUrl] = useState("");
  const [tsLoading, setTsLoading] = useState(false);
  const [tsProgress, setTsProgress] = useState("");
  const [tsStatus, setTsStatus] = useState(null);
  const [tsAuthUrl, setTsAuthUrl] = useState("");
  const [tsAuthLabel, setTsAuthLabel] = useState("");
  const [tsInstalled, setTsInstalled] = useState(null); // null=checking, true/false
  const [tsInstalling, setTsInstalling] = useState(false);
  const [tsInstallLog, setTsInstallLog] = useState([]);
  const [tsSudoPassword, setTsSudoPassword] = useState("");
  const [tsConnecting, setTsConnecting] = useState(false);
  const [showTsModal, setShowTsModal] = useState(false);
  const [showDisableTsModal, setShowDisableTsModal] = useState(false);
  const tsLogRef = useRef(null);

  // Debounce reachable=false: server may briefly return false during background refresh.
  // Only flip UI to "reconnecting" after N consecutive misses to avoid spinner flicker.
  const tunnelMissRef = useRef(0);
  const tsMissRef = useRef(0);
  // Browser-side reachable cache (independent of backend DNS quirks)
  const tunnelClientReachableRef = useRef(false);
  const tsClientReachableRef = useRef(false);
  // Track whether reachable=true was ever observed in this session.
  // Distinguishes "Checking..." (initial cold cache) from "Reconnecting..." (lost connection).
  const tunnelEverReachableRef = useRef(false);
  const tsEverReachableRef = useRef(false);
  const [tunnelEverReachable, setTunnelEverReachable] = useState(false);
  const [tsEverReachable, setTsEverReachable] = useState(false);

  // API key visibility: masked metadata only at rest. Reveal/copy fetch the raw
  // secret via the guarded single-record endpoint and clear it ≤15s + on
  // dismiss/navigate. Copy discards the transient immediately after writing.
  const [revealedKeys, setRevealedKeys] = useState({}); // id -> raw string (transient)
  const [revealError, setRevealError] = useState(null);
  const revealTimersRef = useRef(new Map()); // id -> timeout handle

  // Client-side local/remote detection (UI hint only, not a security gate)
  const [isRemoteHost, setIsRemoteHost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined")
      setIsRemoteHost(!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
  }, []);

  // Clear any revealed secret when the page unmounts / user navigates away.
  useEffect(() => {
    const timers = revealTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      setRevealedKeys({});
    };
  }, []);

  const clearRevealedKey = useCallback((keyId) => {
    const timers = revealTimersRef.current;
    const t = timers.get(keyId);
    if (t) {
      clearTimeout(t);
      timers.delete(keyId);
    }
    setRevealedKeys((prev) => {
      if (!(keyId in prev)) return prev;
      const next = { ...prev };
      delete next[keyId];
      return next;
    });
  }, []);

  const scheduleRevealClear = useCallback((keyId) => {
    const timers = revealTimersRef.current;
    const prev = timers.get(keyId);
    if (prev) clearTimeout(prev);
    timers.set(keyId, setTimeout(() => {
      timers.delete(keyId);
      setRevealedKeys((old) => {
        if (!(keyId in old)) return old;
        const next = { ...old };
        delete next[keyId];
        return next;
      });
    }, 15_000));
  }, []);

  const { copied, copy } = useCopyToClipboard();

  // Guarded single-record read: the raw secret lives in state for <=15s,
  // cleared on hide/delete/toggle/unmount. List/detail APIs carry maskedKey
  // only; the raw string never flows through them.
  const revealKey = useCallback(async (keyId) => {
    if (!keyId) return;
    if (revealedKeys[keyId]) {
      clearRevealedKey(keyId);
      return;
    }
    setRevealError(null);
    try {
      const res = await fetch(`/api/keys/${keyId}/reveal?confirm=true`, { cache: "no-store" });
      if (!res.ok) {
        setRevealError(res.status === 404 ? "Key not found." : "Reveal failed.");
        return;
      }
      const data = await res.json();
      if (!data || typeof data.key !== "string" || !data.key) {
        setRevealError("Reveal failed.");
        return;
      }
      setRevealedKeys((prev) => ({ ...prev, [keyId]: data.key }));
      scheduleRevealClear(keyId);
    } catch {
      setRevealError("Reveal failed.");
    }
  }, [revealedKeys, clearRevealedKey, scheduleRevealClear]);

  // Copy via the guarded read; the transient is discarded immediately after
  // the clipboard write so the raw secret never rests in state.
  const copyKeyViaReveal = useCallback(async (keyId) => {
    if (!keyId) return;
    setRevealError(null);
    try {
      const res = await fetch(`/api/keys/${keyId}/reveal?confirm=true`, { cache: "no-store" });
      if (!res.ok) {
        setRevealError(res.status === 404 ? "Key not found." : "Copy failed.");
        return;
      }
      const data = await res.json();
      if (!data || typeof data.key !== "string" || !data.key) {
        setRevealError("Copy failed.");
        return;
      }
      copy(data.key, keyId);
      // Discard: never retain a copy-transient; drop any prior reveal too.
      clearRevealedKey(keyId);
    } catch {
      setRevealError("Copy failed.");
    }
  }, [clearRevealedKey, copy]);

  // Security gate: block remote exposure while dashboard uses default password or login is off.
  const isLoginUnsafe = !requireLogin || !hasPassword;
  const unsafeReason = !requireLogin
    ? "Enable \"Require login\" and set a custom password before activating the tunnel."
    : "Change the default dashboard password before activating the tunnel.";

  // Auto-scroll install log
  useEffect(() => {
    if (tsLogRef.current) tsLogRef.current.scrollTop = tsLogRef.current.scrollHeight;
  }, [tsInstallLog]);

  useEffect(() => {
    fetchData();
    loadSettings();
  }, []);

  // Status poll: only while degraded (not yet reachable). Stop once healthy to avoid spam.
  // Visibility re-check: refresh once when tab becomes visible.
  useEffect(() => {
    const anyEnabled = tunnelEnabled || tsEnabled;
    if (!anyEnabled) return;
    const tunnelHealthy = !tunnelEnabled || tunnelReachable;
    const tsHealthy = !tsEnabled || tsReachable;
    const allHealthy = tunnelHealthy && tsHealthy;
    const onVisible = () => { if (!document.hidden) syncTunnelStatus(); };
    document.addEventListener("visibilitychange", onVisible);
    if (allHealthy) return () => document.removeEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => { if (!document.hidden) syncTunnelStatus(); }, STATUS_POLL_FAST_MS);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tunnelEnabled, tsEnabled, tunnelReachable, tsReachable]);

  // Browser-side periodic ping: probes tunnel/tailscale URLs directly so UI stays
  // "reachable" even when backend DNS (1.1.1.1) hiccups on *.ts.net or *.trycloudflare.com.
  // Adaptive: slow when healthy, fast when degraded; pause when tab hidden.
  useEffect(() => {
    const probeBoth = async () => {
      if (document.hidden) return;
      if (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) {
        const ok = await clientPingAny(tunnelPublicUrl, tunnelUrl);
        tunnelClientReachableRef.current = ok;
        if (ok) { tunnelMissRef.current = 0; setTunnelReachable(true); if (!tunnelEverReachableRef.current) { tunnelEverReachableRef.current = true; setTunnelEverReachable(true); } }
        else { tunnelMissRef.current += 1; if (tunnelMissRef.current >= REACHABLE_MISS_THRESHOLD) setTunnelReachable(false); }
      } else {
        tunnelClientReachableRef.current = false;
      }
      if (tsEnabled && tsUrl) {
        const ok = await clientPingUrl(tsUrl);
        tsClientReachableRef.current = ok;
        if (ok) { tsMissRef.current = 0; setTsReachable(true); if (!tsEverReachableRef.current) { tsEverReachableRef.current = true; setTsEverReachable(true); } }
        else { tsMissRef.current += 1; if (tsMissRef.current >= REACHABLE_MISS_THRESHOLD) setTsReachable(false); }
      } else {
        tsClientReachableRef.current = false;
      }
    };
    const anyEnabled = (tunnelEnabled && (tunnelUrl || tunnelPublicUrl)) || (tsEnabled && tsUrl);
    if (!anyEnabled) return;
    probeBoth();
    const tunnelHealthy = !tunnelEnabled || tunnelReachable;
    const tsHealthy = !tsEnabled || tsReachable;
    if (tunnelHealthy && tsHealthy) return;
    const id = setInterval(probeBoth, CLIENT_PING_FAST_MS);
    return () => clearInterval(id);
  }, [tunnelEnabled, tunnelUrl, tunnelPublicUrl, tsEnabled, tsUrl, tunnelReachable, tsReachable]);

  // Client-side reachable only (server no longer probes; watchdog handles backend health).
  // Miss-debounce: only flip to false after N consecutive misses.
  const updateReachable = useCallback((_unused, clientRef, missRef, setter, everRef, everSetter) => {
    const reachable = clientRef.current;
    if (reachable) {
      missRef.current = 0;
      setter(true);
      if (!everRef.current) {
        everRef.current = true;
        everSetter(true);
      }
    } else {
      missRef.current += 1;
      if (missRef.current >= REACHABLE_MISS_THRESHOLD) setter(false);
    }
  }, []);

  // Trust user intent (settingsEnabled): UI stays "enabled" while watchdog restarts process
  const syncTunnelStatus = async () => {
    try {
      const statusRes = await fetch("/api/tunnel/status", { cache: "no-store" });
      if (!statusRes.ok) return;
      const data = await statusRes.json();
      const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
      const tUrl = data.tunnel?.tunnelUrl || "";
      setTunnelUrl(tUrl);
      setTunnelPublicUrl(data.tunnel?.publicUrl || "");
      setTunnelEnabled(tEnabled);
      updateReachable(null, tunnelClientReachableRef, tunnelMissRef, setTunnelReachable, tunnelEverReachableRef, setTunnelEverReachable);

      const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
      const tsUrlVal = data.tailscale?.tunnelUrl || "";
      setTsUrl(tsUrlVal);
      setTsEnabled(tsEn);
      updateReachable(null, tsClientReachableRef, tsMissRef, setTsReachable, tsEverReachableRef, setTsEverReachable);
    } catch { /* ignore poll errors */ }
  };

  const loadSettings = async () => {
    setTunnelChecking(true);
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/tunnel/status", { cache: "no-store" })
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setRequireApiKey(data.requireApiKey || false);
        setRequireLogin(data.requireLogin !== false);
        setHasPassword(data.hasPassword || false);
        setTunnelDashboardAccess(data.tunnelDashboardAccess || false);
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        const tEnabled = data.tunnel?.settingsEnabled ?? data.tunnel?.enabled ?? false;
        const tUrl = data.tunnel?.tunnelUrl || "";
        setTunnelUrl(tUrl);
        setTunnelPublicUrl(data.tunnel?.publicUrl || "");
        setTunnelEnabled(tEnabled);
        updateReachable(null, tunnelClientReachableRef, tunnelMissRef, setTunnelReachable, tunnelEverReachableRef, setTunnelEverReachable);

        const tsEn = data.tailscale?.settingsEnabled ?? data.tailscale?.enabled ?? false;
        const tsUrlVal = data.tailscale?.tunnelUrl || "";
        setTsUrl(tsUrlVal);
        setTsEnabled(tsEn);
        updateReachable(null, tsClientReachableRef, tsMissRef, setTsReachable, tsEverReachableRef, setTsEverReachable);
      }
    } catch (error) {
      console.log("Error loading settings:", error);
    } finally {
      setTunnelChecking(false);
    }
  };

  const handleTunnelDashboardAccess = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tunnelDashboardAccess: value }),
      });
      if (res.ok) setTunnelDashboardAccess(value);
    } catch (error) {
      console.log("Error updating tunnelDashboardAccess:", error);
    }
  };

  const handleRequireApiKey = async (value) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireApiKey: value }),
      });
      if (res.ok) setRequireApiKey(value);
    } catch (error) {
      console.log("Error updating requireApiKey:", error);
    }
  };

  const fetchData = async () => {
    try {
      const fetchKeys = async () => {
        const res = await fetch("/api/keys");
        if (!res.ok) return [];
        const data = await res.json();
        return data.keys || [];
      };

      let existing = await fetchKeys();
      // Auto-provision a default key for first-time users so the endpoint works out of the box.
      if (existing.length === 0) {
        try {
          const createRes = await fetch("/api/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Default Key" }),
          });
          if (createRes.ok) existing = await fetchKeys();
        } catch { /* fall through to empty render */ }
      }
      setKeys(existing);
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // u2500u2500u2500 Cloudflare Tunnel handlers
  // Ping tunnel health until reachable. Race multiple URLs (shortlink + direct) — 1 OK is enough.
  const pingTunnelHealth = async (...urls) => {
    setTunnelLoading(true);
    setTunnelProgress("Waiting for tunnel ready...");
    const targets = urls.filter(Boolean).map((u) => `${u}/api/health`);
    const start = Date.now();
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      const ok = await Promise.any(targets.map(async (h) => {
        const p = await fetch(h, { mode: "cors", cache: "no-store" });
        if (p.ok) return true;
        throw new Error("not ready");
      })).catch(() => false);
      if (ok) {
        setTunnelEnabled(true);
        setTunnelLoading(false);
        setTunnelProgress("");
        return true;
      }
      // Every 5 pings (~10s), check if backend process still alive
      if ((Date.now() - start) % 10000 < TUNNEL_PING_INTERVAL_MS) {
        try {
          const statusRes = await fetch("/api/tunnel/status");
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (!status.tunnel?.enabled) {
              setTunnelStatus({ type: "error", message: "Tunnel process stopped unexpectedly." });
              setTunnelLoading(false);
              setTunnelProgress("");
              return false;
            }
          }
        } catch { /* ignore */ }
      }
    }
    setTunnelStatus({ type: "error", message: "Tunnel created but not reachable. Please try again." });
    setTunnelLoading(false);
    setTunnelProgress("");
    return false;
  };

  const handleEnableTunnel = async () => {
    setShowEnableTunnelModal(false);
    setTunnelLoading(true);
    setTunnelStatus(null);
    setTunnelProgress("Creating tunnel...");

    // Poll download progress while enable request is pending
    let polling = true;
    const pollProgress = async () => {
      while (polling) {
        try {
          const r = await fetch("/api/tunnel/status");
          if (r.ok) {
            const s = await r.json();
            if (s.download?.downloading) {
              setTunnelProgress(`Downloading cloudflared... ${s.download.progress}%`);
            } else if (polling) {
              setTunnelProgress("Creating tunnel...");
            }
          }
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    pollProgress();

    try {
      const res = await fetch("/api/tunnel/enable", { method: "POST" });
      polling = false;
      const data = await res.json();
      if (!res.ok) {
        setTunnelStatus({ type: "error", message: data.error || "Failed to enable tunnel" });
        return;
      }

      const url = data.tunnelUrl;
      if (!url) {
        setTunnelStatus({ type: "error", message: "No tunnel URL returned" });
        return;
      }

      setTunnelUrl(url);
      setTunnelPublicUrl(data.publicUrl || "");
      await pingTunnelHealth(data.publicUrl, url);
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      polling = false;
      setTunnelLoading(false);
      setTunnelProgress("");
    }
  };

  const handleDisableTunnel = async () => {
    setTunnelLoading(true);
    setTunnelStatus(null);
    try {
      const res = await fetch("/api/tunnel/disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTunnelEnabled(false);
        setTunnelUrl("");
        setShowDisableTunnelModal(false);
        setTunnelStatus({ type: "success", message: "Tunnel disabled" });
      } else {
        setTunnelStatus({ type: "error", message: data.error || "Failed to disable tunnel" });
      }
    } catch (error) {
      setTunnelStatus({ type: "error", message: error.message });
    } finally {
      setTunnelLoading(false);
    }
  };

  // u2500u2500u2500 Tailscale handlers
  const checkTailscaleInstalled = async () => {
    setTsInstalled(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-check");
      if (res.ok) {
        const data = await res.json();
        setTsInstalled(data.installed);
        return data;
      }
    } catch { /* ignore */ }
    setTsInstalled(false);
    return { installed: false };
  };

  const handleInstallTailscale = async () => {
    setTsInstalling(true);
    setTsStatus(null);
    setTsInstallLog([]);
    try {
      const res = await fetch("/api/tunnel/tailscale-install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sudoPassword: tsSudoPassword }),
      });
      setTsSudoPassword("");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "progress";
          let data = null;
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            if (line.startsWith("data: ")) {
              try { data = JSON.parse(line.slice(6)); } catch { /* skip */ }
            }
          }
          if (!data) continue;
          if (event === "progress") {
            setTsInstallLog((prev) => [...prev.slice(-50), data.message]);
          } else if (event === "done") {
            setTsInstalled(true);
            setTsInstalling(false);
            setShowTsModal(false);
            handleConnectTailscale();
            return;
          } else if (event === "error") {
            setTsStatus({ type: "error", message: data.error || "Install failed" });
          }
        }
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsInstalling(false);
    }
  };

  // Ping Tailscale health until reachable
  const pingTsHealth = async (url) => {
    setTsProgress("Waiting for Tailscale ready...");
    const healthUrl = `${url}/api/health`;
    const start = Date.now();
    while (Date.now() - start < TUNNEL_PING_MAX_MS) {
      await new Promise((r) => setTimeout(r, TUNNEL_PING_INTERVAL_MS));
      try {
        const ping = await fetch(healthUrl, { mode: "no-cors", cache: "no-store" });
        if (ping.ok || ping.type === "opaque") return true;
      } catch { /* not ready yet */ }
    }
    return false;
  };

  // Show inline login button instead of auto-opening popup (browsers block popups
  // opened after async work because the user gesture is lost).
  const requestUserAuth = (url, label) => {
    setTsAuthUrl(url);
    setTsAuthLabel(label);
  };

  const clearUserAuth = () => {
    setTsAuthUrl("");
    setTsAuthLabel("");
  };

  const handleConnectTailscale = async () => {
    setShowTsModal(false);
    setTsConnecting(true);
    setTsLoading(true);
    setTsStatus(null);
    setTsProgress("Connecting...");
    clearUserAuth();
    try {
      const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setTsUrl(data.tunnelUrl || "");
        const reachable = await pingTsHealth(data.tunnelUrl);
        setTsEnabled(true);
        setTsStatus(reachable ? null : { type: "warning", message: "Connected but not reachable yet." });
        return;
      }

      if (data.needsLogin && data.authUrl) {
        requestUserAuth(data.authUrl, "Open Login Page");
        setTsProgress("Login required — click \"Open Login Page\" to continue");
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const r2 = await fetch("/api/tunnel/tailscale-check");
            if (r2.ok) {
              const check = await r2.json();
              if (check.loggedIn) {
                clearUserAuth();
                setTsProgress("Starting funnel...");
                const res2 = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
                const data2 = await res2.json();
                if (res2.ok && data2.success) {
                  setTsUrl(data2.tunnelUrl || "");
                  const ok2 = await pingTsHealth(data2.tunnelUrl);
                  setTsEnabled(true);
                  setTsStatus(ok2 ? null : { type: "warning", message: "Connected but not reachable yet." });
                } else if (data2.funnelNotEnabled && data2.enableUrl) {
                  await pollFunnelEnable(data2.enableUrl);
                } else {
                  setTsStatus({ type: "error", message: data2.error || "Failed to start funnel" });
                }
                return;
              }
            }
          } catch { /* retry */ }
        }
        clearUserAuth();
        setTsStatus({ type: "error", message: "Login timed out. Please try again." });
        return;
      }

      if (data.funnelNotEnabled && data.enableUrl) {
        await pollFunnelEnable(data.enableUrl);
        return;
      }

      setTsStatus({ type: "error", message: data.error || "Failed to connect" });
    } catch (error) {
      setTsStatus({ type: "error", message: error.message });
    } finally {
      setTsLoading(false);
      setTsConnecting(false);
      setTsProgress("");
      clearUserAuth();
    }
  };

  const pollFunnelEnable = async (enableUrl) => {
    requestUserAuth(enableUrl, "Open Funnel Settings");
    setTsProgress("Click \"Open Funnel Settings\" to enable Funnel...");
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch("/api/tunnel/tailscale-enable", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.success) {
          clearUserAuth();
          setTsUrl(data.tunnelUrl || "");
          const ok3 = await pingTsHealth(data.tunnelUrl);
          setTsEnabled(true);
          setTsStatus(ok3 ? null : { type: "warning", message: "Connected but not reachable yet." });
          return;
        }
        if (data.funnelNotEnabled) continue;
        if (data.error) {
          clearUserAuth();
          setTsStatus({ type: "error", message: data.error });
          return;
        }
      } catch { /* retry */ }
    }
    clearUserAuth();
    setTsStatus({ type: "error", message: "Timed out waiting for Funnel to be enabled." });
  };

  const handleDisableTailscale = async () => {
    setTsLoading(true);
    setTsStatus(null);
    try {
      const res = await fetch("/api/tunnel/tailscale-disable", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTsEnabled(false);
        setTsUrl("");
        setShowDisableTsModal(false);
        setTsStatus({ type: "success", message: "Tailscale disabled" });
      } else {
        setTsStatus({ type: "error", message: data.error || "Failed to disable Tailscale" });
      }
    } catch (e) {
      setTsStatus({ type: "error", message: e.message });
    } finally {
      setTsLoading(false);
    }
  };

  const handleOpenTsModal = async () => {
    setTsStatus(null);
    setTsInstallLog([]);
    const data = await checkTailscaleInstalled();
    if (data?.installed && data?.hasCachedPassword) {
      handleConnectTailscale();
    } else {
      setShowTsModal(true);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();

      if (res.ok) {
        setCreatedKey(data.key);
        await fetchData();
        setNewKeyName("");
        setShowAddModal(false);
      }
    } catch (error) {
      console.log("Error creating key:", error);
    }
  };

  const handleDeleteKey = async (id) => {
    setConfirmState({
      title: "Delete API Key",
      message: "Delete this API key?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
          if (res.ok) {
            setKeys(keys.filter((k) => k.id !== id));
            clearRevealedKey(id);
          }
        } catch (error) {
          console.log("Error deleting key:", error);
        }
      }
    });
  };

  const handleToggleKey = async (id, isActive) => {
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        // Pause/resume invalidates any transient reveal for that key.
        clearRevealedKey(id);
        setKeys(prev => prev.map(k => k.id === id ? { ...k, isActive } : k));
      }
    } catch (error) {
      console.log("Error toggling key:", error);
    }
  };

  const maskKey = (fullKey) => {
    if (!fullKey || fullKey.length <= 10) return fullKey || "";
    return fullKey.slice(0, 6) + "•".repeat(fullKey.length - 10) + fullKey.slice(-4);
  };

  // Client fallback only: rows prefer the server mask (key.maskedKey).
  // Raw strings never arrive via list/detail — only via the guarded reveal.
  const displayMask = (key) => key.maskedKey || maskKey(key.key);

  const [baseUrl, setBaseUrl] = useState("/v1");

  // Hydration fix: Only access window on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(`${window.location.origin}/v1`);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-w-0 flex-col gap-8" aria-label="Loading endpoint configuration">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const currentEndpoint = baseUrl;

  const filteredKeys = [...keys]
    .filter((key) => key.name.toLowerCase().includes(keyQuery.toLowerCase()))
    .filter((key) => keyStatus === "all" || (keyStatus === "active" ? key.isActive !== false : key.isActive === false))
    .sort((a, b) => keySort === "created"
      ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : a.name.localeCompare(b.name));

  return (
    <main className="min-w-0 max-w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.02em]">Endpoint &amp; API keys</h1><span className="text-xs text-text-muted">Local mode</span></div>
          <p className="mt-1 text-sm text-text-muted">Secure the <code className="font-[var(--font-data)]">/v1</code> gateway with a named credential.</p>
        </div>
        <Button icon="add" onClick={() => setShowAddModal(true)}>Create API key</Button>
      </header>

      <section className="rounded-[var(--radius-field)] border border-border bg-surface" aria-labelledby="security-title">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="security-title" className="text-sm font-semibold">Security</h2><p className="mt-1 text-xs text-text-muted">API key required <span className={requireApiKey ? "text-success" : "text-danger"}>{requireApiKey ? "Enabled" : "Not required"}</span> · Remote exposure {tunnelEnabled || tsEnabled ? "on" : "off"}</p></div>
          <a href="/dashboard/profile" className="text-sm text-primary hover:underline">Open settings</a>
        </div>
        {(isLoginUnsafe || (isRemoteHost && !requireApiKey)) && <div className="border-t border-border p-3"><SecurityWarning message={isLoginUnsafe ? unsafeReason : "Remote API access is open without a required key."} action={{ label: "Open settings", href: "/dashboard/profile" }} /></div>}
      </section>

      <section className="overflow-hidden rounded-[var(--radius-field)] border border-border bg-surface" aria-labelledby="endpoints-title">
        <header className="border-b border-border px-4 py-3"><h2 id="endpoints-title" className="font-semibold">Endpoints</h2></header>
        <div className="hidden grid-cols-[7rem_8rem_minmax(0,1fr)_7rem_7rem] border-b border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-text-muted md:grid"><span>Route</span><span>Status</span><span>Base URL</span><span>Access</span><span>Actions</span></div>
        <EndpointRow label="Local" url={currentEndpoint} copyId="local_url" copied={copied} onCopy={copy} status="Reachable" access="Host" />
        <EndpointRow label="Cloudflare" url={tunnelEnabled ? `${tunnelPublicUrl || tunnelUrl}/v1` : "Not configured"} copyId="tunnel_url" copied={copied} onCopy={copy} status={tunnelLoading ? tunnelProgress || "Connecting" : tunnelEnabled ? (tunnelReachable ? "Connected" : "Reconnecting") : "Off"} access={tunnelDashboardAccess ? "Dashboard and API" : "API only"} disabled={!tunnelEnabled} actions={<Button size="sm" variant="secondary" disabled={tunnelLoading} onClick={() => tunnelEnabled ? setShowDisableTunnelModal(true) : setShowEnableTunnelModal(true)}>{tunnelEnabled ? "Disable" : "Enable"}</Button>} />
        <EndpointRow label="Tailscale" url={tsEnabled ? `${tsUrl}/v1` : "Not configured"} copyId="ts_url" copied={copied} onCopy={copy} status={tsLoading ? tsProgress || "Connecting" : tsEnabled ? (tsReachable ? "Connected" : "Reconnecting") : "Off"} access={tunnelDashboardAccess ? "Dashboard and API" : "API only"} disabled={!tsEnabled} actions={<Button size="sm" variant="secondary" disabled={tsLoading} onClick={() => tsEnabled ? setShowDisableTsModal(true) : handleOpenTsModal()}>{tsEnabled ? "Disable" : "Enable"}</Button>} />
        {(tunnelEnabled || tsEnabled) && <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3"><div><p className="text-sm font-medium">Dashboard access</p><p className="text-xs text-text-muted">Allow authenticated dashboard access through remote routes.</p></div><Toggle checked={tunnelDashboardAccess} onChange={() => handleTunnelDashboardAccess(!tunnelDashboardAccess)} /></div>}
      </section>

      <section id="require-api-key" className="overflow-hidden rounded-[var(--radius-field)] border border-border bg-surface" aria-labelledby="keys-title">
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 id="keys-title" className="font-semibold">API keys <span className="font-normal text-text-muted">({filteredKeys.length})</span></h2><p className="text-xs text-text-muted">Named credentials and routing policy.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[13rem] flex-1"><Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-text-muted"/><span className="sr-only">Search keys</span><input type="search" value={keyQuery} onChange={(event) => setKeyQuery(event.target.value)} className="h-9 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface pl-9 pr-3 text-sm" placeholder="Search keys" /></label>
            <label><span className="sr-only">Status</span><select value={keyStatus} onChange={(event) => setKeyStatus(event.target.value)} className="h-9 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
            <label><span className="sr-only">Sort keys</span><select value={keySort} onChange={(event) => setKeySort(event.target.value)} className="h-9 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm"><option value="name">Name</option><option value="created">Newest</option></select></label>
            <label className="flex min-h-9 items-center gap-2 px-2 text-sm"><Toggle size="sm" checked={requireApiKey} onChange={() => handleRequireApiKey(!requireApiKey)} />Require API key</label>
          </div>
        </header>
        {revealError && <p className="border-b border-border px-4 py-2 text-sm text-danger" role="alert">{revealError}</p>}
        <div className="hidden grid-cols-[minmax(9rem,1fr)_minmax(12rem,1.5fr)_minmax(8rem,1fr)_8rem_7rem_7rem] border-b border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-text-muted md:grid"><span>Name</span><span>Key</span><span>Policy</span><span>Limits</span><span>Created</span><span>Status / actions</span></div>
        {!filteredKeys.length ? <div className="px-4 py-12 text-center"><KeyRound className="mx-auto size-7 text-text-muted"/><p className="mt-3 font-semibold">{keys.length ? "No keys match this search." : "No API keys yet"}</p><p className="mt-1 text-sm text-text-muted">{keys.length ? "Clear search or change the status filter." : "Create a named key before sending requests to /v1."}</p>{keys.length ? <button type="button" className="mt-3 text-sm text-primary hover:underline" onClick={() => { setKeyQuery(""); setKeyStatus("all"); }}>Clear search</button> : <Button className="mt-4" onClick={() => setShowAddModal(true)}>Create API key</Button>}</div> : filteredKeys.map((key) => <div key={key.id} className="grid min-w-0 gap-2 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-hover md:grid-cols-[minmax(9rem,1fr)_minmax(12rem,1.5fr)_minmax(8rem,1fr)_8rem_7rem_7rem] md:items-center">
          <div className="min-w-0"><p className="line-clamp-2 text-sm font-medium">{key.name}</p></div>
          <div className="flex min-w-0 items-center gap-1"><code className="min-w-0 truncate font-[var(--font-data)] text-xs text-text-muted" title={revealedKeys[key.id] || displayMask(key)}>{revealedKeys[key.id] || displayMask(key)}</code><button type="button" onClick={() => revealKey(key.id)} className="grid size-9 shrink-0 place-content-center rounded-[var(--radius-control)] hover:bg-surface-active" aria-label={revealedKeys[key.id] ? `Hide ${key.name} key` : `Show ${key.name} key`}>{revealedKeys[key.id] ? <EyeOff size={14}/> : <Eye size={14}/>}</button><button type="button" onClick={() => copyKeyViaReveal(key.id)} className="grid size-9 shrink-0 place-content-center rounded-[var(--radius-control)] text-primary hover:bg-surface-active" aria-label={`Copy ${key.name} key`}>{copied === key.id ? <Check size={14}/> : <Copy size={14}/>}</button></div>
          <div className="text-xs text-text-muted">{key.modelPolicy === "whitelist" ? `${parsePolicyCount(key.allowedModels)} allowed` : key.modelPolicy === "blacklist" ? `${parsePolicyCount(key.blockedModels)} blocked` : "All models"}</div>
          <div className="text-xs text-text-muted">{key.rpmLimit > 0 ? `${key.rpmLimit} RPM` : "Unlimited"}</div>
          <div className="font-[var(--font-data)] text-xs text-text-muted">{new Date(key.createdAt).toLocaleDateString()}</div>
          <div className="flex items-center justify-between gap-1 md:justify-start"><Toggle size="sm" checked={key.isActive ?? true} onChange={(checked) => handleToggleKey(key.id, checked)} title={key.isActive ? "Pause key" : "Resume key"}/><button type="button" onClick={() => setManageKey(key)} className="grid size-9 place-content-center rounded-[var(--radius-control)] text-primary hover:bg-surface-active" aria-label={`Manage ${key.name}`}><Settings size={16}/></button><button type="button" onClick={() => handleDeleteKey(key.id)} className="grid size-9 place-content-center rounded-[var(--radius-control)] text-danger hover:bg-danger-wash" aria-label={`Delete ${key.name}`}><Trash2 size={16}/></button></div>
        </div>)}
      </section>

      {/* Add Key Modal */}
      <Modal
        isOpen={showAddModal}
        title="Create API Key"
        onClose={() => {
          setShowAddModal(false);
          setNewKeyName("");
        }}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Key Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Production Key"
          />
          <div className="flex gap-2">
            <Button onClick={handleCreateKey} fullWidth disabled={!newKeyName.trim()}>
              Create
            </Button>
            <Button
              onClick={() => {
                setShowAddModal(false);
                setNewKeyName("");
              }}
              variant="ghost"
              fullWidth
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Created Key Modal */}
      <Modal
        isOpen={!!createdKey}
        title="API Key Created"
        onClose={() => setCreatedKey(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 font-medium">
              Save this key now!
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              This is the only time you will see this key. Store it securely.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={createdKey || ""}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="secondary"
              icon={copied === "created_key" ? "check" : "content_copy"}
              onClick={() => copy(createdKey, "created_key")}
            >
              {copied === "created_key" ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button onClick={() => setCreatedKey(null)} fullWidth>
            Done
          </Button>
        </div>
      </Modal>

      {/* Manage Key Modal (remount per key so form state resets) */}
      <ManageKeyModal
        key={manageKey?.id || "none"}
        apiKey={manageKey}
        onClose={() => setManageKey(null)}
        onSaved={(updated) => {
          // Sanitized shape: metadata + maskedKey, never the raw secret.
          setKeys((prev) => prev.map((k) => (k.id === updated.id ? { ...k, ...updated } : k)));
          setManageKey(null);
        }}
        onRotated={(payload) => {
          // Sanitized shape: merge rotatedMeta only; the raw string goes to
          // the one-time modal and clears on dismiss, never into list state.
          const meta = payload?.rotatedMeta || payload;
          const raw = typeof payload?.key === "string" ? payload.key : null;
          if (meta?.id) setKeys((prev) => prev.map((k) => (k.id === meta.id ? { ...k, ...meta } : k)));
          setManageKey(null);
          setRotatedKey(raw);
        }}
      />

      {/* Rotated Key Modal */}
      <Modal
        isOpen={!!rotatedKey}
        title="API Key Rotated"
        onClose={() => setRotatedKey(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 font-medium">
              Save this key now!
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              The old key string stopped working. This is the only time you will see the new one.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              value={rotatedKey || ""}
              readOnly
              className="flex-1 font-mono text-sm"
            />
            <Button
              variant="secondary"
              icon={copied === "rotated_key" ? "check" : "content_copy"}
              onClick={() => copy(rotatedKey, "rotated_key")}
            >
              {copied === "rotated_key" ? "Copied!" : "Copy"}
            </Button>
          </div>
          <Button onClick={() => setRotatedKey(null)} fullWidth>
            Done
          </Button>
        </div>
      </Modal>

      {/* Enable Tunnel Modal */}
      <Modal
        isOpen={showEnableTunnelModal}
        title="Enable Tunnel"
        onClose={() => setShowEnableTunnelModal(false)}
      >
        <div className="flex flex-col gap-4">
          <div className="bg-surface-2 border border-border-subtle rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CloudUpload size={20} className="text-[var(--color-primary)]"/>
              <div>
                <p className="text-sm text-text-main font-medium mb-1">
                  Cloudflare Tunnel
                </p>
                <p className="text-sm text-text-muted">
                  Expose your local KRouter9 to the internet. No port forwarding, no static IP needed. Share endpoint URL with your team or use it in Cursor, Cline, and other AI tools from anywhere.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {TUNNEL_BENEFITS.map((benefit) => (
              <div key={benefit.title} className="flex flex-col items-center text-center p-3 rounded-lg bg-sidebar/50">
                <ShieldCheck size={20} className="mb-1 text-[var(--color-primary)]"/>
                <p className="text-xs font-semibold">{benefit.title}</p>
                <p className="text-xs text-text-muted">{benefit.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-text-muted">
            Requires outbound port 7844 (TCP/UDP). Connection may take 10-30s.
          </p>

          <div className="flex gap-2">
            <Button onClick={handleEnableTunnel} fullWidth>
              Start Tunnel
            </Button>
            <Button onClick={() => setShowEnableTunnelModal(false)} variant="ghost" fullWidth>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Disable Cloudflare Tunnel Modal */}
      <Modal
        isOpen={showDisableTunnelModal}
        title="Disable Tunnel"
        onClose={() => !tunnelLoading && setShowDisableTunnelModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">The Cloudflare tunnel will be disconnected. Remote access via tunnel URL will stop working.</p>
          <div className="flex gap-2">
            <Button onClick={handleDisableTunnel} fullWidth disabled={tunnelLoading} variant="danger">
              {tunnelLoading ? "Disabling..." : "Disable"}
            </Button>
            <Button onClick={() => setShowDisableTunnelModal(false)} variant="ghost" fullWidth disabled={tunnelLoading}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Tailscale Modal */}
      <Modal
        isOpen={showTsModal}
        title="Tailscale Funnel"
        onClose={() => { if (!tsInstalling) { setShowTsModal(false); setTsSudoPassword(""); setTsStatus(null); } }}
      >
        <div className="flex flex-col gap-4">
          {/* Checking state */}
          {tsInstalled === null && (
            <p className="text-sm text-text-muted flex items-center gap-2">
              <LoaderCircle size={16} className="animate-spin shrink-0"/>
              Checking...
            </p>
          )}

          {/* Not installed */}
          {tsInstalled === false && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-muted">Tailscale is not installed. Install it to enable Funnel.</p>
              <div className="flex gap-2">
                <Button onClick={handleInstallTailscale} fullWidth>
                  Install Tailscale
                </Button>
                <Button onClick={() => setShowTsModal(false)} variant="ghost" fullWidth>Cancel</Button>
              </div>
            </div>
          )}

          {/* Installing with progress log */}
          {tsInstalling && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <LoaderCircle size={16} className="animate-spin shrink-0"/>
                Installing Tailscale...
              </div>
              {tsInstallLog.length > 0 && (
                <div ref={tsLogRef} className="bg-black/5 dark:bg-white/5 rounded p-2 max-h-40 overflow-y-auto font-mono text-xs text-text-muted">
                  {tsInstallLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Installed: show Connect button */}
          {tsInstalled === true && !tsInstalling && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 size={16}/>
                Tailscale installed
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleConnectTailscale()}
                  fullWidth
                >
                  Connect
                </Button>
                <Button onClick={() => setShowTsModal(false)} variant="ghost" fullWidth>Cancel</Button>
              </div>
            </div>
          )}

          {tsStatus && <StatusAlert status={tsStatus} />}
        </div>
      </Modal>

      {/* Disable Tailscale Modal */}
      <Modal
        isOpen={showDisableTsModal}
        title="Disable Tailscale"
        onClose={() => !tsLoading && setShowDisableTsModal(false)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">Tailscale Funnel will be stopped. Remote access via Tailscale URL will stop working.</p>
          <div className="flex gap-2">
            <Button onClick={handleDisableTailscale} fullWidth disabled={tsLoading} variant="danger">
              {tsLoading ? "Disabling..." : "Disable"}
            </Button>
            <Button onClick={() => setShowDisableTsModal(false)} variant="ghost" fullWidth disabled={tsLoading}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </main>
  );
}


function parsePolicyCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!value) return 0;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.length : 0; } catch { return String(value).split(",").filter(Boolean).length; }
}

function Modal({ isOpen, title, onClose, children }) {
  return <Dialog open={isOpen} title={title} onDismiss={onClose}>{children}</Dialog>;
}

function ConfirmModal({ isOpen, onClose, onConfirm, title, message }) {
  return <ConfirmDialog open={isOpen} onCancel={onClose} onConfirm={onConfirm} title={title} description={message} actionLabel={title || "Continue"} destructive />;
}


APIPageClient.propTypes = {
  machineId: PropTypes.string.isRequired,
};
