"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers";

function getEffectiveStatus(conn) {
  const isCooldown = Object.entries(conn).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
  );
  return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
}

function ProviderRow({ provider, kind, connections }) {
  const isNoAuth = AI_PROVIDERS[provider.id]?.noAuth === true;
  const providerConns = connections.filter((c) => c.provider === provider.id);
  const connected = providerConns.filter((c) => ["active", "success"].includes(getEffectiveStatus(c))).length;
  const error = providerConns.filter((c) => ["error", "expired", "unavailable"].includes(getEffectiveStatus(c))).length;
  const allDisabled = providerConns.length > 0 && providerConns.every((c) => c.isActive === false);
  let marker = "◇";
  let label = "No connections";
  let tone = "text-text-muted";
  if (isNoAuth) { marker = "●"; label = "Ready"; tone = "text-success"; }
  else if (allDisabled) { marker = "Ⅱ"; label = "Disabled"; }
  else if (error > 0) { marker = "■"; label = `${error} Error${error === 1 ? "" : "s"}`; tone = "text-danger"; }
  else if (connected > 0) { marker = "●"; label = `${connected} Connected`; tone = "text-success"; }
  else if (providerConns.length > 0) label = `${providerConns.length} Added`;

  return (
    <Link href={`/dashboard/media-providers/${kind}/${provider.id}`} className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] group flex min-h-11 items-center gap-3 px-3 py-3">
      <ProviderIcon src={`/providers/${provider.id}.png`} alt={provider.name} size={30} className="size-[30px] shrink-0 object-contain" fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()} fallbackColor={provider.color} />
      <span className="min-w-0 flex-1 font-medium">{provider.name}</span>
      {isNoAuth && <span className="category-label">No key required</span>}
      <span className={`inline-flex items-center gap-2 text-sm ${tone}`}><span aria-hidden="true">{marker}</span>{label}</span>
      <Icon name="chevron_right" size={18} className="text-text-muted" />
    </Link>
  );
}

function ComboRows({ combos }) {
  return combos.map((combo) => (
    <Link key={combo.id} href={`/dashboard/media-providers/combo/${combo.id}`} className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex min-h-11 items-center gap-3 px-3 py-3">
      <Icon name="layers" size={18} className="text-primary" />
      <code className="min-w-0 flex-1 truncate text-sm font-medium">{combo.name}</code>
      <span className="data-text">{combo.models.length} routes</span>
      <Icon name="chevron_right" size={18} className="text-text-muted" />
    </Link>
  ));
}

function Section({ number, title, kind, providers, connections, combos, onCreateCombo }) {
  const noAuth = providers.filter((p) => AI_PROVIDERS[p.id]?.noAuth === true);
  const requiresConnections = providers.filter((p) => AI_PROVIDERS[p.id]?.noAuth !== true);
  return (
    <section className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <span>{number} {title}</span>
        <div className="flex items-center gap-3"><span className="data-text">{providers.length} providers · {combos.length} combos</span><Button size="sm" icon="add" onClick={onCreateCombo}>Create Combo</Button></div>
      </div>
      {combos.length > 0 && <div className="border-b border-border"><div className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">Route chains</div><ComboRows combos={combos} /></div>}
      {noAuth.length > 0 && <div><div className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">Ready without credentials</div>{noAuth.map((p) => <ProviderRow key={p.id} provider={p} kind={kind} connections={connections} />)}</div>}
      <div>
        <div className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">Connections required</div>
        {requiresConnections.length > 0 ? requiresConnections.map((p) => <ProviderRow key={p.id} provider={p} kind={kind} connections={connections} />) : <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] px-3 py-4 text-sm text-text-muted">No providers.</div>}
      </div>
    </section>
  );
}

export default function WebProvidersPage() {
  const router = useRouter();
  const [connections, setConnections] = useState([]);
  const [combos, setCombos] = useState([]);
  const fetchAll = async () => {
    try {
      const [connsRes, combosRes] = await Promise.all([fetch("/api/providers?mode=full", { cache: "no-store" }), fetch("/api/combos", { cache: "no-store" })]);
      if (connsRes.ok) setConnections((await connsRes.json()).connections || []);
      if (combosRes.ok) setCombos((await combosRes.json()).combos || []);
    } catch { /* noop */ }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, []);
  const searchProviders = getProvidersByKind("webSearch");
  const fetchProviders = getProvidersByKind("webFetch");
  const handleCreateCombo = async (kind) => {
    const base = kind === "webSearch" ? "search-combo" : "fetch-combo";
    let name = base; let i = 1; const existing = new Set(combos.map((c) => c.name));
    while (existing.has(name)) name = `${base}-${i++}`;
    const res = await fetch("/api/combos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, models: [], kind }) });
    if (res.ok) { const created = await res.json(); router.push(`/dashboard/media-providers/combo/${created.id}`); }
    else { const err = await res.json(); alert(err.error || "Failed to create combo"); }
  };
  return <div className="flex flex-col gap-6"><Section number="01" title="Web Search" kind="webSearch" providers={searchProviders} connections={connections} combos={combos.filter((c) => c.kind === "webSearch")} onCreateCombo={() => handleCreateCombo("webSearch")} /><Section number="02" title="Web Fetch" kind="webFetch" providers={fetchProviders} connections={connections} combos={combos.filter((c) => c.kind === "webFetch")} onCreateCombo={() => handleCreateCombo("webFetch")} /></div>;
}
