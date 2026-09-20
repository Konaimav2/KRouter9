"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Input, Modal, ModelSelectModal, Select, Toggle } from "@/shared/components";

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
                <span className="material-symbols-outlined leading-none" style={{ fontSize: "10px" }}>check</span>
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
      onRotated(data.key);
    } catch (e) {
      setError(e.message);
    } finally {
      setRotating(false);
    }
  };

  return (
    <Modal isOpen={!!apiKey} title={apiKey ? `Manage key "${apiKey.name}"` : "Manage key"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="Key name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production Key"
        />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Active</p>
            <p className="text-xs text-text-muted">Paused keys are rejected immediately.</p>
          </div>
          <Toggle checked={isActive} onChange={setIsActive} size="sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="RPM limit"
            type="number"
            min="0"
            value={rpmLimit}
            onChange={(e) => setRpmLimit(e.target.value)}
            placeholder="0 = unlimited"
            hint="Requests per minute."
          />
          <Input
            label="TPM limit"
            type="number"
            min="0"
            value={tpmLimit}
            onChange={(e) => setTpmLimit(e.target.value)}
            placeholder="0 = unlimited"
            hint="Tokens per minute (est.)."
          />
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3 text-sm">
          <p className="mb-1 font-medium text-text-primary">Usage</p>
          <p className="text-text-muted">
            Cost spent: <span className="text-text-primary">${(Number(apiKey?.usageCost) || 0).toFixed(6)}</span>
            {" · "}
            Tokens used: <span className="text-text-primary">{(Number(apiKey?.usageTokens) || 0).toLocaleString()}</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Credit limit"
            type="number"
            min="0"
            step="0.000001"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder="0 = unlimited"
            hint="Max cost (USD). Requests rejected once spent."
          />
          <Input
            label="Token quota"
            type="number"
            min="0"
            value={quotaLimit}
            onChange={(e) => setQuotaLimit(e.target.value)}
            placeholder="0 = unlimited"
            hint="Max lifetime tokens. Requests rejected once used."
          />
        </div>
        <Select
          label="Model policy"
          options={POLICY_OPTIONS}
          value={modelPolicy}
          onChange={(e) => setModelPolicy(e.target.value)}
        />
        {modelPolicy === "whitelist" && renderModelListEditor("allowed", allowedList, setAllowedList)}
        {modelPolicy === "blacklist" && renderModelListEditor("blocked", blockedList, setBlockedList)}
        {pickerFor && (
          <ModelSelectModal
            isOpen={!!pickerFor}
            onClose={() => setPickerFor(null)}
            onSelect={(m) => togglePickerModel(m, false)}
            onDeselect={(m) => togglePickerModel(m, true)}
            activeProviders={pickerProviders}
            modelAliases={pickerAliases}
            title={pickerFor === "blocked" ? "Block models for this key" : "Allow models for this key"}
            addedModelValues={pickerFor === "blocked" ? blockedList : allowedList}
            closeOnSelect={false}
          />
        )}
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={handleSave} fullWidth disabled={!name.trim() || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            Cancel
          </Button>
        </div>
        <div className="border-t border-border pt-3">
          <p className="text-xs text-text-muted mb-2">
            Rotate issues a fresh key string. The old string stops working immediately.
          </p>
          <Button onClick={handleRotate} variant="secondary" fullWidth disabled={rotating}>
            {rotating ? "Rotating..." : "Rotate key"}
          </Button>
        </div>
      </div>
    </Modal>
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
    usageCost: PropTypes.number,
    usageTokens: PropTypes.number,
    quotaLimit: PropTypes.number,
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  onRotated: PropTypes.func.isRequired,
};
