"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Input, Select, Toggle } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { AI_PROVIDERS, AUTH_METHODS, OAUTH_PROVIDERS, WEB_COOKIE_PROVIDERS } from "@/shared/constants/config";

const providerOptions = Object.values(AI_PROVIDERS).map((p) => ({
  value: p.id,
  label: p.name,
}));

const ALL_AUTH_METHOD_IDS = Object.values(AUTH_METHODS).map((m) => m.id);
const AUTH_METHOD_ICONS = {
  [AUTH_METHODS.apikey.id]: "key",
  [AUTH_METHODS.oauth.id]: "lock",
  [AUTH_METHODS.cookie.id]: "cookie",
};

// Which auth methods a provider supports, derived from the registry category.
// No provider selected: every method is offered.
function getAuthMethodIds(providerId) {
  if (!providerId) return ALL_AUTH_METHOD_IDS;
  if (WEB_COOKIE_PROVIDERS?.[providerId]) return [AUTH_METHODS.cookie.id];
  if (OAUTH_PROVIDERS?.[providerId]) {
    const supportsApiKey = AI_PROVIDERS[providerId]?.authModes?.includes(AUTH_METHODS.apikey.id);
    return supportsApiKey ? [AUTH_METHODS.oauth.id, AUTH_METHODS.apikey.id] : [AUTH_METHODS.oauth.id];
  }
  return [AUTH_METHODS.apikey.id];
}

export default function NewProviderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    provider: "",
    authMethod: AUTH_METHODS.apikey.id,
    apiKey: "",
    displayName: "",
    isActive: true,
  });
  const [errors, setErrors] = useState({});

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // Keep the auth method valid for the chosen provider.
      if (field === "provider") {
        const allowed = getAuthMethodIds(value);
        if (!allowed.includes(next.authMethod)) next.authMethod = allowed[0];
      }
      return next;
    });
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const selectedProvider = AI_PROVIDERS[formData.provider];
  const authMethodIds = getAuthMethodIds(formData.provider);
  const isCookie = formData.authMethod === AUTH_METHODS.cookie.id;
  const isOAuth = formData.authMethod === AUTH_METHODS.oauth.id;

  const validate = () => {
    const newErrors = {};
    if (!formData.provider) newErrors.provider = "Please select a provider";
    if (formData.authMethod === AUTH_METHODS.oauth.id) {
      newErrors.submit = "OAuth accounts are connected from the provider page.";
    } else if (!formData.apiKey) {
      newErrors.apiKey = isCookie ? "Cookie value is required" : "API Key is required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The POST route reads provider, apiKey (also the cookie value),
        // displayName and isActive; the auth method is UI-only.
        body: JSON.stringify({
          provider: formData.provider,
          apiKey: formData.apiKey,
          displayName: formData.displayName,
          isActive: formData.isActive,
        }),
      });

      if (response.ok) {
        router.push("/dashboard/providers");
      } else {
        const data = await response.json();
        setErrors({ submit: data.error || "Failed to create provider" });
      }
    } catch {
      setErrors({ submit: "An error occurred. Please try again." });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/providers"
          className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-text-muted hover:text-primary transition-colors"
        >
          <Icon name="arrow_back" size={18} />
          Back to Providers
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Add New Provider</h1>
        <p className="text-text-muted mt-2">
          Configure a new AI provider to use with your applications.
        </p>
      </div>

      {/* Form */}
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Provider Selection */}
          <Select
            label="Provider"
            options={providerOptions}
            value={formData.provider}
            onChange={(e) => handleChange("provider", e.target.value)}
            placeholder="Select a provider"
            aria-label="Provider"
            error={errors.provider}
            required
          />

          {/* Provider Info */}
          {selectedProvider && (
            <Card.Section className="flex items-center gap-3">
              <div
                className="size-10 rounded-lg flex items-center justify-center bg-bg border border-border"
              >
                <Icon name={selectedProvider.icon} size={20} style={{ color: selectedProvider.color }} />
              </div>
              <div>
                <p className="font-medium">{selectedProvider.name}</p>
                <p className="text-sm text-text-muted">
                  Selected provider
                </p>
              </div>
            </Card.Section>
          )}

          {/* Auth Method */}
          <div className="flex flex-col gap-3">
            <p id="auth-method-label" className="text-sm font-medium">
              Authentication Method <span className="text-[var(--color-danger)]" aria-hidden="true">*</span>
            </p>
            <div role="group" aria-labelledby="auth-method-label" className="flex flex-col gap-3 sm:flex-row">
              {authMethodIds.map((id) => {
                const method = AUTH_METHODS[id];
                const selected = formData.authMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleChange("authMethod", id)}
                    className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border p-4 transition-all ${
                      selected
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <Icon name={AUTH_METHOD_ICONS[id] || "lock"} aria-hidden="true" />
                    <span className="font-medium">{method.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* API Key / Cookie Input */}
          {!isOAuth && (
            <Input
              label={isCookie ? "Cookie value" : "API Key"}
              type="password"
              placeholder={isCookie ? "Paste the session cookie" : "Enter your API key"}
              value={formData.apiKey}
              onChange={(e) => handleChange("apiKey", e.target.value)}
              error={errors.apiKey}
              hint={isCookie ? "The cookie is encrypted and stored securely." : "Your API key will be encrypted and stored securely."}
              autoComplete="off"
              required
            />
          )}

          {/* OAuth */}
          {isOAuth && (
            <div data-testid="oauth-section" className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <p className="text-sm text-text-muted">
                OAuth accounts are connected from the provider page, which opens the sign-in flow.
              </p>
              {selectedProvider ? (
                <Link
                  href={`/dashboard/providers/${selectedProvider.id}`}
                  className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-border px-4 text-sm font-medium hover:border-primary/50"
                >
                  <Icon name="link" size={18} aria-hidden="true" />
                  Connect {selectedProvider.name} with OAuth
                </Link>
              ) : (
                <p className="text-sm text-text-muted">Select a provider first.</p>
              )}
            </div>
          )}

          {/* Display Name */}
          <Input
            label="Display Name"
            placeholder="e.g., Production API, Dev Environment"
            value={formData.displayName}
            onChange={(e) => handleChange("displayName", e.target.value)}
            hint="Optional. A friendly name to identify this configuration."
          />

          {/* Active Toggle */}
          <Toggle
            checked={formData.isActive}
            onChange={(checked) => handleChange("isActive", checked)}
            label="Active"
            description="Enable this provider for use in your applications"
          />

          {/* Error Message */}
          {errors.submit && (
            <div role="alert" className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {errors.submit}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Link href="/dashboard/providers" className="flex-1">
              <Button type="button" variant="ghost" fullWidth>
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={loading} disabled={isOAuth} fullWidth className="flex-1">
              Create Provider
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

