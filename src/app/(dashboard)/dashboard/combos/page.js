"use client";

import Icon from "@/shared/components/Icon";
import { useState, useEffect } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { Card, Button, Modal, Input, CardSkeleton, ModelSelectModal, ConfirmModal, CapacityBadges, Toggle } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// Capacity adapter: global fallback pools of models per input-modality capability.
// A request needing a capability the target model/combo lacks switches straight
// to the first enabled model here instead of erroring or dropping the data.
const CAPACITY_ADAPTER_CAPS = [
  { key: "vision", label: "Vision", icon: "visibility", desc: "Images" },
  // pdf, videoInput temporarily hidden — no translator support yet for those blocks.
  { key: "audioInput", label: "Audio", icon: "graphic_eq", desc: "Audio input" },
];
const DEFAULT_FALLBACK_MODEL = "oc/mimo-v2.5-free";
const EMPTY_CAP_ENTRY = { enabled: true, roundRobin: false, models: [] };
const EMPTY_CAPACITY_ADAPTER = {
  vision: { ...EMPTY_CAP_ENTRY },
  pdf: { ...EMPTY_CAP_ENTRY },
  audioInput: { ...EMPTY_CAP_ENTRY },
  videoInput: { ...EMPTY_CAP_ENTRY },
};
// Backward-compat: legacy stored form was an array of {model, enabled}.
function normalizeCapEntry(entry) {
  if (Array.isArray(entry)) {
    return { enabled: true, roundRobin: false, models: entry.map((e) => e?.model || e).filter(Boolean) };
  }
  if (entry && typeof entry === "object") {
    return {
      enabled: entry.enabled !== false,
      roundRobin: !!entry.roundRobin,
      models: Array.isArray(entry.models) ? entry.models.filter(Boolean) : [],
    };
  }
  return { ...EMPTY_CAP_ENTRY };
}

export default function CombosPage() {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [comboStrategies, setComboStrategies] = useState({});
  const [capacityAdapter, setCapacityAdapter] = useState(EMPTY_CAPACITY_ADAPTER);
  const { getCaps } = useModelCaps();
  const [confirmState, setConfirmState] = useState(null);
  const [fetchError, setFetchError] = useState("");
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setFetchError("");
    try {
      const [combosRes, providersRes, settingsRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers?mode=full"),
        fetch("/api/settings"),
      ]);
      const combosData = await combosRes.json();
      const providersData = await providersRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      if (!combosRes.ok) setFetchError("Combos could not be loaded. Retry without losing adapter controls.");
      if (!providersRes.ok) setFetchError((current) => current || "Provider models could not be loaded. Retry to restore model selection.");
      
      // Only LLM combos here - webSearch/webFetch combos belong to media-providers/web
      if (combosRes.ok) setCombos((combosData.combos || []).filter(c => !c.kind || c.kind === "llm"));
      if (providersRes.ok) {
        setActiveProviders(providersData.connections || []);
      }
      setComboStrategies(settingsData.comboStrategies || {});
      const rawAdapter = settingsData.capacityAdapter || {};
      const normalized = {};
      for (const cap of CAPACITY_ADAPTER_CAPS) {
        normalized[cap.key] = normalizeCapEntry(rawAdapter[cap.key]);
      }
      setCapacityAdapter(normalized);
    } catch (error) {
      console.log("Error fetching data:", error);
      setFetchError("Routing data could not be loaded. Check the gateway and retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetCapacityAdapter = async (next) => {
    setCapacityAdapter(next);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacityAdapter: next }),
      });
    } catch (error) {
      console.log("Error updating capacity adapter:", error);
    }
  };

  const handleCreate = async (data) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setShowCreateModal(false);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create combo");
      }
    } catch (error) {
      console.log("Error creating combo:", error);
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      const res = await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setEditingCombo(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update combo");
      }
    } catch (error) {
      console.log("Error updating combo:", error);
    }
  };

  const handleDelete = async (id, name) => {
    setConfirmState({
      title: "Delete Combo",
      message: `Delete combo “${name}”? This removes the route alias but does not delete provider models.`,
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
          if (res.ok) {
            setCombos(combos.filter(c => c.id !== id));
          }
        } catch (error) {
          console.log("Error deleting combo:", error);
        }
      }
    });
  };

  // Merge a per-combo strategy patch into settings.comboStrategies. Passing an empty
  // patch (strategy back to default "fallback") drops the entry entirely.
  const handleSetComboStrategy = async (comboName, patch) => {
    try {
      const updated = { ...comboStrategies };
      const next = { ...(updated[comboName] || {}), ...patch };
      // Prune to keep settings clean: default fallback with no extras = no entry.
      if (!next.fallbackStrategy || next.fallbackStrategy === "fallback") {
        delete updated[comboName];
      } else {
        updated[comboName] = next;
      }

      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategies: updated }),
      });

      setComboStrategies(updated);
    } catch (error) {
      console.log("Error updating combo strategy:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-8" aria-label="Loading routing configuration">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8 px-1 sm:px-0">
      <LedgerBand number="01" title="Routing model" summary="One alias, three ways to route a request.">
        <div className="grid gap-px overflow-hidden border border-[var(--ledger-rule)] bg-[var(--ledger-rule)] md:grid-cols-3">
          {[
            ["01", "Fallback", "Try each model in order until one succeeds.", "One successful call"],
            ["02", "Round robin", "Rotate the starting model across requests.", "One successful call"],
            ["03", "Fusion", "Run the panel in parallel, then ask a judge to synthesize.", "Panel calls + judge call"],
          ].map(([step, title, copyText, cost]) => (
            <div key={title} className="relative bg-[var(--ledger-bg)] p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-[var(--color-primary)]">{step}</span>
                <span className="h-px flex-1 bg-[var(--route-line)]" />
                <Icon name={title === "Fusion" ? "gavel" : "route"} size={17} className="text-[var(--color-text-muted)]" />
              </div>
              <p className="font-semibold text-[var(--color-text)]">{title}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{copyText}</p>
              <p className="mt-3 font-mono text-xs text-[var(--color-text-subtle)]">Cost: {cost}</p>
            </div>
          ))}
        </div>
      </LedgerBand>

      <LedgerBand
        number="02"
        title="Combos"
        summary={`${combos.length} ordered route${combos.length === 1 ? "" : "s"}`}
        action={<Button icon="add" onClick={() => setShowCreateModal(true)}>Create combo</Button>}
      >
        {fetchError && (
          <div className="flex flex-col gap-3 border-b border-[var(--ledger-rule)] bg-[var(--color-danger-wash)] p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <span className="flex items-center gap-2 text-sm text-[var(--color-danger)]"><Icon name="error" />{fetchError}</span>
            <Button size="sm" variant="secondary" icon="refresh" onClick={fetchData}>Retry</Button>
          </div>
        )}
        {combos.length === 0 ? (
          <div className="p-8 text-center">
            <Icon name="route" size={28} className="mx-auto text-[var(--color-text-muted)]" />
            <p className="mt-3 font-semibold">No combos yet</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-[var(--color-text-muted)]">Create an ordered route. Fallback begins at position 01 and advances only when a model cannot serve the request.</p>
            <Button icon="add" onClick={() => setShowCreateModal(true)} className="mt-4">Create combo</Button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--ledger-rule)]">
            {combos.map((combo) => (
              <ComboCard
                key={combo.id}
                combo={combo}
                getCaps={getCaps}
                activeProviders={activeProviders}
                copied={copied}
                onCopy={copy}
                onEdit={() => setEditingCombo(combo)}
                onDelete={() => handleDelete(combo.id, combo.name)}
                onChangeModels={(models) => handleUpdate(combo.id, { name: combo.name, models })}
                strategy={comboStrategies[combo.name] || {}}
                onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
              />
            ))}
          </div>
        )}
      </LedgerBand>

      <LedgerBand number="03" title="Capacity adapters" summary="Capability-specific fallback pools remain independent from combos.">
        <CapacityAdapterSection
          capacityAdapter={capacityAdapter}
          onChange={handleSetCapacityAdapter}
          activeProviders={activeProviders}
          getCaps={getCaps}
        />
      </LedgerBand>

      {showCreateModal && (
        <ComboFormModal key="create" isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSave={handleCreate} activeProviders={activeProviders} />
      )}
      {editingCombo && (
        <ComboFormModal key={editingCombo.id} isOpen={!!editingCombo} combo={editingCombo} onClose={() => setEditingCombo(null)} onSave={(data) => handleUpdate(editingCombo.id, data)} activeProviders={activeProviders} />
      )}
      <ConfirmModal isOpen={!!confirmState} onClose={() => setConfirmState(null)} onConfirm={confirmState?.onConfirm} title={confirmState?.title || "Confirm"} message={confirmState?.message} variant="danger" />
    </div>
  );
}

function LedgerBand({ number, title, summary, action, children }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--ledger-border)] bg-[var(--ledger-bg)]">
      <header className="flex flex-col gap-3 border-b border-[var(--ledger-rule)] bg-[var(--ledger-caption-bg)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">{number}</span>
          <div className="min-w-0">
            <h2 className="font-semibold text-[var(--color-text)]">{title}</h2>
            {summary && <p className="text-xs text-[var(--color-text-muted)]">{summary}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

const STRATEGY_OPTIONS = [
  { value: "fallback", label: "Fallback — try in order", shortLabel: "Fallback" },
  { value: "round-robin", label: "Round Robin — rotate", shortLabel: "Round robin" },
  { value: "fusion", label: "Fusion — panel + judge", shortLabel: "Fusion" },
];

function ComboCard({ combo, getCaps, activeProviders = [], copied, onCopy, onEdit, onDelete, onChangeModels, strategy = {}, onSetStrategy }) {
  const [showJudgeSelect, setShowJudgeSelect] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const current = strategy.fallbackStrategy || "fallback";
  const judge = strategy.judgeModel || "";
  const isFusion = current === "fusion";

  const moveModel = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= combo.models.length) return;
    const next = [...combo.models];
    [next[index], next[target]] = [next[target], next[index]];
    setAnnouncement(`${combo.models[index]} moved from position ${index + 1} to ${target + 1}`);
    onChangeModels(next);
  };

  const testCombo = async () => {
    setTesting(true);
    setTestResult(null);
    const started = performance.now();
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: combo.name, kind: "llm" }),
      });
      const data = await res.json();
      setTestResult({ ok: res.ok && data.ok !== false, code: res.status, latency: Math.round(performance.now() - started), error: data.error || "" });
    } catch {
      setTestResult({ ok: false, code: "NET", latency: Math.round(performance.now() - started), error: "Network error. Check the gateway and retry." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <article>
      <div className="grid min-h-[var(--row-h-comfortable)] gap-3 px-4 py-3 lg:grid-cols-[minmax(240px,1fr)_minmax(300px,auto)_auto] lg:items-center">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="flex min-w-0 items-center gap-3 text-left" aria-expanded={expanded}>
          <Icon name={expanded ? "chevron_down" : "chevron_right"} size={18} className="shrink-0 text-[var(--color-text-muted)]" />
          <span className="flex size-8 shrink-0 items-center justify-center border border-[var(--signal-row-rail)] font-mono text-xs tabular-nums text-[var(--color-primary)]">{String(combo.models.length).padStart(2, "0")}</span>
          <span className="min-w-0"><code className="block truncate font-mono text-sm font-semibold">{combo.name}</code><span className="text-xs text-[var(--color-text-muted)]">{combo.models.length} member{combo.models.length === 1 ? "" : "s"}</span></span>
        </button>
        <div className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-strong)]" aria-label="Routing strategy">
          {STRATEGY_OPTIONS.map((option) => (
            <button key={option.value} type="button" aria-pressed={current === option.value} onClick={() => onSetStrategy({ fallbackStrategy: option.value })} className={`min-h-9 px-3 text-xs font-medium transition-colors ${current === option.value ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"}`}>{option.shortLabel}</button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1 sm:flex">
          <ActionButton icon={copied === `combo-${combo.id}` ? "check" : "copy"} label="Copy" onClick={() => onCopy(combo.name, `combo-${combo.id}`)} />
          <ActionButton icon="edit" label="Edit" onClick={onEdit} />
          <ActionButton icon={testing ? "progress_activity" : "play_arrow"} label={testing ? "Testing" : "Test"} onClick={testCombo} disabled={testing || combo.models.length === 0} spin={testing} />
          <ActionButton icon="delete" label="Delete" onClick={onDelete} danger />
        </div>
      </div>

      {isFusion && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ledger-rule)] bg-[var(--color-surface-strong)] px-4 py-2 text-xs">
          <Icon name="gavel" size={16} className="text-[var(--color-text-muted)]" /><span className="font-medium">Judge</span>
          <button type="button" onClick={() => setShowJudgeSelect(true)} className="min-h-8 max-w-full truncate border border-dashed border-[var(--color-primary-border)] px-2 font-mono text-[var(--color-primary)]">{judge || `Auto — ${combo.models[0] || "first model"}`}</button>
          {judge && <button type="button" onClick={() => onSetStrategy({ judgeModel: "" })} className="min-h-8 px-2 text-[var(--color-danger)]">Reset</button>}
        </div>
      )}

      {expanded && (
        <div className="border-t border-[var(--ledger-rule)] bg-[var(--color-surface-strong)] p-3 sm:p-4">
          <div className="space-y-2">
            {combo.models.map((model, index) => (
              <div key={`${model}-${index}`} className="grid min-h-14 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border border-[var(--ledger-rule)] bg-[var(--ledger-bg)] px-3 py-2">
                <div className="flex h-full flex-col items-center justify-center border-r border-[var(--route-line)] pr-3 font-mono text-xs tabular-nums text-[var(--color-primary)]">{String(index + 1).padStart(2, "0")}</div>
                <div className="min-w-0"><code className="block break-all font-mono text-xs text-[var(--color-text)]">{model}</code><div className="mt-1 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]"><span className="size-2 rounded-full border border-[var(--color-text-subtle)]" />Not tested</span><CapacityBadges caps={getCaps?.(model)} /></div></div>
                <div className="flex items-center gap-1">
                  <IconButton icon="arrow_upward" label={`Move ${model} up`} onClick={() => moveModel(index, -1)} disabled={index === 0} />
                  <IconButton icon="arrow_downward" label={`Move ${model} down`} onClick={() => moveModel(index, 1)} disabled={index === combo.models.length - 1} />
                  <IconButton icon="close" label={`Remove ${model}`} onClick={() => onChangeModels(combo.models.filter((_, itemIndex) => itemIndex !== index))} danger />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setShowAddModel(true)} className="flex min-h-12 w-full items-center justify-center gap-2 border border-dashed border-[var(--color-primary-border)] font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-wash)]"><Icon name="add" size={17} />Add model</button>
          </div>
        </div>
      )}

      {testResult && (
        <div className={`flex flex-wrap items-center gap-3 border-t px-4 py-3 text-xs ${testResult.ok ? "border-[var(--color-success)] bg-[var(--color-success-wash)]" : "border-[var(--color-danger)] bg-[var(--color-danger-wash)]"}`} role="status">
          <Icon name={testResult.ok ? "check_circle" : "error"} size={17} className={testResult.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"} />
          <code className="font-mono">{combo.name}</code><span className="font-mono tabular-nums">HTTP {testResult.code}</span><span className="font-mono tabular-nums">{testResult.latency} ms</span><span>{testResult.ok ? "Route succeeded" : testResult.error || "Route failed. Inspect provider status and retry."}</span>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{announcement}</span>

      {showJudgeSelect && <ModelSelectModal isOpen={showJudgeSelect} onClose={() => setShowJudgeSelect(false)} onSelect={(model) => { onSetStrategy({ judgeModel: model?.value || "" }); setShowJudgeSelect(false); }} activeProviders={activeProviders} title="Select judge model" addedModelValues={judge ? [judge] : []} closeOnSelect />}
      {showAddModel && <ModelSelectModal isOpen={showAddModel} onClose={() => setShowAddModel(false)} onSelect={(model) => { if (model?.value && !combo.models.includes(model.value)) onChangeModels([...combo.models, model.value]); }} activeProviders={activeProviders} title={`Add model to ${combo.name}`} addedModelValues={combo.models} includeCombos closeOnSelect={false} />}
    </article>
  );
}

function ActionButton({ icon, label, onClick, danger = false, disabled = false, spin = false }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-2 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "text-[var(--color-danger)] hover:bg-[var(--color-danger-wash)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"}`}><Icon name={icon} size={17} className={spin ? "animate-spin" : ""} /><span>{label}</span></button>;
}

function IconButton({ icon, label, onClick, disabled = false, danger = false }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={`flex size-11 items-center justify-center rounded-[var(--radius-sm)] disabled:cursor-not-allowed disabled:opacity-25 ${danger ? "text-[var(--color-danger)] hover:bg-[var(--color-danger-wash)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"}`}><Icon name={icon} size={17} /></button>;
}

function CapacityAdapterSection({ capacityAdapter, onChange, activeProviders, getCaps }) {
  return (
    <div className="divide-y divide-[var(--ledger-rule)]">
      {CAPACITY_ADAPTER_CAPS.map((cap) => (
        <CapacityAdapterCap key={cap.key} cap={cap} entry={capacityAdapter[cap.key] || EMPTY_CAP_ENTRY} onChange={(entry) => onChange({ ...capacityAdapter, [cap.key]: entry })} activeProviders={activeProviders} getCaps={getCaps} />
      ))}
    </div>
  );
}

function CapacityAdapterCap({ cap, entry, onChange, activeProviders, getCaps }) {
  const [showModelSelect, setShowModelSelect] = useState(false);
  const { enabled, roundRobin, models } = entry;
  const patch = (value) => onChange({ ...entry, ...value });
  const handleAdd = (model) => { if (model?.value && !models.includes(model.value)) patch({ models: [...models, model.value] }); };
  const handleRemove = (index) => { const next = models.filter((_, itemIndex) => itemIndex !== index); patch({ models: next.length === 0 ? [DEFAULT_FALLBACK_MODEL] : next }); };
  const handleMove = (index, delta) => { const target = index + delta; if (target < 0 || target >= models.length) return; const next = [...models]; [next[index], next[target]] = [next[target], next[index]]; patch({ models: next }); };

  return (
    <article className={enabled ? "" : "bg-[var(--color-surface-strong)]"}>
      <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(220px,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center border border-[var(--signal-row-rail)]"><Icon name={cap.icon} size={18} className="text-[var(--color-primary)]" /></span>
          <div className="min-w-0"><h3 className="font-semibold">{cap.label} pool</h3><p className="text-xs text-[var(--color-text-muted)]">{cap.desc}. Switches when the requested route lacks this capability.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-11 items-center gap-2 text-xs"><Toggle checked={enabled} onChange={(value) => patch({ enabled: value })} size="sm" /><span>{enabled ? "Enabled" : "Disabled"}</span></label>
          <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
            <button type="button" disabled={!enabled} onClick={() => patch({ roundRobin: false })} className={`min-h-9 px-3 text-xs ${!roundRobin ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]" : "text-[var(--color-text-muted)]"}`}>Fallback</button>
            <button type="button" disabled={!enabled} onClick={() => patch({ roundRobin: true })} className={`min-h-9 px-3 text-xs ${roundRobin ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]" : "text-[var(--color-text-muted)]"}`}>Round robin</button>
          </div>
        </div>
      </div>
      <div className="space-y-2 border-t border-[var(--ledger-rule)] bg-[var(--color-surface-strong)] p-3 sm:p-4">
        {models.map((model, index) => (
          <div key={`${model}-${index}`} className="grid min-h-14 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border border-[var(--ledger-rule)] bg-[var(--ledger-bg)] px-3 py-2">
            <span className="border-r border-[var(--route-line)] pr-3 text-center font-mono text-xs tabular-nums text-[var(--color-primary)]">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0"><code className="block break-all font-mono text-xs">{model}</code><div className="mt-1 flex items-center gap-2"><span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]"><Icon name={cap.icon} size={13} />{cap.desc}</span><CapacityBadges caps={getCaps?.(model)} /></div></div>
            <div className="flex items-center gap-1">
              <IconButton icon="arrow_upward" label={`Move ${model} up`} onClick={() => handleMove(index, -1)} disabled={!enabled || index === 0} />
              <IconButton icon="arrow_downward" label={`Move ${model} down`} onClick={() => handleMove(index, 1)} disabled={!enabled || index === models.length - 1} />
              <IconButton icon="close" label={`Remove ${model}`} onClick={() => handleRemove(index)} disabled={!enabled} danger />
            </div>
          </div>
        ))}
        <button type="button" disabled={!enabled} onClick={() => setShowModelSelect(true)} className="flex min-h-12 w-full items-center justify-center gap-2 border border-dashed border-[var(--color-primary-border)] font-medium text-[var(--color-primary)] disabled:cursor-not-allowed disabled:text-[var(--color-text-disabled)]"><Icon name="add" size={17} />Add fallback model</button>
      </div>
      {showModelSelect && <ModelSelectModal isOpen={showModelSelect} onClose={() => setShowModelSelect(false)} onSelect={handleAdd} activeProviders={activeProviders} title={`Add ${cap.label} model`} addedModelValues={models} capFilter={cap.key} includeCombos closeOnSelect={false} />}
    </article>
  );
}

function ModelItem({ id, index, model, isFirst, isLast, onEdit, onMoveUp, onMoveDown, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    // no transition — prevents the CSS settle animation fighting React's re-render on drop
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(model);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== model) onEdit(trimmed);
    else setDraft(model);
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setDraft(model); setEditing(false); }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 bg-black/[0.02] hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04] transition-colors ${isDragging ? "shadow-md ring-1 ring-primary/30" : ""}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab touch-none p-0.5 rounded text-text-muted hover:text-primary active:cursor-grabbing shrink-0"
        title="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="4" r="2"/><circle cx="15" cy="4" r="2"/>
          <circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/>
          <circle cx="9" cy="20" r="2"/><circle cx="15" cy="20" r="2"/>
        </svg>
      </button>

      {/* Index badge */}
      <span className="text-[10px] font-medium text-text-muted w-3 text-center shrink-0">{index + 1}</span>

      {/* Inline editable model value */}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 rounded border border-primary/40 bg-white px-1.5 py-0.5 font-mono text-xs text-text-main outline-none dark:bg-black/20"
        />
      ) : (
        <div
          className="min-w-0 flex-1 cursor-text truncate rounded px-1.5 py-0.5 font-mono text-xs text-text-main hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {model}
        </div>
      )}

      {/* Priority arrows */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`p-0.5 rounded ${isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Move up"
        >
          <Icon name="arrow_upward" className="text-[12px]" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`p-0.5 rounded ${isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Move down"
        >
          <Icon name="arrow_downward" className="text-[12px]" />
        </button>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="p-0.5 hover:bg-red-500/10 rounded text-text-muted hover:text-red-500 transition-all"
        title="Remove"
      >
        <Icon name="close" className="text-[12px]" />
      </button>
    </div>
  );
}

function ComboFormModal({ isOpen, combo, onClose, onSave, activeProviders, kindFilter = null }) {
  // Initialize state with combo values - key prop on parent handles reset on remount
  const [name, setName] = useState(combo?.name || "");
  const [models, setModels] = useState(combo?.models || []);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [modelAliases, setModelAliases] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Use stable index-based IDs so duplicates and similar names are handled correctly
  const modelItems = models.map((model, i) => ({ uid: `item-${i}`, model }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = modelItems.findIndex((m) => m.uid === active.id);
      const newIndex = modelItems.findIndex((m) => m.uid === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setModels((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  };

  const fetchModalData = async () => {
    try {
      const aliasesRes = await fetch("/api/models/alias");
      if (!aliasesRes.ok) return;
      const aliasesData = await aliasesRes.json();
      setModelAliases(aliasesData.aliases || {});
    } catch (error) {
      console.error("Error fetching modal data:", error);
    }
  };

  useEffect(() => {
    if (isOpen) fetchModalData();
  }, [isOpen]);

  const validateName = (value) => {
    if (!value.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!VALID_NAME_REGEX.test(value)) {
      setNameError("Only letters, numbers, -, _ and . allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    setName(value);
    if (value) validateName(value);
    else setNameError("");
  };

  const handleAddModel = (model) => {
    if (!models.includes(model.value)) {
      setModels([...models, model.value]);
    }
  };

  const handleDeselectModel = (model) => {
    setModels(models.filter((m) => m !== model.value));
  };

  const handleRemoveModel = (index) => {
    setModels(models.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newModels = [...models];
    [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
    setModels(newModels);
  };

  const handleMoveDown = (index) => {
    if (index === models.length - 1) return;
    const newModels = [...models];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
    setModels(newModels);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave({ name: name.trim(), models });
    setSaving(false);
  };

  const isEdit = !!combo;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? "Edit Combo" : "Create Combo"}
      >
        <div className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <Input
              label="Combo Name"
              value={name}
              onChange={handleNameChange}
              placeholder="my-combo"
              error={nameError}
            />
            <p className="text-[10px] text-text-muted mt-0.5">
              Only letters, numbers, -, _ and . allowed
            </p>
          </div>

          {/* Models */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Models</label>

            {models.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-black/10 dark:border-white/10 rounded-lg bg-black/[0.01] dark:bg-white/[0.01]">
                <Icon name="layers" className="text-text-muted text-xl mb-1" />
                <p className="text-xs text-text-muted">No models added yet</p>
              </div>
            ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
              <SortableContext items={modelItems.map((m) => m.uid)} strategy={verticalListSortingStrategy}>
                <div className="flex max-h-[55vh] min-w-0 flex-col gap-1 overflow-y-auto sm:max-h-[350px]">
                  {modelItems.map(({ uid, model }, index) => (
                    <ModelItem
                      key={uid}
                      id={uid}
                      index={index}
                      model={model}
                      isFirst={index === 0}
                      isLast={index === modelItems.length - 1}
                      onEdit={(newVal) => {
                        const updated = [...models];
                        updated[index] = newVal;
                        setModels(updated);
                      }}
                      onMoveUp={() => handleMoveUp(index)}
                      onMoveDown={() => handleMoveDown(index)}
                      onRemove={() => handleRemoveModel(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            )}

            {/* Add Model button */}
            <button
              onClick={() => setShowModelSelect(true)}
              className="w-full mt-2 py-2 border border-dashed border-black/10 dark:border-white/10 rounded-lg text-xs text-primary font-medium hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1"
            >
              <Icon name="add" className="text-[16px]" />
              Add Model
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button onClick={onClose} variant="ghost" fullWidth size="sm">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              fullWidth
              size="sm"
              disabled={!name.trim() || !!nameError || saving}
            >
              {saving ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Model Select Modal */}
      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAddModel}
          onDeselect={handleDeselectModel}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title="Add Model to Combo"
          kindFilter={kindFilter}
          addedModelValues={models}
          closeOnSelect={false}
        />
      )}
    </>
  );
}
