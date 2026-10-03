"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@/shared/components";
import Icon from "@/shared/components/Icon";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [authMode, setAuthMode] = useState("password");
  const [ssoType, setSsoType] = useState("oidc");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [samlConfigured, setSamlConfigured] = useState(false);
  const [samlLoginLabel, setSamlLoginLabel] = useState("Sign in with SAML SSO");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const errorRef = useRef(null);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/api/auth/status", { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated === true || data.requireLogin === false) {
            window.location.assign("/dashboard");
            return;
          }
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setSsoType(data.ssoType || "oidc");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
          setSamlConfigured(data.samlConfigured === true);
          setSamlLoginLabel(data.samlLoginLabel || "Sign in with SAML SSO");
        } else setHasPassword(true);
      } catch {
        setHasPassword(true);
      } finally {
        clearTimeout(timeoutId);
      }
    }
    checkAuth();
  }, []);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const handleLogin = async (event) => {
    event.preventDefault(); setLoading(true); setError(""); setResetHint("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (response.ok) {
        const data = await response.json();
        if (data.mustChangePassword) { setMustChange(true); return; }
        window.location.assign("/dashboard");
      } else {
        const data = await response.json();
        setError(data.error || "Invalid password");
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch { setError("Network error — try again."); }
    finally { setLoading(false); }
  };

  const handleSetNewPassword = async (event) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: password, newPassword }) });
      if (response.ok) window.location.assign("/dashboard");
      else { const data = await response.json(); setError(data.error || "Failed to set password"); }
    } catch { setError("Network error — try again."); }
    finally { setLoading(false); }
  };

  const isSsoEnabled = ["sso", "oidc", "saml", "both"].includes(authMode);
  const activeSsoType = ssoType || (authMode === "saml" ? "saml" : "oidc");
  const samlAvailable = isSsoEnabled && activeSsoType === "saml" && samlConfigured;
  const oidcAvailable = isSsoEnabled && activeSsoType === "oidc" && oidcConfigured;
  const ssoAvailable = samlAvailable || oidcAvailable;
  const passwordAvailable = authMode === "password" || authMode === "both" || !ssoAvailable;

  const networkError = error === "Network error — try again.";
  const accessState = hasPassword === null
    ? { shape: "hollow", label: "Checking access", tone: "neutral" }
    : error
      ? { shape: "square", label: networkError ? "Connection error" : "Access denied", tone: "danger" }
      : mustChange
        ? { shape: "square", label: "Password change required", tone: "warning" }
        : retryAfter > 0
          ? { shape: "diamond", label: `Locked · ${retryAfter}s`, tone: "warning" }
          : isSsoEnabled && !ssoAvailable
            ? { shape: "diamond", label: "Fallback available", tone: "warning" }
            : { shape: "circle", label: "Access ready", tone: "success" };

  const toneClasses = {
    neutral: "text-[var(--color-text-muted)]",
    success: "text-[var(--color-success)]",
    warning: "text-[var(--color-warning)]",
    danger: "text-[var(--color-danger)]",
  };

  const stateMarker = (
    <span
      aria-hidden="true"
      className={
        accessState.shape === "diamond"
          ? "size-2.5 rotate-45 border border-current bg-current"
          : accessState.shape === "square"
            ? "size-2.5 border border-current bg-current"
            : accessState.shape === "hollow"
              ? "size-2.5 rounded-full border border-current"
              : "size-2.5 rounded-full border border-current bg-current"
      }
    />
  );

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-canvas)] p-4 md:p-8">
      <section className="ledger-band w-full max-w-[52rem]" aria-labelledby="login-title">
        <header className="ledger-caption flex min-h-12 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="ledger-number">A0</span>
            <img src="/krouter9.png" alt="" className="size-8 shrink-0 object-contain" />
            <span className="font-medium">KRouter9</span>
          </div>
          <span className="data-text text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Access control</span>
        </header>

        <div className="grid gap-4 border-b border-[var(--ledger-rule)] px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7">
          <div className="flex min-w-0 items-start gap-3">
            <Icon name="shield" className="mt-0.5 shrink-0 text-[20px] text-[var(--color-primary)]" />
            <div>
              <h1 id="login-title" className="font-semibold">Secure access</h1>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Authenticate to open the local control surface.</p>
            </div>
          </div>
          <div className={`data-text flex items-center gap-2 text-sm ${toneClasses[accessState.tone]}`}>
            {stateMarker}
            <span>{accessState.label}</span>
          </div>
        </div>

        <div className="grid md:grid-cols-[minmax(0,28rem)_minmax(12rem,1fr)]">
          <div className="min-w-0 p-5 sm:p-7">
            {hasPassword === null ? (
              <div className="flex min-h-36 items-center gap-3 border-y border-[var(--ledger-rule)] py-4 text-sm text-[var(--color-text-muted)]">
                <span className="size-3 rounded-full border border-current" aria-hidden="true" />
                <span>Checking access…</span>
              </div>
            ) : (
              <>
                {error ? (
                  <div id="login-error" ref={errorRef} tabIndex={-1} role="alert" className="mb-4 flex gap-3 border-y border-[var(--color-danger)] bg-[var(--color-danger-wash)] px-3 py-3 text-sm text-[var(--color-danger)]">
                    <Icon name="error" className="shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}

                {mustChange ? (
                  <form onSubmit={handleSetNewPassword} className="space-y-4">
                    <div>
                      <h2 className="font-semibold">Set a new password</h2>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Choose a replacement before accessing the dashboard remotely.</p>
                    </div>
                    <Input label="New password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required autoFocus hint="Use a password appropriate for access to this gateway." />
                    <div className="flex sm:justify-end">
                      <Button type="submit" fullWidth loading={loading} disabled={!newPassword}>Set password</Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {samlAvailable ? <Button type="button" fullWidth onClick={() => { window.location.href = "/api/auth/saml/start"; }}>{samlLoginLabel}</Button> : null}
                      {oidcAvailable ? <Button type="button" fullWidth onClick={() => { window.location.href = "/api/auth/oidc/start"; }}>{oidcLoginLabel}</Button> : null}
                    </div>
                    {ssoAvailable && passwordAvailable ? <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]"><span className="h-px flex-1 bg-[var(--ledger-rule)]"/><span>or use password</span><span className="h-px flex-1 bg-[var(--ledger-rule)]"/></div> : null}
                    {passwordAvailable ? (
                      <form onSubmit={handleLogin} className="space-y-4">
                        {isSsoEnabled && !ssoAvailable ? (
                          <div className="flex gap-3 border-y border-[var(--color-warning)] bg-[var(--color-warning-wash)] px-3 py-3 text-sm text-[var(--color-warning)]">
                            <Icon name="warning" className="shrink-0" />
                            <span>{activeSsoType === "saml" ? "SAML SSO" : "OIDC"} configuration is incomplete. Password recovery remains available.</span>
                          </div>
                        ) : null}
                        <Input label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus={!ssoAvailable} aria-describedby={error ? "login-error" : undefined} inputClassName="pr-12" button={<button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-0 grid min-h-[var(--touch-min)] w-11 place-items-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Icon name={showPassword ? "visibility_off" : "visibility"}/></button>} />
                        {retryAfter > 0 ? <p className="data-text text-sm text-[var(--color-warning)]" aria-live="off">Locked · retry in {retryAfter}s</p> : null}
                        {resetHint ? <p className="border-y border-[var(--ledger-rule)] py-3 text-sm text-[var(--color-text-muted)]">Open the local KRouter9 CLI, then use Settings → Reset password.</p> : null}
                        <div className="flex sm:justify-end">
                          <Button type="submit" fullWidth loading={loading} disabled={retryAfter > 0}>{retryAfter > 0 ? "Locked" : "Login"}</Button>
                        </div>
                        {hasPassword === false ? (
                          <div className="flex gap-3 border-y border-[var(--color-danger)] bg-[var(--color-danger-wash)] px-3 py-3 text-sm font-medium text-[var(--color-danger)]">
                            <Icon name="error" className="shrink-0" />
                            <span>Default password in use — set a real password in Settings before exposing this dashboard.</span>
                          </div>
                        ) : null}
                      </form>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="border-t border-[var(--ledger-rule)] bg-[var(--color-surface-strong)] p-5 md:border-l md:border-t-0 md:p-6">
            <p className="ledger-caption text-xs">Access instruction</p>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">Authenticate to open the local control surface.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
