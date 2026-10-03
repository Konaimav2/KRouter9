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

  if (hasPassword === null) return <main className="grid min-h-screen place-items-center bg-[var(--color-canvas)]"><div className="flex items-center gap-3 text-[var(--color-text-muted)]"><Icon name="progress_activity" className="animate-spin" /><span>Checking access…</span></div></main>;

  return (
    <main className="grid min-h-screen bg-[var(--color-canvas)] md:grid-cols-[42%_58%]">
      <section className="relative flex min-h-24 items-center overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-rail)] px-6 text-[var(--color-rail-text)] md:min-h-screen md:border-b-0 md:border-r md:px-12">
        <div className="relative z-10 max-w-sm">
          <div className="flex items-center gap-3"><img src="/krouter9.png" alt="" className="size-10 object-contain" /><h1 className="text-2xl font-bold tracking-[-.02em]">KRouter9</h1></div>
          <p className="mt-2 text-sm text-[var(--color-rail-muted)]">AI gateway control</p>
          <div className="mt-12 hidden items-center md:flex" aria-hidden="true"><span className="size-3 rounded-full border border-[var(--color-primary)]"/><span className="h-px flex-1 bg-[var(--color-border-strong)]"/><span className="size-3 rotate-45 border border-[var(--color-warning)]"/><span className="h-px flex-1 bg-[var(--color-border-strong)]"/><span className="size-3 bg-[var(--color-primary)]"/></div>
        </div>
      </section>
      <section className="flex min-h-[calc(100vh-6rem)] items-center justify-center p-4 sm:p-8">
        <div className="ledger-band w-full max-w-[440px]">
          <header className="ledger-caption"><Icon name="shield" className="text-[var(--color-primary)]"/><div><h2 className="font-semibold">Secure access</h2><p className="text-xs text-[var(--color-text-muted)]">Authenticate to open the local control surface.</p></div></header>
          <div className="p-5 sm:p-7">
            {error ? <div ref={errorRef} tabIndex={-1} role="alert" className="mb-4 flex gap-2 border border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-3 text-sm text-[var(--color-danger)]"><Icon name="error" />{error}</div> : null}
            {mustChange ? (
              <form onSubmit={handleSetNewPassword} className="space-y-4">
                <div><h3 className="font-semibold">Set a new password</h3><p className="mt-1 text-sm text-[var(--color-text-muted)]">Choose a replacement before accessing the dashboard remotely.</p></div>
                <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus hint="Use a password appropriate for access to this gateway." />
                <Button type="submit" fullWidth loading={loading} disabled={!newPassword}>Set password</Button>
              </form>
            ) : <div className="space-y-4">
              {samlAvailable ? <Button type="button" fullWidth onClick={() => { window.location.href = "/api/auth/saml/start"; }}>{samlLoginLabel}</Button> : null}
              {oidcAvailable ? <Button type="button" fullWidth onClick={() => { window.location.href = "/api/auth/oidc/start"; }}>{oidcLoginLabel}</Button> : null}
              {ssoAvailable && passwordAvailable ? <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]"><span className="h-px flex-1 bg-[var(--color-border)]"/><span>or use password</span><span className="h-px flex-1 bg-[var(--color-border)]"/></div> : null}
              {passwordAvailable ? <form onSubmit={handleLogin} className="space-y-4">
                {isSsoEnabled && !ssoAvailable ? <p className="border border-[var(--color-warning)] bg-[var(--color-warning-wash)] p-3 text-sm text-[var(--color-warning)]">{activeSsoType === "saml" ? "SAML SSO" : "OIDC"} configuration is incomplete. Password recovery remains available.</p> : null}
                <Input label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={!ssoAvailable} aria-describedby={error ? "login-error" : undefined} inputClassName="pr-12" button={<button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[var(--color-text-muted)]"><Icon name={showPassword ? "visibility_off" : "visibility"}/></button>} />
                {retryAfter > 0 ? <p className="data-text text-sm text-[var(--color-warning)]" aria-live="off">Locked · retry in {retryAfter}s</p> : null}
                {resetHint ? <p className="text-sm text-[var(--color-text-muted)]">Open the local KRouter9 CLI, then use Settings → Reset password.</p> : null}
                <Button type="submit" fullWidth loading={loading} disabled={retryAfter > 0}>{retryAfter > 0 ? "Locked" : "Login"}</Button>
                {hasPassword === false ? <p className="border border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-3 text-sm font-medium text-[var(--color-danger)]">Default password in use — set a real password in Settings before exposing this dashboard.</p> : null}
              </form> : null}
            </div>}
          </div>
        </div>
      </section>
    </main>
  );
}
