"use client";

import Icon from "@/shared/components/Icon";
import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Input, Select, Toggle } from "@/shared/components";
import { ConfirmDialog, Dialog } from "@/shared/components/overlays";

const POLICY_OPTIONS = [
  { value: "off", label: "Off — all models allowed" },
  { value: "whitelist", label: "Whitelist — only listed models" },
  { value: "blacklist", label: "Blacklist — block listed models" },
];

function asText(v) {
  if (!v) return "";
  if (Array.isArray(v)) return v.join(", ");
  try {
    const j = JSON.parse(v);
    if (Array.isArray(j)) return j.join(", ");
  } catch { /* plain string */ }
  return String(v);
}

function parseList(text) {
  if (Array.isArray(text)) return text.map((s) => String(s).trim()).filter(Boolean);
  return String(text || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

// Manage one API key: rename, RPM/TPM limits, model allow/deny, rotate.
// Parent remounts per key via key={apiKey.id}, so useState initializers are enough.
export default function ManageKeyModal({ apiKey, onClose, onSaved, onRotated }) {
  const [name, setName] = useState(apiKey?.name || "");
  const [isActive, setIsActive] = useState(apiKey?.isActive ?? true);
  const [rpmLimit, setRpmLimit] = useState(apiKey?.rpmLimit ? String(apiKey.rpmLimit) : "");
  const [tpmLimit, setTpmLimit] = useState(apiKey?.tpmLimit ? String(apiKey.tpmLimit) : "");
  const [modelPolicy, setModelPolicy] = useState(apiKey?.modelPolicy || "off");
  const [allowedList, setAllowedList] = useState(parseList(asText(apiKey?.allowedModels)));
  const [blockedList, setBlockedList] = useState(parseList(asText(apiKey?.blockedModels)));
  const [manualEntry, setManualEntry] = useState("");
  const [pickerFor, setPickerFor] = useState(null); // "allowed" | "blocked" | null
  const [pickerProviders, setPickerProviders] = useState([]);
  const [pickerAliases, setPickerAliases] = useState({});
  const [creditLimit, setCreditLimit] = useState(apiKey?.creditLimit ? String(apiKey.creditLimit) : "");
  const [quotaLimit, setQuotaLimit] = useState(apiKey?.quotaLimit ? String(apiKey.quotaLimit) : "");
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const initial = {
    name: apiKey?.name || "", isActive: apiKey?.isActive ?? true,
    rpmLimit: apiKey?.rpmLimit ? String(apiKey.rpmLimit) : "", tpmLimit: apiKey?.tpmLimit ? String(apiKey.tpmLimit) : "",
    modelPolicy: apiKey?.modelPolicy || "off", allowedList: parseList(asText(apiKey?.allowedModels)), blockedList: parseList(asText(apiKey?.blockedModels)),
    creditLimit: apiKey?.creditLimit ? String(apiKey.creditLimit) : "", quotaLimit: apiKey?.quotaLimit ? String(apiKey.quotaLimit) : "",
  };
  const dirty = name !== initial.name || isActive !== initial.isActive || rpmLimit !== initial.rpmLimit || tpmLimit !== initial.tpmLimit || modelPolicy !== initial.modelPolicy || creditLimit !== initial.creditLimit || quotaLimit !== initial.quotaLimit || JSON.stringify(allowedList) !== JSON.stringify(initial.allowedList) || JSON.stringify(blockedList) !== JSON.stringify(initial.blockedList);
  const requestClose = () => dirty ? setDiscardOpen(true) : onClose();

  const openPicker = async (which) => {
    setPickerFor(which);
    try {
      const [providersRes, aliasesRes] = await Promise.all([
        fetch("/api/providers?mode=full"),
        fetch("/api/models/alias"),
      ]);
      if (providersRes.ok) {
        const data = await providersRes.json();
        setPickerProviders(data.connections || []);
      }
      if (aliasesRes.ok) {
        const data = await aliasesRes.json();
        setPickerAliases(data.aliases || {});
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const togglePickerModel = (model, remove) => {
    const value = model?.value || model?.name || model;
    // Placeholders ("prefix/model-id") are type-in hints, not real models.
    if (!value || model?.isPlaceholder) return;
    const setList = pickerFor === "blocked" ? setBlockedList : setAllowedList;
    setList((prev) => remove ? prev.filter((v) => v !== value) : (prev.includes(value) ? prev : [...prev, value]));
  };

  const addManualEntry = (which) => {
    const values = parseList(manualEntry);
    if (values.length === 0) return;
    const setList = which === "blocked" ? setBlockedList : setAllowedList;
    setList((prev) => [...prev, ...values.filter((v) => !prev.includes(v))]);
    setManualEntry("");
  };

  const renderModelListEditor = (which, list, setList) => (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">
          {which === "blocked" ? "Blocked models" : "Allowed models"}
          <span className="ml-1 text-xs font-normal text-text-muted">({list.length})</span>
        </p>
        <Button variant="secondary" onClick={() => openPicker(which)}>
          Pick from catalog
        </Button>
      </div>
      {list.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {list.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setList((prev) => prev.filter((v) => v !== value))}
              title="Click to remove"
              className="rounded-xl border border-primary bg-primary px-2 py-1 text-xs font-medium text-white transition-all hover:bg-primary-hover"
            >
              <span className="flex items-center gap-1">
                <Icon name="check" size={10} className="leading-none" />
                {value}
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={manualEntry}
          onChange={(e) => setManualEntry(e.target.value)}
          placeholder="provider/model-id — type, then Add"
          hint={which === "blocked" ? "These models are rejected with 403." : "Empty = allow all. Matches trailing segment too."}
        />
        <Button variant="secondary" onClick={() => addManualEntry(which)} disabled={!manualEntry.trim()}>
          Add
        </Button>
      </div>
    </div>
  );

  const handleSave = async () => {
    if (!apiKey || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/keys/${apiKey.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          isActive,
          rpmLimit: rpmLimit === "" ? 0 : Number(rpmLimit),
          tpmLimit: tpmLimit === "" ? 0 : Number(tpmLimit),
          modelPolicy,
          allowedModels: modelPolicy === "whitelist" ? allowedList : null,
          blockedModels: modelPolicy === "blacklist" ? blockedList : null,
          creditLimit: creditLimit === "" ? 0 : Number(creditLimit),
          quotaLimit: quotaLimit === "" ? 0 : Number(quotaLimit),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      onSaved(data.key);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Rotate returns the raw string ONCE plus sanitized metadata (rotatedMeta);
  // the parent merges the sanitized shape into the list and shows the raw
  // one-time string in its own dismiss-to-clear modal.
  const handleRotate = async () => {
    if (!apiKey) return;
    setRotating(true);
    setError(null);
    try {
      const res = await fetch(`/api/keys/${apiKey.id}/rotate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to rotate");
        return;
      }
      onRotated(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setRotating(false);
    }
  };

  const pickerList = pickerFor === "blocked" ? blockedList : allowedList;
  const catalogModels = pickerProviders.flatMap((provider) => {
    const prefix = provider.provider || provider.name || "provider";
    const models = provider.models || provider.availableModels || [];
    return models.map((model) => typeof model === "string" ? `${prefix}/${model}` : model.value || model.name).filter(Boolean);
  });

  return (
    <>
      <Dialog open={!!apiKey} title={apiKey ? `Manage key “${apiKey.name}”` : "Manage key"} description="Configuration only. Usage analytics remain on the Usage page." onDismiss={requestClose} width="wide" dismissOnScrim={true} footer={pickerFor ? <div className="flex w-full justify-between"><Button variant="secondary" onClick={() => setPickerFor(null)}>Back to key</Button><span className="self-center text-xs text-text-muted">{pickerList.length} selected</span></div> : <div className="flex w-full flex-wrap justify-between gap-2"><Button onClick={handleRotate} variant="secondary" disabled={rotating}>{rotating ? "Rotating..." : "Rotate key"}</Button><div className="flex gap-2"><Button onClick={requestClose} variant="ghost">Cancel</Button><Button onClick={handleSave} disabled={!name.trim() || saving}>{saving ? "Saving..." : "Save changes"}</Button></div></div>}>
        {pickerFor ? (
          <div className="space-y-4">
            <div><h3 className="font-semibold">{pickerFor === "blocked" ? "Block models for this key" : "Allow models for this key"}</h3><p className="mt-1 text-sm text-text-muted">The picker replaces this dialog body so your draft stays in one shell.</p></div>
            <div className="flex gap-2"><Input value={manualEntry} onChange={(event) => setManualEntry(event.target.value)} placeholder="provider/model-id" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualEntry(pickerFor); } }} /><Button variant="secondary" onClick={() => addManualEntry(pickerFor)} disabled={!manualEntry.trim()}>Add</Button></div>
            <div className="max-h-[22rem] overflow-y-auto rounded-[var(--radius-field)] border border-border">
              {[...new Set([...catalogModels, ...pickerList])].length ? [...new Set([...catalogModels, ...pickerList])].map((model) => <label key={model} className="flex min-h-11 items-center gap-3 border-b border-border px-3 last:border-b-0 hover:bg-surface-hover"><input type="checkbox" checked={pickerList.includes(model)} onChange={(event) => togglePickerModel(model, !event.target.checked)} /><code className="break-anywhere font-[var(--font-data)] text-xs">{model}</code></label>) : <p className="p-6 text-center text-sm text-text-muted">No catalog models reported. Add a model ID manually.</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <Input label="Key name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Production Key" />
            <div className="flex items-center justify-between gap-4 border-y border-border py-3"><div><p className="text-sm font-medium">Active</p><p className="text-xs text-text-muted">Paused keys are rejected immediately.</p></div><Toggle checked={isActive} onChange={setIsActive} size="sm" /></div>
            <div><h3 className="mb-3 font-semibold">Rate limits</h3><div className="grid gap-3 sm:grid-cols-2"><Input label="RPM limit" type="number" min="0" value={rpmLimit} onChange={(event) => setRpmLimit(event.target.value)} placeholder="0 = unlimited" hint="Requests per minute."/><Input label="TPM limit" type="number" min="0" value={tpmLimit} onChange={(event) => setTpmLimit(event.target.value)} placeholder="0 = unlimited" hint="Tokens per minute (estimated)."/></div></div>
            <div><h3 className="mb-3 font-semibold">Lifetime limits</h3><div className="grid gap-3 sm:grid-cols-2"><Input label="Credit limit" type="number" min="0" step="0.000001" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} placeholder="0 = unlimited" hint="Maximum cost in USD."/><Input label="Token quota" type="number" min="0" value={quotaLimit} onChange={(event) => setQuotaLimit(event.target.value)} placeholder="0 = unlimited" hint="Maximum lifetime tokens."/></div></div>
            <div><h3 className="mb-3 font-semibold">Model policy</h3><Select label="Policy" options={POLICY_OPTIONS} value={modelPolicy} onChange={(event) => setModelPolicy(event.target.value)} />{modelPolicy === "whitelist" && renderModelListEditor("allowed", allowedList, setAllowedList)}{modelPolicy === "blacklist" && renderModelListEditor("blocked", blockedList, setBlockedList)}</div>
            {error && <p className="rounded-[var(--radius-control)] bg-danger-wash p-3 text-sm text-danger" role="alert">{error}</p>}
            <p className="border-t border-border pt-3 text-xs text-text-muted">Rotate issues a fresh key string. The old string stops working immediately.</p>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={discardOpen} onCancel={() => setDiscardOpen(false)} onConfirm={onClose} title="Discard unsaved key changes?" description="Your edits will be lost." actionLabel="Discard changes" cancelLabel="Keep editing" destructive />
    </>
  );
}

ManageKeyModal.propTypes = {
  apiKey: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    isActive: PropTypes.bool,
    rpmLimit: PropTypes.number,
    tpmLimit: PropTypes.number,
    modelPolicy: PropTypes.string,
    allowedModels: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
    blockedModels: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
    creditLimit: PropTypes.number,
    quotaLimit: PropTypes.number,
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  onRotated: PropTypes.func.isRequired,
};
