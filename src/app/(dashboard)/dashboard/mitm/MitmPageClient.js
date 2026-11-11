"use client";
/* eslint-disable react-hooks/immutability */

import { useState, useEffect } from "react";
import { AlertTriangle, Network, ShieldCheck } from "lucide-react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { MitmServerCard, MitmToolCard } from "@/app/(dashboard)/dashboard/cli-tools/components";
import LoadFailedState from "@/shared/components/LoadFailedState";

// Each loader throws on a non-2xx so a failed load never renders as "no data".
async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (HTTP ${res.status})`);
  return res.json();
}

export default function MitmPageClient() {
  const [connections, setConnections] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [expandedTool, setExpandedTool] = useState(null);
  const [mitmStatus, setMitmStatus] = useState({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });
  const [loadError, setLoadError] = useState(false);
  // Aliases and settings are secondary: a failure warns inline, never hides the page.
  const [secondaryFailures, setSecondaryFailures] = useState([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [providers, keys, aliases, settings] = await Promise.allSettled([
      loadJson("/api/providers?mode=full").then((data) => setConnections(data.connections || [])),
      loadJson("/api/keys").then((data) => setApiKeys(data.keys || [])),
      loadJson("/api/models/alias").then((data) => setModelAliases(data.aliases || {})),
      loadJson("/api/settings").then((data) => setCloudEnabled(data.cloudEnabled || false)),
    ]);
    setLoadError([providers, keys].some((result) => result.status === "rejected"));
    setSecondaryFailures([
      aliases.status === "rejected" ? "model aliases" : null,
      settings.status === "rejected" ? "settings" : null,
    ].filter(Boolean));
  };

  const retryLoad = async () => {
    setRetrying(true);
    try {
      await loadAll();
    } finally {
      setRetrying(false);
    }
  };

  const getActiveProviders = () => connections.filter(c => c.isActive !== false);

  const hasActiveProviders = () => {
    const active = getActiveProviders();
    return active.some(conn =>
      getModelsByProviderId(conn.provider).length > 0 ||
      isOpenAICompatibleProvider(conn.provider) ||
      isAnthropicCompatibleProvider(conn.provider)
    );
  };

  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-8 px-1 sm:px-0">
      <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-wash)]">
        <div className="flex items-start gap-3 px-4 py-3">
          <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
          <div><h2 className="text-sm font-semibold text-[var(--color-text)]">Traffic interception warning</h2><p className="mt-1 text-xs leading-relaxed text-[var(--color-text)]">MITM intercepts HTTPS traffic from IDE tools through a local certificate authority and redirects requests to your providers. This may violate a tool provider’s terms and can put the associated account at risk. Use only when you understand the impact.</p></div>
        </div>
      </section>

      {loadError ? (
        <LoadFailedState
          title="Couldn't load MITM data"
          message="Providers or API keys could not be loaded, so server and tool routes are hidden instead of showing empty data. Retry to load them again."
          onRetry={retryLoad}
          retrying={retrying}
        />
      ) : <>
      {secondaryFailures.length > 0 && (
        <div data-testid="secondary-load-warning" role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-warning-wash)] px-4 py-2 text-xs text-[var(--color-text)]">
          <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
          <span>Couldn&apos;t load {secondaryFailures.join(" and ")}. Server and tool routes are shown; alias mapping and cloud options may use defaults until you reload.</span>
        </div>
      )}
      <LedgerBand number="01" title="Interception server" summary={mitmStatus.running ? "Server running" : "Server stopped"} icon={ShieldCheck}>
        <div className="p-3 sm:p-4"><MitmServerCard apiKeys={apiKeys} cloudEnabled={cloudEnabled} onStatusChange={setMitmStatus} /></div>
      </LedgerBand>

      <LedgerBand number="02" title="Tool routes" summary={`${mitmTools.length} interception target${mitmTools.length === 1 ? "" : "s"}`} icon={Network}>
        {mitmTools.length === 0 ? <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">No MITM tools are available.</div> : <div className="divide-y divide-[var(--color-border-subtle)]">
          {mitmTools.map(([toolId, tool], index) => (
            <div key={toolId} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 p-3 sm:p-4">
              <span className="mt-3 border-r border-[var(--color-border-strong)] pr-3 text-center font-mono text-xs tabular-nums text-[var(--color-primary)]">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0"><MitmToolCard tool={tool} isExpanded={expandedTool === toolId} onToggle={() => setExpandedTool(expandedTool === toolId ? null : toolId)} serverRunning={mitmStatus.running} dnsActive={mitmStatus.dnsStatus?.[toolId] || false} hasCachedPassword={mitmStatus.hasCachedPassword || false} needsSudoPassword={mitmStatus.needsSudoPassword !== false} isWin={mitmStatus.isWin === true} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders()} modelAliases={modelAliases} cloudEnabled={cloudEnabled} onDnsChange={(data) => setMitmStatus(prev => ({ ...prev, dnsStatus: data.dnsStatus ?? prev.dnsStatus }))} /></div>
            </div>
          ))}
        </div>}
      </LedgerBand>
      </>}
    </div>
  );
}


function LedgerBand({ number, title, summary, icon: Icon, children }) {
  return <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]"><header className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] px-4 py-3"><span className="font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">{number}</span><Icon size={17} strokeWidth={1.75} className="shrink-0 text-[var(--color-text-muted)]"/><div className="min-w-0"><h2 className="font-semibold">{title}</h2><p className="text-xs text-[var(--color-text-muted)]">{summary}</p></div></header>{children}</section>;
}
