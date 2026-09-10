"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Input, Modal, Select, Toggle } from "@/shared/components";

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
  const [allowedModels, setAllowedModels] = useState(asText(apiKey?.allowedModels));
  const [blockedModels, setBlockedModels] = useState(asText(apiKey?.blockedModels));
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState(null);

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
          allowedModels: modelPolicy === "whitelist" ? parseList(allowedModels) : null,
          blockedModels: modelPolicy === "blacklist" ? parseList(blockedModels) : null,
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
        <Select
          label="Model policy"
          options={POLICY_OPTIONS}
          value={modelPolicy}
          onChange={(e) => setModelPolicy(e.target.value)}
        />
        {modelPolicy === "whitelist" && (
          <Input
            label="Allowed models"
            value={allowedModels}
            onChange={(e) => setAllowedModels(e.target.value)}
            placeholder="oc/model-a, provider/model-b"
            hint="Comma separated. Empty = allow all. Matches trailing segment too."
          />
        )}
        {modelPolicy === "blacklist" && (
          <Input
            label="Blocked models"
            value={blockedModels}
            onChange={(e) => setBlockedModels(e.target.value)}
            placeholder="bad/model, provider/other"
            hint="Comma separated. These models are rejected with 403."
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
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
  onRotated: PropTypes.func.isRequired,
};
