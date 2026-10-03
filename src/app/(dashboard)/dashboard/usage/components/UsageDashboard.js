"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Badge from "@/shared/components/Badge";
import { CircleCheck, CircleX } from "lucide-react";
import { AI_PROVIDERS, FREE_PROVIDERS } from "@/shared/constants/providers";
import OverviewCards from "./OverviewCards";
import UsageChart from "./UsageChart";
import UsageTable, { fmt, fmtTime } from "./UsageTable";
import dynamic from "next/dynamic";

const ProviderTopology = dynamic(() => import("./ProviderTopology"), { ssr: false });

const TABLE_OPTIONS = [
  { value: "model", label: "Model" },
  { value: "account", label: "Account" },
  { value: "apiKey", label: "API key" },
  { value: "endpoint", label: "Endpoint" },
];

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last used", align: "right" },
];
const ACCOUNT_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "accountName", label: "Account" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last used", align: "right" },
];
const API_KEY_COLUMNS = [
  { field: "keyName", label: "API key name" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last used", align: "right" },
];
const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last used", align: "right" },
];

function isLlmProvider(id) {
  const provider = AI_PROVIDERS[id];
  return !provider?.serviceKinds || provider.serviceKinds.includes("llm");
}

function maskAccount(value) {
  const text = String(value || "").trim();
  const at = text.indexOf("@");
  if (at <= 0 || at === text.length - 1) return text;
  const domain = text.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const suffix = dot > 0 ? domain.slice(dot) : "";
  return `${text[0]}***@${domainName[0]}***${suffix}`;
}

function timeAgo(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{timeAgo(timestamp)}</>;
}

function statusInfo(request) {
  const status = String(request.status || "OK");
  const code = request.statusCode ?? request.httpStatus ?? request.errorCode;
  const success = /^(ok|success)$/i.test(status) && (!code || Number(code) < 400);
  return { text: !success && code && !status.includes(String(code)) ? `${status} · ${code}` : status, success };
}

function RecentRequests({ requests = [] }) {
  return (
    <div className="min-h-[320px] border border-[var(--ledger-border)] bg-[var(--ledger-bg)] xl:h-[480px]">
      <div className="ledger-caption"><span className="ledger-number">LIVE</span><h3 className="text-sm font-semibold">Recent requests</h3></div>
      {!requests.length ? (
        <div className="grid h-[260px] place-items-center px-6 text-center text-sm text-[var(--color-text-muted)]">No data yet — send a request through <code>/v1</code>.</div>
      ) : (
        <div className="max-h-[430px] overflow-auto custom-scrollbar">
          <table className="w-full min-w-[430px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-[var(--color-text-muted)]"><tr><th className="px-3 py-2 text-left">State</th><th className="px-3 py-2 text-left">Model / provider</th><th className="px-3 py-2 text-right">In / out</th><th className="px-3 py-2 text-right">Time</th></tr></thead>
            <tbody>{requests.map((request, index) => {
              const status = statusInfo(request);
              return <tr key={`${request.timestamp}-${index}`} className="border-t border-[var(--ledger-rule)] hover:bg-[var(--table-row-hover)]">
                <td className={`px-3 py-2 font-medium ${status.success ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}><span className="inline-flex items-center gap-1.5">{status.success ? <CircleCheck aria-hidden="true" size={14} /> : <CircleX aria-hidden="true" size={14} />} {status.text}</span></td>
                <td className="max-w-[180px] px-3 py-2"><span className="data-text block truncate text-[var(--color-text)]">{request.model}</span><span className="block truncate text-[var(--color-text-muted)]">{request.provider || "Unknown provider"}</span></td>
                <td className="data-text px-3 py-2 text-right">{fmt(request.promptTokens)} / {fmt(request.completionTokens)}</td>
                <td className="px-3 py-2 text-right text-[var(--color-text-muted)]"><TimeAgo timestamp={request.timestamp} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function sortData(dataMap, pendingMap, sortBy, sortOrder) {
  return Object.entries(dataMap || {}).map(([key, data]) => {
    const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
    const totalCost = data.cost || 0;
    const cachedTokens = data.cachedTokens || 0;
    const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
    return {
      ...data, key, totalTokens, totalCost,
      inputCost: totalTokens ? nonCachedInput * (totalCost / totalTokens) : 0,
      cachedCost: totalTokens ? cachedTokens * (totalCost / totalTokens) : 0,
      outputCost: totalTokens ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0,
      pending: pendingMap?.[key] || 0,
      accountName: maskAccount(data.accountName),
    };
  }).sort((a, b) => {
    let left = a[sortBy]; let right = b[sortBy];
    if (typeof left === "string") left = left.toLowerCase();
    if (typeof right === "string") right = right.toLowerCase();
    if (left === right) return 0;
    return (left < right ? -1 : 1) * (sortOrder === "asc" ? 1 : -1);
  });
}

function getGroupKey(item, field) {
  if (field === "rawModel") return item.rawModel || "Unknown model";
  if (field === "accountName") return item.accountName || `Account ${item.connectionId?.slice(0, 8)}…`;
  if (field === "keyName") return item.keyName || "Unknown key";
  return item[field] || "Unknown";
}

function groupData(data, field) {
  const groups = new Map();
  for (const item of data || []) {
    const groupKey = getGroupKey(item, field);
    if (!groups.has(groupKey)) groups.set(groupKey, { groupKey, summary: { requests: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, inputCost: 0, cachedCost: 0, outputCost: 0, pending: 0, lastUsed: null }, items: [] });
    const group = groups.get(groupKey);
    for (const key of ["requests", "promptTokens", "cachedTokens", "completionTokens", "totalTokens", "cost", "inputCost", "cachedCost", "outputCost", "pending"]) group.summary[key] += item[key] || 0;
    if (item.lastUsed && (!group.summary.lastUsed || new Date(item.lastUsed) > new Date(group.summary.lastUsed))) group.summary.lastUsed = item.lastUsed;
    group.items.push(item);
  }
  return [...groups.values()];
}

function LoadingBands() {
  return <div className="space-y-6" aria-label="Loading usage"><div className="grid grid-cols-2 gap-px border border-[var(--ledger-border)] bg-[var(--ledger-rule)] lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse bg-[var(--ledger-bg)]" />)}</div><div className="h-72 animate-pulse border border-[var(--ledger-border)] bg-[var(--color-surface-strong)]" /></div>;
}

export default function UsageDashboard({ period, mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";
  const requestedTable = searchParams.get("table");
  const [tableView, setTableView] = useState(TABLE_OPTIONS.some((option) => option.value === requestedTable) ? requestedTable : "model");
  const [stats, setStats] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [streamError, setStreamError] = useState(false);
  const loaded = useRef(false);

  const fetchStats = useCallback(async () => {
    loaded.current ? setFetching(true) : setLoading(true);
    setStatsError("");
    try {
      const response = await fetch(`/api/usage/stats?period=${period}`);
      if (!response.ok) throw new Error(`Usage statistics failed (${response.status})`);
      const data = await response.json();
      setStats((previous) => ({ ...previous, ...data }));
      loaded.current = true;
    } catch (error) {
      setStatsError(error.message || "Failed to load usage statistics.");
    } finally { setLoading(false); setFetching(false); }
  }, [period]);

  useEffect(() => {
    // Data loading is intentionally initiated when the selected period changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
  }, [fetchStats]);
  useEffect(() => {
    Promise.all([fetch("/api/providers?mode=full").then((response) => response.ok ? response.json() : null), fetch("/api/provider-nodes").then((response) => response.ok ? response.json() : null)]).then(([data, nodeData]) => {
      const names = Object.fromEntries((nodeData?.nodes || []).map((node) => [node.id, node.name]));
      const seen = new Set();
      const connected = (data?.connections || []).filter((connection) => connection.isActive !== false && isLlmProvider(connection.provider) && !seen.has(connection.provider) && seen.add(connection.provider)).map((connection) => ({ ...connection, nodeName: names[connection.provider] || null }));
      const free = Object.values(FREE_PROVIDERS).filter((provider) => provider.noAuth && !seen.has(provider.id) && isLlmProvider(provider.id)).map((provider) => ({ provider: provider.id, name: provider.name }));
      setProviders([...connected, ...free]);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const source = new EventSource("/api/usage/stream");
    source.onopen = () => setStreamError(false);
    source.onmessage = (event) => { try { const data = JSON.parse(event.data); setStats((previous) => previous ? ({ ...previous, activeRequests: data.activeRequests, recentRequests: data.recentRequests, errorProvider: data.errorProvider, pending: data.pending }) : previous); } catch {} };
    source.onerror = () => setStreamError(true);
    return () => source.close();
  }, []);

  const toggleSort = useCallback((table, field) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextOrder = sortBy === field && sortOrder === "asc" ? "desc" : "asc";
    params.set("table", table);
    params.set("sortBy", field);
    params.set("sortOrder", nextOrder);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams, sortBy, sortOrder]);

  const config = useMemo(() => {
    if (!stats) return null;
    const commonSummary = (count) => {
      function SummaryCells(group) {
        return <>{Array.from({ length: count }, (_, index) => <td key={index} className="px-6 py-3 text-[var(--color-text-muted)]">—</td>)}<td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td><td className="px-6 py-3 text-right text-[var(--color-text-muted)]">{fmtTime(group.summary.lastUsed)}</td></>;
      }
      return SummaryCells;
    };
    const detail = (item, first) => <><td className="px-6 py-3 font-medium">{first}</td>{tableView !== "model" && <td className="px-6 py-3 data-text">{item.rawModel}</td>}<td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>{tableView === "account" && <td className="px-6 py-3">{item.accountName}</td>}<td className="px-6 py-3 text-right">{fmt(item.requests)}</td><td className="px-6 py-3 text-right text-[var(--color-text-muted)]">{fmtTime(item.lastUsed)}</td></>;
    if (tableView === "account") return { columns: ACCOUNT_COLUMNS, groups: groupData(sortData(stats.byAccount, {}, sortBy, sortOrder), "accountName"), summary: commonSummary(2), detail: (item) => detail(item, item.accountName), empty: "No account-specific usage recorded yet." };
    if (tableView === "apiKey") return { columns: API_KEY_COLUMNS, groups: groupData(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"), summary: commonSummary(2), detail: (item) => detail(item, item.keyName), empty: "No API key usage recorded yet." };
    if (tableView === "endpoint") return { columns: ENDPOINT_COLUMNS, groups: groupData(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"), summary: commonSummary(2), detail: (item) => detail(item, item.endpoint), empty: "No endpoint usage recorded yet." };
    return { columns: MODEL_COLUMNS, groups: groupData(sortData(stats.byModel, stats.pending?.byModel || {}, sortBy, sortOrder), "rawModel"), summary: commonSummary(1), detail: (item) => detail(item, item.rawModel), empty: "No usage recorded yet." };
  }, [sortBy, sortOrder, stats, tableView]);

  if (loading && !stats) return <LoadingBands />;
  if (!stats) return <div className="border border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-4 text-sm"><strong>Usage unavailable.</strong> {statsError}<button type="button" onClick={fetchStats} className="ml-3 underline">Retry</button></div>;

  return <div className="space-y-8">
    {(statsError || streamError) && <div className="border border-[var(--color-warning)] bg-[var(--color-warning-wash)] p-3 text-sm text-[var(--color-warning)]">{statsError || "Live updates disconnected. Displayed aggregate data may be stale."} <button type="button" onClick={fetchStats} className="font-semibold underline">Refresh</button></div>}
    <section className="ledger-band"><header className="ledger-caption"><span className="ledger-number">01</span><h2 className="font-semibold">Snapshot</h2>{fetching && <span className="ml-auto text-xs text-[var(--color-text-muted)]">Refreshing…</span>}</header><OverviewCards stats={stats} viewMode={mode} /></section>
    <section className="ledger-band"><header className="ledger-caption"><span className="ledger-number">02</span><h2 className="font-semibold">Route activity</h2><span className="ml-auto data-text text-xs text-[var(--color-text-muted)]">{stats.activeRequests?.length || 0} active</span></header><div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]"><ProviderTopology providers={providers} activeRequests={stats.activeRequests || []} lastProvider={stats.recentRequests?.[0]?.provider || ""} errorProvider={stats.errorProvider || ""} /><RecentRequests requests={stats.recentRequests || []} /></div></section>
    <section className="ledger-band"><header className="ledger-caption"><span className="ledger-number">03</span><h2 className="font-semibold">Trend</h2><span className="ml-auto data-text text-xs text-[var(--color-text-muted)]">{mode === "tokens" ? "Tokens" : "USD"}</span></header><UsageChart period={period} viewMode={mode} /></section>
    <section className="ledger-band"><header className="ledger-caption flex-wrap"><span className="ledger-number">04</span><h2 className="font-semibold">Breakdown</h2><div className="ml-auto flex items-center gap-2"><label htmlFor="usage-breakdown" className="sr-only">Break down usage by</label><select id="usage-breakdown" value={tableView} onChange={(event) => { setTableView(event.target.value); const params = new URLSearchParams(searchParams.toString()); params.set("table", event.target.value); router.replace(`?${params.toString()}`, { scroll: false }); }} className="h-9 rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm">{TABLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></header>{config && <UsageTable title="" columns={config.columns} groupedData={config.groups} tableType={tableView} sortBy={sortBy} sortOrder={sortOrder} onToggleSort={toggleSort} viewMode={mode} storageKey={`usage-ledger:${tableView}`} renderSummaryCells={config.summary} renderDetailCells={config.detail} emptyMessage={config.empty} />}{tableView === "apiKey" && config?.groups?.length > 0 && <div className="border-t border-[var(--ledger-rule)] p-3 text-xs text-[var(--color-text-muted)]">Deep-link a key group without copying credentials: {config.groups.slice(0, 3).map((group, index) => <Fragment key={group.groupKey}>{index ? " · " : ""}<Link className="text-[var(--color-primary)] underline" href={`?tab=overview&table=apiKey&key=${encodeURIComponent(group.groupKey)}`}>{group.groupKey}</Link></Fragment>)}</div>}</section>
  </div>;
}
