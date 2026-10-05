"use client";

import Icon from "@/shared/components/Icon";
import { useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import {
  CardSkeleton,
  Button,
  Toggle,
  ConfirmModal,
} from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
} from "@/shared/constants/providers";
import Link from "next/link";
import { getErrorCode, getRelativeTime } from "@/shared/utils";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import AddCompatibleModal from "./components/AddCompatibleModal";
import { buildCustomProviderDisplaySlugs, STATUS_FILTER_OPTIONS, matchesStatusFilter } from "./utils";
import { normalizeErrorClass, errorClassLabel } from "@/shared/utils/errorClass";

function getConnectionErrorTag(connection) {
  if (!connection) return null;

  const explicitType = connection.lastErrorType;
  if (explicitType === "runtime_error") return "RUNTIME";
  if (
    explicitType === "upstream_auth_error" ||
    explicitType === "auth_missing" ||
    explicitType === "token_refresh_failed" ||
    explicitType === "token_expired"
  )
    return "AUTH";
  if (explicitType === "upstream_rate_limited") return "429";
  if (explicitType === "upstream_unavailable") return "5XX";
  if (explicitType === "network_error") return "NET";

  const numericCode = Number(connection.errorCode);
  if (Number.isFinite(numericCode) && numericCode >= 400)
    return String(numericCode);

  const fromMessage = getErrorCode(connection.lastError);
  if (fromMessage === "401" || fromMessage === "403") return "AUTH";
  if (fromMessage && fromMessage !== "ERR") return fromMessage;

  const msg = (connection.lastError || "").toLowerCase();
  if (
    msg.includes("runtime") ||
    msg.includes("not runnable") ||
    msg.includes("not installed")
  )
    return "RUNTIME";
  if (
    msg.includes("invalid api key") ||
    msg.includes("token invalid") ||
    msg.includes("revoked") ||
    msg.includes("unauthorized")
  )
    return "AUTH";

  return "ERR";
}

const APIKEY_INITIAL_VISIBLE = 20;

export default function ProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllApikey, setShowAllApikey] = useState(false);
  const [showAddCompatibleModal, setShowAddCompatibleModal] = useState(false);
  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] =
    useState(false);
  const [testingMode, setTestingMode] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  // U1c: group providers by normalized error class.
  const [errorClassFilter, setErrorClassFilter] = useState("all");
  // U9: bulk disable asks for confirmation before flipping N connections.
  const [pendingToggle, setPendingToggle] = useState(null);
  const [fetchError, setFetchError] = useState("");
  const notify = useNotificationStore();
  const searchQuery = useHeaderSearchStore((s) => s.query);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

  useEffect(() => {
    registerSearch("Search providers...");
    return () => unregisterSearch();
  }, [registerSearch, unregisterSearch]);

  const matchSearch = (name) => {
    if (!searchQuery.trim()) return true;
    if (!name) return false;
    return name.toLowerCase().includes(searchQuery.trim().toLowerCase());
  };

  const sortByPriority = (entries, authType) =>
    [...entries].sort(([ka, a], [kb, b]) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const sa = getProviderStats(ka, authType);
      const sb = getProviderStats(kb, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  const sortItemsByPriority = (items, authType) =>
    [...items].sort((a, b) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const sa = getProviderStats(a.id, authType);
      const sb = getProviderStats(b.id, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  const fetchProviders = async () => {
    setFetchError("");
    setLoading(true);
    try {
      const [connectionsRes, nodesRes] = await Promise.all([
        fetch("/api/providers?mode=full"),
        fetch("/api/provider-nodes"),
      ]);
      const connectionsData = await connectionsRes.json();
      const nodesData = await nodesRes.json();
      if (!connectionsRes.ok || !nodesRes.ok) setFetchError("Provider registry could not be loaded. Check the gateway and retry.");
      if (connectionsRes.ok) setConnections(connectionsData.connections || []);
      if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
    } catch (error) {
      console.log("Error fetching data:", error);
      setFetchError("Provider registry could not be loaded. Check the gateway and retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load intentionally synchronizes remote state after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProviders();
  }, []);

  // P2 scaling: group connections by provider ONCE per connections change so
  // getProviderStats is O(group) instead of O(all connections) on every call.
  // The list page calls it in many filter/sort comparators per keystroke.
  const connectionsByProvider = useMemo(() => {
    const map = new Map();
    for (const c of connections) {
      let arr = map.get(c.provider);
      if (!arr) { arr = []; map.set(c.provider, arr); }
      arr.push(c);
    }
    return map;
  }, [connections]);

  const getProviderStats = (providerId, authType) => {
    const authTypes = Array.isArray(authType) ? authType : [authType];
    const providerConnections = (connectionsByProvider.get(providerId) || []).filter(
      (c) => authTypes.includes(c.authType),
    );

    const getEffectiveStatus = (conn) => {
      const isCooldown = Object.entries(conn).some(
        ([k, v]) =>
          k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now(),
      );
      return conn.testStatus === "unavailable" && !isCooldown
        ? "active"
        : conn.testStatus;
    };

    const connected = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return status === "active" || status === "success";
    }).length;

    const errorConns = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return (
        status === "error" || status === "expired" || status === "unavailable" ||
        status === "refresh-invalid"
      );
    });

    const error = errorConns.length;
    const total = providerConnections.length;
    const allDisabled =
      total > 0 && providerConnections.every((c) => c.isActive === false);

    const latestError = errorConns.sort(
      (a, b) => new Date(b.lastErrorAt || 0) - new Date(a.lastErrorAt || 0),
    )[0];
    const errorCode = latestError ? getConnectionErrorTag(latestError) : null;
    const errorClass = latestError ? normalizeErrorClass(latestError) : null;
    // Normalized classes present on this provider (for the error-class filter).
    const errorClasses = [...new Set(
      errorConns.map((c) => normalizeErrorClass(c)).filter((c) => c !== "unknown")
    )];
    const errorTime = latestError?.lastErrorAt
      ? getRelativeTime(latestError.lastErrorAt)
      : null;

    return { connected, error, total, errorCode, errorClass, errorClasses, errorTime, allDisabled };
  };

  const matchStatus = (stats, isNoAuth) =>
    matchesStatusFilter(statusFilter, stats, isNoAuth) &&
    (errorClassFilter === "all" ||
      (stats?.errorClasses || []).includes(errorClassFilter));

  // Toggle all connections for a provider on/off. authType may be a single
  // string or an array (kiro counts oauth + api_key/apikey together).
  // Disabling is bulk-destructive (U9) → confirm first; enabling applies now.
  const handleToggleProvider = (providerId, authType, newActive) => {
    if (newActive === false) {
      const authTypes = Array.isArray(authType) ? authType : [authType];
      const count = connections.filter(
        (c) => c.provider === providerId && authTypes.includes(c.authType) && c.isActive !== false
      ).length;
      setPendingToggle({ providerId, authTypes, count });
      return;
    }
    doToggleProvider(providerId, authType, newActive);
  };

  const doToggleProvider = async (providerId, authType, newActive) => {
    const authTypes = Array.isArray(authType) ? authType : [authType];
    const matches = (c) =>
      c.provider === providerId && authTypes.includes(c.authType);
    setConnections((prev) =>
      prev.map((c) => (matches(c) ? { ...c, isActive: newActive } : c)),
    );
    // Single bulk call instead of N parallel PUTs (3000 conns would storm).
    try {
      await fetch("/api/providers/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, authType: authTypes, isActive: newActive }),
      });
    } catch (error) {
      console.log("Error toggling provider connections:", error);
    }
  };

  const handleBatchTest = async (mode, providerId = null) => {
    if (testingMode) return;
    setTestingMode(mode === "provider" ? providerId : mode);
    setTestResults(null);
    try {
      const res = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, providerId }),
      });
      const data = await res.json();
      setTestResults(data);
      if (data.summary) {
        const { passed, failed, total } = data.summary;
        if (failed === 0) notify.success(`All ${total} tests passed`);
        else notify.warning(`${passed}/${total} passed, ${failed} failed`);
      }
    } catch (error) {
      setTestResults({ error: "Test request failed" });
      notify.error("Provider test failed");
    } finally {
      setTestingMode(null);
    }
  };

  const customProviderSlugs = buildCustomProviderDisplaySlugs(providerNodes);

  const compatibleProviders = providerNodes
    .filter((node) => node.type === "openai-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "OpenAI Compatible",
      color: "#10A37F",
      textIcon: "OC",
      apiType: node.apiType,
      displaySlug: customProviderSlugs.get(node.id),
    }))
    .filter(
      (p) => matchSearch(p.name) && matchStatus(getProviderStats(p.id, "apikey")),
    );

  const anthropicCompatibleProviders = providerNodes
    .filter((node) => node.type === "anthropic-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Anthropic Compatible",
      color: "#D97757",
      textIcon: "AC",
      displaySlug: customProviderSlugs.get(node.id),
    }))
    .filter(
      (p) => matchSearch(p.name) && matchStatus(getProviderStats(p.id, "apikey")),
    );

  // Dual-auth providers (oauth + apikey) store API keys as authType "apikey"
  // (and sometimes "api_key"). Card stats must count both so totals match detail.
  // kiro has no authModes in registry but accepts both (headless uses "api_key").
  const dualAuthTypes = (info, key) => {
    if (key === "kiro") return ["oauth", "apikey", "api_key"];
    const modes = info?.authModes;
    // Free-tier and API-key providers default to supporting apikey even when the
    // registry entry omits authModes (e.g. cloudflare-ai, byteplus, ollama,
    // vertex) — otherwise their apikey connections are invisible on the grid card.
    if (!Array.isArray(modes)) {
      return key in FREE_TIER_PROVIDERS || key in APIKEY_PROVIDERS
        ? ["oauth", "apikey", "api_key"]
        : "oauth";
    }
    if (!modes.includes("apikey")) return "oauth";
    return ["oauth", "apikey", "api_key"];
  };

  const oauthEntries = sortByPriority(
    Object.entries(OAUTH_PROVIDERS).filter(
      ([key, info]) =>
        !info.hidden &&
        matchSearch(info.name) &&
        matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    ),
    "oauth",
  );
  const freeEntries = Object.entries(FREE_PROVIDERS)
    .filter(
      ([key, info]) =>
        !info.hidden &&
        matchSearch(info.name) &&
        matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    )
    .sort(([, a], [, b]) => (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0));
  // Free Tier cards may be oauth-only (e.g. kimchi) or dual-auth, so count via
  // dualAuthTypes per provider instead of a fixed "apikey" — otherwise oauth
  // connections are invisible here (mismatch with the detail page).
  const freeTierEntries = Object.entries(FREE_TIER_PROVIDERS)
    .filter(
      ([key, info]) =>
        !info.hidden &&
        matchSearch(info.name) &&
        (info.serviceKinds ?? ["llm"]).includes("llm") &&
        matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    )
    .sort(([ka, a], [kb, b]) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const noAuthDiff = (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0);
      if (noAuthDiff !== 0) return noAuthDiff;
      const ca = getProviderStats(ka, dualAuthTypes(a, ka)).connected > 0 ? 0 : 1;
      const cb = getProviderStats(kb, dualAuthTypes(b, kb)).connected > 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return (a.name || "").localeCompare(b.name || "");
    });
  // API Key: connected providers first, then alphabetical by name
  const apikeyEntries = Object.entries(APIKEY_PROVIDERS)
    .filter(
      ([key, info]) =>
        !info.hidden &&
        (info.serviceKinds ?? ["llm"]).includes("llm") &&
        matchSearch(info.name) &&
        matchStatus(getProviderStats(key, "apikey"), info.noAuth),
    )
    .sort(([ka, a], [kb, b]) => {
      const ca = getProviderStats(ka, "apikey").total > 0 ? 0 : 1;
      const cb = getProviderStats(kb, "apikey").total > 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return (a.name || "").localeCompare(b.name || "");
    });
  const isApikeySearching = !!searchQuery.trim() || statusFilter !== "all";
  const visibleApikeyEntries =
    isApikeySearching || showAllApikey
      ? apikeyEntries
      : apikeyEntries.slice(0, APIKEY_INITIAL_VISIBLE);
  const hiddenApikeyCount = apikeyEntries.length - APIKEY_INITIAL_VISIBLE;

  const registryGroups = [
    {
      id: "oauth",
      testMode: "oauth",
      label: "OAuth",
      entries: oauthEntries.map(([providerId, provider]) => ({ providerId, provider, stats: getProviderStats(providerId, dualAuthTypes(provider, providerId)), authType: "oauth", toggleAuthType: dualAuthTypes(provider, providerId) })),
    },
    {
      id: "free",
      testMode: "free",
      label: "Free tier",
      entries: [
        ...freeEntries.map(([providerId, provider]) => ({ providerId, provider, stats: getProviderStats(providerId, dualAuthTypes(provider, providerId)), authType: "free", toggleAuthType: dualAuthTypes(provider, providerId) })),
        ...freeTierEntries.map(([providerId, provider]) => ({ providerId, provider, stats: getProviderStats(providerId, dualAuthTypes(provider, providerId)), authType: "free", toggleAuthType: dualAuthTypes(provider, providerId), apiKey: true })),
      ],
    },
    {
      id: "apikey",
      testMode: "apikey",
      label: "API key",
      entries: visibleApikeyEntries.map(([providerId, provider]) => ({ providerId, provider, stats: getProviderStats(providerId, "apikey"), authType: "apikey", toggleAuthType: "apikey", apiKey: true })),
    },
  ];

  const hasAnyResult =
    registryGroups.some((group) => group.entries.length > 0) ||
    compatibleProviders.length > 0 ||
    anthropicCompatibleProviders.length > 0;

  const healthCounts = connections.reduce((acc, connection) => {
    if (connection.isActive === false) acc.disabled += 1;
    else if (["active", "success"].includes(connection.testStatus)) acc.connected += 1;
    const errorClass = normalizeErrorClass(connection);
    if (errorClass === "auth-invalid") acc.authInvalid += 1;
    if (errorClass === "refresh-invalid") acc.refreshInvalid += 1;
    if (errorClass === "ratelimited") acc.ratelimited += 1;
    if (errorClass === "network") acc.network += 1;
    return acc;
  }, { connected: 0, disabled: 0, authInvalid: 0, refreshInvalid: 0, ratelimited: 0, network: 0 });

  const healthFilters = [
    ["connected", "Connected", healthCounts.connected, "check_circle", "connected"],
    ["disabled", "Disabled", healthCounts.disabled, "pause_circle", "disabled"],
    ["auth-invalid", "Auth invalid", healthCounts.authInvalid, "lock", "error"],
    ["refresh-invalid", "Refresh invalid", healthCounts.refreshInvalid, "refresh", "error"],
    ["ratelimited", "Rate limited", healthCounts.ratelimited, "warning", "error"],
    ["network", "Network", healthCounts.network, "lan", "error"],
  ];

  if (loading) {
    return <div className="space-y-3" aria-label="Loading providers">{Array.from({ length: 8 }, (_, index) => <CardSkeleton key={index} />)}</div>;
  }

  return (
    <section className="min-w-0 overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface)]" aria-label="Provider routing instrument">
      <header className="border-b border-[var(--color-border-strong)] bg-[var(--color-surface-strong)]">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0"><h2 className="text-xl font-semibold">Connection scope</h2><p className="mt-1 max-w-3xl text-sm text-[var(--color-text-muted)]">Filter the live matrix, inspect evidence, then enter the exact provider lane that needs intervention.</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" icon="play_arrow" loading={testingMode === "all"} onClick={() => handleBatchTest("all")}>Test all lanes</Button><Button size="sm" icon="add" onClick={() => setShowAddCompatibleModal(true)}>Add endpoint</Button></div>
        </div>
        <div className="grid gap-px border-y border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 xl:grid-cols-6" aria-label="Health evidence filters">
          {healthFilters.map(([id, label, count, icon, type]) => {
            const active = id === "connected" || id === "disabled" ? statusFilter === id : errorClassFilter === id;
            return (
              <button key={id} type="button" aria-pressed={active} onClick={() => { if (id === "connected" || id === "disabled") { setStatusFilter(active ? "all" : id); setErrorClassFilter("all"); } else { setErrorClassFilter(active ? "all" : id); setStatusFilter("all"); } }} className={`grid min-h-16 grid-cols-[auto_minmax(0,1fr)] grid-rows-[1fr_1fr] items-baseline gap-x-3 bg-[var(--color-surface)] px-4 py-2 text-left hover:bg-[var(--color-surface-hover)] ${active ? "bg-[var(--color-primary-wash)]" : ""}`}>
                <span className="row-span-2 self-center"><StatusGlyph type={type} /></span><span className="self-end font-mono text-lg leading-none tabular-nums">{count}</span><span className="min-w-0 self-start truncate text-sm text-[var(--color-text-muted)]">{label}</span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm" aria-label="Filter providers by connection status">{STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select value={errorClassFilter} onChange={(event) => setErrorClassFilter(event.target.value)} className="min-h-10 rounded-[var(--radius-control)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm" aria-label="Filter providers by normalized error class"><option value="all">All error classes</option><option value="auth-invalid">Auth invalid</option><option value="refresh-invalid">Refresh invalid</option><option value="ratelimited">Rate limited</option><option value="network">Network</option></select>
          <ModelAvailabilityBadge />
        </div>
      </header>

      {fetchError && <div className="flex flex-col gap-3 border-b border-[var(--color-border)] bg-[var(--color-danger-wash)] p-4 sm:flex-row sm:items-center sm:justify-between" role="alert"><span className="flex items-center gap-2 text-sm text-[var(--color-danger)]"><Icon name="error" />{fetchError}</span><Button size="sm" variant="secondary" icon="refresh" onClick={fetchProviders}>Retry</Button></div>}

      <section className="border-b border-[var(--color-border-strong)]" aria-labelledby="pinned-route-lanes-title">
        <header className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="pinned-route-lanes-title" className="font-semibold">Pinned custom endpoints</h2><p className="text-xs text-[var(--color-text-muted)]">OpenAI- and Anthropic-compatible lanes stay above the registry.</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" icon="add" onClick={() => setShowAddCompatibleModal(true)}>OpenAI compatible</Button><Button size="sm" variant="secondary" icon="add" onClick={() => setShowAddAnthropicCompatibleModal(true)}>Anthropic compatible</Button></div>
        </header>
        {compatibleProviders.length === 0 && anthropicCompatibleProviders.length === 0 ? <div className="p-8 text-center"><Icon name="extension" size={26} className="mx-auto text-[var(--color-text-muted)]" /><p className="mt-3 text-sm text-[var(--color-text-muted)]">No custom endpoints configured.</p></div> : <div className="divide-y divide-[var(--color-border)]">{[...compatibleProviders, ...anthropicCompatibleProviders].map((provider, index) => <ApiKeyProviderCard key={provider.id} position={index + 1} providerId={provider.id} provider={provider} stats={getProviderStats(provider.id, "apikey")} authType="compatible" onToggle={(active) => handleToggleProvider(provider.id, "apikey", active)} />)}</div>}
      </section>

      <section aria-labelledby="provider-lanes-title">
        <header className="border-b border-[var(--color-border)] px-4 py-3"><h2 id="provider-lanes-title" className="font-semibold">Provider lanes</h2><p className="text-xs text-[var(--color-text-muted)]">Connected-first matrix grouped by authentication.</p></header>
        {!hasAnyResult ? (
          <div className="p-8 text-center"><Icon name="search_off" size={28} className="mx-auto text-[var(--color-text-muted)]" /><p className="mt-3 font-semibold">No providers match</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">Clear the active search or status filters to restore the registry.</p><Button variant="secondary" className="mt-4" onClick={() => { setStatusFilter("all"); setErrorClassFilter("all"); }}>Clear filters</Button></div>
        ) : (
          <div className="divide-y divide-[var(--color-border-strong)]">
            {registryGroups.map((group) => group.entries.length > 0 && (
              <ProviderGroup key={group.id} label={group.label} count={group.id === "apikey" ? apikeyEntries.length : group.entries.length} onTest={() => handleBatchTest(group.id)} testing={testingMode === group.id}>
                {group.entries.map((entry, index) => (
                  entry.apiKey ? <ApiKeyProviderCard key={entry.providerId} position={index + 1} {...entry} onToggle={(active) => handleToggleProvider(entry.providerId, entry.toggleAuthType, active)} /> : <ProviderCard key={entry.providerId} position={index + 1} {...entry} onToggle={(active) => handleToggleProvider(entry.providerId, entry.toggleAuthType, active)} />
                ))}
                {group.id === "apikey" && !isApikeySearching && !showAllApikey && hiddenApikeyCount > 0 && <button type="button" onClick={() => setShowAllApikey(true)} className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-dashed border-[var(--color-primary-border)] text-sm font-medium text-[var(--color-primary)]"><Icon name="expand_more" />Show all {apikeyEntries.length} providers</button>}
              </ProviderGroup>
            ))}
          </div>
        )}
      </section>

      <AddCompatibleModal variant="openai" isOpen={showAddCompatibleModal} onClose={() => setShowAddCompatibleModal(false)} onCreated={(node) => { setProviderNodes((prev) => [...prev, node]); setShowAddCompatibleModal(false); }} />
      <AddCompatibleModal variant="anthropic" isOpen={showAddAnthropicCompatibleModal} onClose={() => setShowAddAnthropicCompatibleModal(false)} onCreated={(node) => { setProviderNodes((prev) => [...prev, node]); setShowAddAnthropicCompatibleModal(false); }} />
      {testResults && <TestResultsDialog results={testResults} onClose={() => setTestResults(null)} />}
      <ConfirmModal isOpen={!!pendingToggle} onClose={() => setPendingToggle(null)} onConfirm={() => { const pending = pendingToggle; setPendingToggle(null); if (pending) doToggleProvider(pending.providerId, pending.authTypes, false); }} title="Disable provider connections?" message={`This will disable ${pendingToggle?.count ?? 0} active connection${(pendingToggle?.count ?? 0) === 1 ? "" : "s"}. Disabled accounts stay disabled until you toggle them back.`} confirmText="Disable" cancelText="Cancel" variant="danger" />
    </section>
  );
}

function ProviderGroup({ label, count, onTest, testing, children }) {
  const [open, setOpen] = useState(true);
  return <section ><header className="flex items-center justify-between gap-3 bg-[var(--color-surface-strong)] px-4 py-2"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-h-10 items-center gap-2 text-sm font-semibold"><Icon name={open ? "chevron_down" : "chevron_right"} /><span>{label}</span><span className="font-mono text-xs tabular-nums text-[var(--color-text-muted)]">{count}</span></button><Button size="sm" variant="ghost" icon="play_arrow" loading={testing} onClick={onTest}>Test</Button></header>{open && <div className="divide-y divide-[var(--color-border)]">{children}</div>}</section>;
}

function StatusGlyph({ type = "unknown" }) {
  const styles = { connected: "rounded-full border-[var(--color-success)] bg-[var(--color-success)]", disabled: "border-[var(--color-text-disabled)]", error: "border-[var(--color-danger)] bg-[var(--color-danger)]", warning: "rotate-45 border-[var(--color-warning)] bg-[var(--color-warning)]", unknown: "rounded-full border-[var(--color-text-subtle)]" };
  return <span aria-hidden="true" className={`size-2.5 shrink-0 border ${styles[type] || styles.unknown}`} />;
}

function TestResultsDialog({ results, onClose }) {
  return <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[8vh]" onClick={onClose}><div className="absolute inset-0 bg-[var(--color-overlay)]" /><div role="dialog" aria-modal="true" aria-label="Provider test results" className="relative max-h-[82vh] w-full max-w-[640px] overflow-y-auto rounded-[var(--dialog-radius)] border border-[var(--dialog-border)] bg-[var(--dialog-bg)] shadow-[var(--shadow-float)]" onClick={(event) => event.stopPropagation()}><header className="sticky top-0 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--dialog-bg)] px-5 py-3"><h3 className="font-semibold">Test results</h3><button type="button" onClick={onClose} className="flex size-11 items-center justify-center" aria-label="Close test results"><Icon name="close" /></button></header><div className="p-5"><ProviderTestResultsView results={results} /></div></div></div>;
}

function ProviderCard(props) {
  return <ProviderSignalRow {...props} />;
}

function ApiKeyProviderCard(props) {
  return <ProviderSignalRow {...props} apiKey />;
}

function ProviderSignalRow({ position, providerId, provider, stats, authType, onToggle, apiKey = false }) {
  const { connected, error, errorCode, errorClass, errorTime, allDisabled, total } = stats;
  const isCompatible = providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
  const isAnthropicCompatible = providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
  const iconPath = apiKey
    ? (isCompatible && provider.apiType ? (provider.apiType === "responses" ? "/providers/oai-r.png" : "/providers/oai-cc.png") : isAnthropicCompatible ? "/providers/anthropic-m.png" : getProviderIconSrc(provider.id))
    : `/providers/${provider.id}.png`;
  const state = allDisabled ? "disabled" : error > 0 ? "error" : connected > 0 || provider.noAuth ? "connected" : "unknown";
  const stateLabel = allDisabled ? "Disabled" : error > 0 ? (errorClass && errorClass !== "unknown" ? errorClassLabel(errorClass) : "Error") : connected > 0 || provider.noAuth ? "Connected" : "Not connected";
  const authLabel = authType === "oauth" ? "OAuth" : authType === "free" ? "Free tier" : authType === "compatible" ? "Compatible" : "API key";

  return (
    <div className={`grid min-h-[var(--row-h-comfortable)] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:grid-cols-[2.5rem_minmax(180px,1.4fr)_minmax(220px,1fr)_auto] ${allDisabled ? "bg-[var(--color-surface-strong)]" : "hover:bg-[var(--color-surface-hover)]"}`}>
      <span className="border-r border-[var(--color-route-bidirectional)] pr-3 text-center font-mono text-xs tabular-nums text-[var(--color-primary)]">{String(position).padStart(2, "0")}</span>
      <Link href={`/dashboard/providers/${providerId}`} className="flex min-w-0 items-center gap-3 rounded-[var(--radius-xs)] focus-visible:shadow-[var(--focus-ring)]">
        <ProviderIcon src={iconPath} alt={provider.name} size={30} className="size-8 shrink-0 rounded-[var(--radius-sm)] object-contain" fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()} fallbackColor={provider.color} />
        <span className="min-w-0"><span className="block truncate font-semibold">{provider.name}</span>{provider.displaySlug ? <span className="block break-all font-mono text-xs text-[var(--color-text-muted)]">{provider.displaySlug}</span> : <span className="block text-xs text-[var(--color-text-muted)]">{authLabel}</span>}</span>
      </Link>
      <Link href={`/dashboard/providers/${providerId}`} className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-[3.25rem] text-xs sm:col-span-1 sm:pl-0">
        <span className="inline-flex items-center gap-2"><StatusGlyph type={state} /><span>{stateLabel}</span></span>
        <span className="inline-grid grid-flow-col auto-cols-max items-baseline gap-3 text-[var(--color-text-muted)]">
          <span className="inline-grid grid-cols-[auto_auto] items-baseline gap-1"><span className="font-mono tabular-nums text-[var(--color-text)]">{connected}</span><span>ready</span></span>
          <span className="inline-grid grid-cols-[auto_auto] items-baseline gap-1"><span className="font-mono tabular-nums text-[var(--color-text)]">{error}</span><span>error</span></span>
          <span className="inline-grid grid-cols-[auto_auto] items-baseline gap-1"><span className="font-mono tabular-nums text-[var(--color-text)]">{total}</span><span>total</span></span>
        </span>
        {errorCode && <span className="font-mono text-[var(--color-danger)]">{errorCode}</span>}
        {errorTime && <span className="text-[var(--color-text-subtle)]">{errorTime}</span>}
        {isCompatible && <span className="border border-[var(--badge-border)] px-1.5 py-0.5">{provider.apiType === "responses" ? "Responses" : "Chat"}</span>}
        {isAnthropicCompatible && <span className="border border-[var(--badge-border)] px-1.5 py-0.5">Messages</span>}
      </Link>
      <div className="flex items-center justify-end gap-2">
        {total > 0 && <Toggle size="sm" checked={!allDisabled} onChange={(active) => onToggle(active)} title={allDisabled ? "Enable provider" : "Disable provider"} />}
        <Link href={`/dashboard/providers/${providerId}`} className="flex size-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]" aria-label={`Open ${provider.name}`}><Icon name="chevron_right" /></Link>
      </div>
    </div>
  );
}

ProviderSignalRow.propTypes = {
  position: PropTypes.number.isRequired,
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({ id: PropTypes.string.isRequired, name: PropTypes.string.isRequired, color: PropTypes.string, textIcon: PropTypes.string, apiType: PropTypes.string, displaySlug: PropTypes.string, noAuth: PropTypes.bool }).isRequired,
  stats: PropTypes.shape({ connected: PropTypes.number, error: PropTypes.number, total: PropTypes.number, errorCode: PropTypes.string, errorClass: PropTypes.string, errorTime: PropTypes.string, allDisabled: PropTypes.bool }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
  apiKey: PropTypes.bool,
};

function ProviderTestResultsView({ results }) {
  if (results.error && !results.results) {
    return (
      <div className="text-center py-6">
        <Icon name="error" className="text-red-500 text-[32px] mb-2 block" />
        <p className="text-sm text-red-400">{results.error}</p>
      </div>
    );
  }

  const { summary, mode } = results;
  const items = results.results || [];
  const modeLabel =
    {
      oauth: "OAuth",
      free: "Free",
      apikey: "API Key",
      provider: "Provider",
      all: "All",
    }[mode] || mode;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {summary && (
        <div className="flex flex-wrap items-center gap-2 text-xs mb-1 sm:gap-3">
          <span className="text-text-muted">{modeLabel} Test</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
            {summary.passed} passed
          </span>
          {summary.failed > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
              {summary.failed} failed
            </span>
          )}
          <span className="text-text-muted sm:ml-auto">
            {summary.total} tested
          </span>
        </div>
      )}
      {items.map((r, i) => (
        <div
          key={r.connectionId || i}
          className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-black/[0.03] px-3 py-2 text-xs dark:bg-white/[0.03] sm:flex-nowrap"
        >
          <Icon name={r.valid ? "check_circle" : "error"} size={16} className={r.valid ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"} />
          <div className="min-w-0 flex-[1_1_160px]">
            <span className="block truncate font-medium sm:inline">
              {r.connectionName}
            </span>
            <span className="block truncate text-text-muted sm:ml-1.5 sm:inline">
              ({r.provider})
            </span>
          </div>
          {r.latencyMs !== undefined && (
            <span className="shrink-0 text-text-muted font-mono tabular-nums">
              {r.latencyMs}ms
            </span>
          )}
          <span
            className={`shrink-0 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
              r.valid
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {r.valid ? "OK" : r.diagnosis?.type || "ERROR"}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-center py-4 text-text-muted text-sm">
          No active connections found for this group.
        </div>
      )}
    </div>
  );
}

ProviderTestResultsView.propTypes = {
  results: PropTypes.shape({
    mode: PropTypes.string,
    results: PropTypes.array,
    summary: PropTypes.shape({
      total: PropTypes.number,
      passed: PropTypes.number,
      failed: PropTypes.number,
    }),
    error: PropTypes.string,
  }).isRequired,
};
