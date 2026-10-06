"use client";
/* eslint-disable react-hooks/immutability */

import { useState, useEffect } from "react";
import { AlertTriangle, Network, ShieldCheck } from "lucide-react";
import { MITM_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { MitmServerCard, MitmToolCard } from "@/app/(dashboard)/dashboard/cli-tools/components";

export default function MitmPageClient() {
  const [connections, setConnections] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [expandedTool, setExpandedTool] = useState(null);
  const [mitmStatus, setMitmStatus] = useState({ running: false, certExists: false, dnsStatus: {}, hasCachedPassword: false });

  useEffect(() => {
    fetchConnections();
    fetchApiKeys();
    fetchAliases();
    fetchCloudSettings();
  }, []);

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/providers?mode=full");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch { /* ignore */ }
  };

  const fetchApiKeys = async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch { /* ignore */ }
  };

  const fetchAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      if (res.ok) {
        const data = await res.json();
        setModelAliases(data.aliases || {});
      }
    } catch { /* ignore */ }
  };

  const fetchCloudSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setCloudEnabled(data.cloudEnabled || false);
      }
    } catch { /* ignore */ }
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
          <div><h2 className="text-sm font-semibold text-[var(--color-warning)]">Traffic interception warning</h2><p className="mt-1 text-xs leading-relaxed text-[var(--color-text)]">MITM intercepts HTTPS traffic from IDE tools through a local certificate authority and redirects requests to your providers. This may violate a tool provider’s terms and can put the associated account at risk. Use only when you understand the impact.</p></div>
        </div>
      </section>

      <LedgerBand number="01" title="Interception server" summary={mitmStatus.running ? "Server running" : "Server stopped"} icon={ShieldCheck}>
        <div className="p-3 sm:p-4"><MitmServerCard apiKeys={apiKeys} cloudEnabled={cloudEnabled} onStatusChange={setMitmStatus} /></div>
      </LedgerBand>

      <LedgerBand number="02" title="Tool routes" summary={`${mitmTools.length} interception target${mitmTools.length === 1 ? "" : "s"}`} icon={Network}>
        {mitmTools.length === 0 ? <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">No MITM tools are available.</div> : <div className="divide-y divide-[var(--color-border-subtle)]">
          {mitmTools.map(([toolId, tool], index) => (
            <div key={toolId} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 p-3 sm:p-4">
              <span className="mt-3 border-r border-[var(--color-border-strong)] pr-3 text-center font-mono text-xs tabular-nums text-[var(--color-primary)]">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0"><MitmToolCard tool={tool} isExpanded={expandedTool === toolId} onToggle={() => setExpandedTool(expandedTool === toolId ? null : toolId)} serverRunning={mitmStatus.running} dnsActive={mitmStatus.dnsStatus?.[toolId] || false} hasCachedPassword={mitmStatus.hasCachedPassword || false} needsSudoPassword={mitmStatus.needsSudoPassword !== false} isWin={mitmStatus.isWin === true} apiKeys={apiKeys} activeProviders={getActiveProviders()} hasActiveProviders={hasActiveProviders()} modelAliases={modelAliases} cloudEnabled={cloudEnabled} onDnsChange={(data) => setMitmStatus(prev => ({ ...prev, dnsStatus: data.dnsStatus ?? prev.dnsStatus }))} /></div>
            </div>
          ))}
        </div>}
      </LedgerBand>
    </div>
  );
}


function LedgerBand({ number, title, summary, icon: Icon, children }) {
  return <section className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]"><header className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] px-4 py-3"><span className="font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">{number}</span><Icon size={17} strokeWidth={1.75} className="shrink-0 text-[var(--color-text-muted)]"/><div className="min-w-0"><h2 className="font-semibold">{title}</h2><p className="text-xs text-[var(--color-text-muted)]">{summary}</p></div></header>{children}</section>;
}
