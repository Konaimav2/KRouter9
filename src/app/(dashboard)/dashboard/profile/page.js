"use client";

import { useState, useEffect, useRef } from "react";
import { Button, Toggle, Input } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import Modal, { ConfirmModal } from "@/shared/components/Modal";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

function StatusMessage({ status }) {
  if (!status?.message) return null;
  const isError = status.type === "error";
  return (
    <div
      role="status"
      className={`flex items-start gap-2 border-t border-[var(--color-border)] px-4 py-3 text-sm ${isError ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}
    >
      <Icon
        name={isError ? "error" : "check_circle"}
        size={17}
        className="mt-0.5 shrink-0"
      />
      <span>{status.message}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { theme, setTheme, isDark } = useTheme();
  const [locale, setLocale] = useState(() => getLocaleFromCookie());
  const [langOpen, setLangOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [settings, setSettings] = useState({ fallbackStrategy: "fill-first" });
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ type: "", message: "" });
  const [dbAuth, setDbAuth] = useState({ open: false, mode: "", password: "" });
  const pendingImportRef = useRef(null);
  const [oidcForm, setOidcForm] = useState({
    authMode: "password",
    oidcIssuerUrl: "",
    oidcClientId: "",
    oidcScopes: "openid profile email",
    oidcLoginLabel: "Sign in with OIDC",
  });
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcStatus, setOidcStatus] = useState({ type: "", message: "" });
  const [oidcLoading, setOidcLoading] = useState(false);
  const [oidcTestLoading, setOidcTestLoading] = useState(false);
  const [oidcTestStatus, setOidcTestStatus] = useState({
    type: "",
    message: "",
  });
  const [oidcExpanded, setOidcExpanded] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const oidcRedirectUri = origin
    ? `${origin}/api/auth/oidc/callback`
    : "/api/auth/oidc/callback";
  const samlAcsUrl = origin
    ? `${origin}/api/auth/saml/acs`
    : "/api/auth/saml/acs";
  const samlMetadataUrl = origin
    ? `${origin}/api/auth/saml/metadata`
    : "/api/auth/saml/metadata";

  // SAML State
  const [ssoTypeTab, setSsoTypeTab] = useState("saml");
  const [samlForm, setSamlForm] = useState({
    samlEntryPoint: "",
    samlIssuer: "urn:krouter9:sp",
    samlCert: "",
    samlLoginLabel: "Sign in with SAML SSO",
    samlAttributeEmail: "email",
    samlAttributeName: "name",
  });
  const [samlStatus, setSamlStatus] = useState({ type: "", message: "" });
  const [samlLoading, setSamlLoading] = useState(false);
  const [samlTestLoading, setSamlTestLoading] = useState(false);
  const [samlTestStatus, setSamlTestStatus] = useState({
    type: "",
    message: "",
  });
  const [showSamlGuide, setShowSamlGuide] = useState(false);
  const idpMetadataFileRef = useRef(null);
  const certFileRef = useRef(null);

  const importFileRef = useRef(null);
  const [proxyForm, setProxyForm] = useState({
    outboundProxyEnabled: false,
    outboundProxyUrl: "",
    outboundNoProxy: "",
  });
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);

  const [isRemoteHost, setIsRemoteHost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      // This state intentionally reflects a browser-only external value after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRemoteHost(
        !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname),
      );
    }
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setOidcForm({
          authMode: data?.authMode || "password",
          oidcIssuerUrl: data?.oidcIssuerUrl || "",
          oidcClientId: data?.oidcClientId || "",
          oidcScopes: data?.oidcScopes || "openid profile email",
          oidcLoginLabel: data?.oidcLoginLabel || "Sign in with OIDC",
        });
        setOidcClientSecret("");
        setSsoTypeTab(data?.ssoType || "saml");
        setSamlForm({
          samlEntryPoint: data?.samlEntryPoint || "",
          samlIssuer: data?.samlIssuer || "urn:krouter9:sp",
          samlCert: data?.samlCert || "",
          samlLoginLabel: data?.samlLoginLabel || "Sign in with SAML SSO",
          samlAttributeEmail: data?.samlAttributeEmail || "email",
          samlAttributeName: data?.samlAttributeName || "name",
        });
        if (
          data?.authMode === "sso" ||
          data?.authMode === "saml" ||
          data?.authMode === "oidc" ||
          data?.authMode === "both"
        ) {
          setOidcExpanded(true);
        }
        setProxyForm({
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
          outboundProxyUrl: "",
          outboundNoProxy: data?.outboundNoProxy || "",
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });
  }, []);

  const updateOutboundProxy = async (e) => {
    e.preventDefault();
    if (settings.outboundProxyEnabled !== true) return;
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundProxyUrl: proxyForm.outboundProxyUrl,
          outboundNoProxy: proxyForm.outboundNoProxy,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({ ...prev, outboundProxyUrl: "" }));
        setProxyStatus({ type: "success", message: "Proxy settings applied" });
      } else {
        setProxyStatus({
          type: "error",
          message: data.error || "Failed to update proxy settings",
        });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const testOutboundProxy = async () => {
    if (settings.outboundProxyEnabled !== true) return;

    const proxyUrl = (proxyForm.outboundProxyUrl || "").trim();
    if (!proxyUrl) {
      setProxyStatus({
        type: "error",
        message: "Please enter a Proxy URL to test",
      });
      return;
    }

    setProxyTestLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });

      const data = await res.json();
      if (res.ok && data?.ok) {
        setProxyStatus({
          type: "success",
          message: `Proxy test OK (${data.status}) in ${data.elapsedMs}ms`,
        });
      } else {
        setProxyStatus({
          type: "error",
          message: data?.error || "Proxy test failed",
        });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyTestLoading(false);
    }
  };

  const updateOutboundProxyEnabled = async (outboundProxyEnabled) => {
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundProxyEnabled }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({
          ...prev,
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
        }));
        setProxyStatus({
          type: "success",
          message: outboundProxyEnabled ? "Proxy enabled" : "Proxy disabled",
        });
      } else {
        setProxyStatus({
          type: "error",
          message: data.error || "Failed to update proxy settings",
        });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    setPassLoading(true);
    setPassStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPassStatus({
          type: "success",
          message: "Password updated successfully",
        });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        setPassStatus({
          type: "error",
          message: data.error || "Failed to update password",
        });
      }
    } catch (err) {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  const updateFallbackStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackStrategy: strategy }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, fallbackStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const updateComboStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategy: strategy }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, comboStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update combo strategy:", err);
    }
  };

  const updateStickyLimit = async (limit) => {
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, stickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update sticky limit:", err);
    }
  };

  const updateComboStickyLimit = async (limit) => {
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings((prev) => ({
          ...prev,
          comboStickyRoundRobinLimit: numLimit,
        }));
      }
    } catch (err) {
      console.error("Failed to update combo sticky limit:", err);
    }
  };

  const updateRequireLogin = async (requireLogin) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireLogin }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, requireLogin }));
      }
    } catch (err) {
      console.error("Failed to update require login:", err);
    }
  };

  const updateOidcForm = (field, value) => {
    setOidcForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveOidcSettings = async (
    authMode = oidcForm.authMode || "password",
  ) => {
    const issuerUrl = oidcForm.oidcIssuerUrl.trim();
    const clientId = oidcForm.oidcClientId.trim();
    const scopes = oidcForm.oidcScopes.trim();
    const loginLabel = oidcForm.oidcLoginLabel.trim();
    const secret = oidcClientSecret.trim();

    if (
      authMode !== "password" &&
      (!issuerUrl || !clientId || !secret) &&
      !settings.oidcConfigured
    ) {
      setOidcStatus({
        type: "error",
        message:
          "Issuer URL, client ID, and client secret are required to enable OIDC.",
      });
      return;
    }

    setOidcLoading(true);
    setOidcStatus({ type: "", message: "" });
    setOidcTestStatus({ type: "", message: "" });

    try {
      const payload = {
        authMode,
        ssoType: "oidc",
        oidcIssuerUrl: issuerUrl,
        oidcClientId: clientId,
        oidcScopes: scopes || "openid profile email",
        oidcLoginLabel: loginLabel || "Sign in with OIDC",
      };
      if (secret) {
        payload.oidcClientSecret = secret;
      }

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setOidcForm({
          authMode: data?.authMode || authMode,
          oidcIssuerUrl: data?.oidcIssuerUrl || issuerUrl,
          oidcClientId: data?.oidcClientId || clientId,
          oidcScopes: data?.oidcScopes || scopes || "openid profile email",
          oidcLoginLabel:
            data?.oidcLoginLabel || loginLabel || "Sign in with OIDC",
        });
        setOidcClientSecret("");
        setOidcStatus({
          type: "success",
          message:
            authMode === "oidc"
              ? "OIDC login enabled"
              : authMode === "both"
                ? "Password and OIDC login enabled"
                : "OIDC settings saved",
        });
      } else {
        setOidcStatus({
          type: "error",
          message: data.error || "Failed to save OIDC settings",
        });
      }
    } catch (err) {
      setOidcStatus({ type: "error", message: "An error occurred" });
    } finally {
      setOidcLoading(false);
    }
  };

  const testOidcConnection = async () => {
    const issuerUrl = oidcForm.oidcIssuerUrl.trim();
    const clientId = oidcForm.oidcClientId.trim();
    const scopes = oidcForm.oidcScopes.trim();
    const secret = oidcClientSecret.trim();

    if (!issuerUrl || !clientId) {
      setOidcTestStatus({
        type: "error",
        message:
          "Issuer URL and client ID are required to test the connection.",
      });
      return;
    }

    setOidcTestLoading(true);
    setOidcStatus({ type: "", message: "" });
    setOidcTestStatus({ type: "", message: "" });

    try {
      const saveRes = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authMode: oidcForm.authMode || settings.authMode || "password",
          oidcIssuerUrl: issuerUrl,
          oidcClientId: clientId,
          oidcScopes: scopes || "openid profile email",
          oidcLoginLabel: oidcForm.oidcLoginLabel.trim() || "Sign in with OIDC",
          ...(secret ? { oidcClientSecret: secret } : {}),
        }),
      });

      const saved = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        setOidcTestStatus({
          type: "error",
          message: saved.error || "Failed to save OIDC settings before testing",
        });
        return;
      }

      const res = await fetch("/api/auth/oidc/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuerUrl: saved.oidcIssuerUrl || issuerUrl,
          clientId: saved.oidcClientId || clientId,
          scopes: saved.oidcScopes || scopes || "openid profile email",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        const statusMessage = data.clientSecretTested
          ? data.clientSecretValid === true
            ? `Connection OK. Discovery loaded from ${data.issuerUrl}. Client secret validated too.`
            : `Connection OK. Discovery loaded from ${data.issuerUrl}. Client secret was not checked.`
          : `Connection OK. Discovery loaded from ${data.issuerUrl}.`;
        setOidcTestStatus({
          type: "success",
          message: statusMessage,
        });
      } else {
        setOidcTestStatus({
          type: "error",
          message: data.error || "OIDC connection test failed",
        });
      }
    } catch (err) {
      setOidcTestStatus({ type: "error", message: "An error occurred" });
    } finally {
      setOidcTestLoading(false);
    }
  };

  const updateSamlForm = (field, value) => {
    setSamlForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleIdpMetadataUpload = (event) => {
    const file = event.target.files?.[0];
    if (idpMetadataFileRef.current) idpMetadataFileRef.current.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xmlText = e.target?.result || "";
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, "text/xml");
        const parserError = doc.querySelector("parsererror");
        if (parserError) {
          setSamlStatus({
            type: "error",
            message: "Unable to parse valid SAML IdP metadata from XML file",
          });
          return;
        }

        const entityID = doc.documentElement.getAttribute("entityID") || "";
        const ssoNodes = Array.from(
          doc.querySelectorAll("SingleSignOnService, *|SingleSignOnService"),
        );
        let ssoUrl = "";
        for (const node of ssoNodes) {
          const binding = node.getAttribute("Binding") || "";
          const location = node.getAttribute("Location") || "";
          if (location) {
            ssoUrl = location;
            if (binding.includes("HTTP-Redirect")) break;
          }
        }

        const certNodes = Array.from(
          doc.querySelectorAll("X509Certificate, *|X509Certificate"),
        );
        let certStr = "";
        if (certNodes.length > 0) {
          certStr = certNodes[0].textContent.trim();
        }

        setSamlForm((prev) => ({
          ...prev,
          samlEntryPoint: ssoUrl || prev.samlEntryPoint,
          samlIssuer: prev.samlIssuer || "urn:krouter9:sp",
          samlCert: certStr || prev.samlCert,
        }));

        setSamlStatus({
          type: "success",
          message: `IdP Metadata imported! (SSO URL: ${ssoUrl ? "found" : "not found"}, EntityID: ${entityID ? "found" : "not found"}, Cert: ${certStr ? "found" : "not found"})`,
        });
      } catch (err) {
        setSamlStatus({
          type: "error",
          message: "Error reading IdP Metadata XML file",
        });
      }
    };
    reader.readAsText(file);
  };

  const handleCertFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (certFileRef.current) certFileRef.current.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result || "";
      setSamlForm((prev) => ({ ...prev, samlCert: text.trim() }));
      setSamlStatus({
        type: "success",
        message: "Certificate file loaded into configuration.",
      });
    };
    reader.readAsText(file);
  };

  const saveSamlSettings = async (
    targetAuthMode = oidcForm.authMode || "password",
  ) => {
    setSamlLoading(true);
    setSamlStatus({ type: "", message: "" });
    setSamlTestStatus({ type: "", message: "" });

    try {
      const payload = {
        authMode: targetAuthMode,
        ssoType: "saml",
        samlEntryPoint: samlForm.samlEntryPoint.trim(),
        samlIssuer: samlForm.samlIssuer.trim() || "urn:krouter9:sp",
        samlCert: samlForm.samlCert.trim(),
        samlLoginLabel:
          samlForm.samlLoginLabel.trim() || "Sign in with SAML SSO",
        samlAttributeEmail: samlForm.samlAttributeEmail.trim() || "email",
        samlAttributeName: samlForm.samlAttributeName.trim() || "name",
      };

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setSamlForm({
          samlEntryPoint: data?.samlEntryPoint || payload.samlEntryPoint,
          samlIssuer: data?.samlIssuer || payload.samlIssuer,
          samlCert: data?.samlCert || payload.samlCert,
          samlLoginLabel: data?.samlLoginLabel || payload.samlLoginLabel,
          samlAttributeEmail:
            data?.samlAttributeEmail || payload.samlAttributeEmail,
          samlAttributeName:
            data?.samlAttributeName || payload.samlAttributeName,
        });
        setSamlStatus({
          type: "success",
          message:
            targetAuthMode === "sso" || targetAuthMode === "saml"
              ? "SAML SSO login enabled"
              : targetAuthMode === "both"
                ? "Password and SAML SSO login enabled"
                : "SAML 2.0 settings saved",
        });
      } else {
        setSamlStatus({
          type: "error",
          message: data.error || "Failed to save SAML settings",
        });
      }
    } catch {
      setSamlStatus({
        type: "error",
        message: "An error occurred while saving SAML settings",
      });
    } finally {
      setSamlLoading(false);
    }
  };

  const testSamlConnection = async () => {
    setSamlTestLoading(true);
    setSamlStatus({ type: "", message: "" });
    setSamlTestStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/auth/saml/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          samlEntryPoint: samlForm.samlEntryPoint.trim(),
          samlIssuer: samlForm.samlIssuer.trim(),
          samlCert: samlForm.samlCert.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setSamlTestStatus({
          type: "success",
          message: data.message || "SAML configuration verified!",
        });
      } else {
        setSamlTestStatus({
          type: "error",
          message: data.error || "SAML configuration test failed",
        });
      }
    } catch {
      setSamlTestStatus({
        type: "error",
        message: "An error occurred while testing SAML configuration",
      });
    } finally {
      setSamlTestLoading(false);
    }
  };

  const updateObservabilityEnabled = async (enabled) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableObservability: enabled }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, enableObservability: enabled }));
      }
    } catch (err) {
      console.error("Failed to update enableObservability:", err);
    }
  };

  // P3: generic numeric setting updater (memory caps). Clamps to >= 0.
  const updateNumberSetting = async (key, rawValue) => {
    const n = Math.max(0, Math.floor(Number(rawValue) || 0));
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: n }),
      });
      if (res.ok) setSettings((prev) => ({ ...prev, [key]: n }));
    } catch (err) {
      console.error(`Failed to update ${key}:`, err);
    }
  };

  const reloadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("Failed to reload settings:", err);
    }
  };

  const handleExportDatabase = async (password) => {
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/database", {
        headers: { "x-9r-password": password },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export database");
      }

      const payload = await res.json();
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      anchor.href = url;
      anchor.download = `krouter9-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setDbStatus({ type: "success", message: "Database backup downloaded" });
    } catch (err) {
      setDbStatus({
        type: "error",
        message: err.message || "Failed to export database",
      });
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportDatabase = (event) => {
    const file = event.target.files?.[0];
    if (importFileRef.current) importFileRef.current.value = "";
    if (!file) return;
    pendingImportRef.current = file;
    setDbStatus({ type: "", message: "" });
    setDbAuth({ open: true, mode: "import", password: "" });
  };

  const runImportDatabase = async (password) => {
    const file = pendingImportRef.current;
    if (!file) return;
    setDbLoading(true);
    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);

      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import database");
      }

      await reloadSettings();
      setDbStatus({
        type: "success",
        message: "Database imported successfully",
      });
    } catch (err) {
      setDbStatus({
        type: "error",
        message: err.message || "Invalid backup file",
      });
    } finally {
      pendingImportRef.current = null;
      setDbLoading(false);
    }
  };

  // Confirm password modal, then run export or import.
  const handleDbAuthConfirm = async () => {
    const { mode, password } = dbAuth;
    setDbAuth({ open: false, mode: "", password: "" });
    if (mode === "export") await handleExportDatabase(password);
    else if (mode === "import") await runImportDatabase(password);
  };

  const observabilityEnabled = settings.enableObservability === true;

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/version/shutdown", { method: "POST" });
    } catch (e) {
      // Expected to fail as server shuts down; ignore error
    }
    setIsShuttingDown(false);
    setShutdownOpen(false);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        window.location.assign("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  const localeName = (() => {
    try {
      return (
        new Intl.DisplayNames([locale], { type: "language" }).of(locale) ||
        locale
      );
    } catch {
      return locale;
    }
  })();

  const sections = [
    ["system", "01", "System"],
    ["access", "02", "Access"],
    ["routing", "03", "Routing"],
    ["network", "04", "Network"],
    ["observability", "05", "Observability"],
    ["session", "06", "Session"],
  ];

  const jumpToSection = (id, event) => {
    const section = document.getElementById(id);
    const main = document.getElementById("dashboard-main");
    if (!section || !main?.contains(section)) return;
    event?.preventDefault();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduceMotion || event?.detail === 0 ? "instant" : "smooth", block: "start" });
    section.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="mx-auto w-full max-w-[72rem] px-1 sm:px-0">
      <div className="mb-4 lg:hidden">
        <label
          htmlFor="settings-section"
          className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]"
        >
          Settings section
        </label>
        <select
          id="settings-section"
          defaultValue="system"
          onChange={(event) => jumpToSection(event.target.value)}
          className="h-11 w-full rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm"
        >
          {sections.map(([id, number, label]) => (
            <option key={id} value={id}>
              {number} {label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="sticky top-20 hidden min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] lg:block"
        >
          <div className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">INDEX</span>
            <span className="font-semibold">Settings</span>
          </div>
          {sections.map(([id, number, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(event) => jumpToSection(id, event)}
              className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:text-[var(--color-primary)]"
            >
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">{number}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
          <section
            id="system"
            tabIndex={-1}
            className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] scroll-mt-24"
          >
            <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">01</span>
              <h2 className="font-semibold">System</h2>
            </header>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <Icon name="terminal" className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">
                    {isRemoteHost ? "Remote mode" : "Local mode"}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {isRemoteHost
                      ? "Connected to a remote gateway"
                      : "Running on your machine"}
                  </p>
                </div>
              </div>
              <div
                role="group"
                aria-label="Theme"
                className="grid grid-cols-3 border border-[var(--color-border)]"
              >
                {["light", "dark", "system"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={theme === option}
                    onClick={() => setTheme(option)}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-2 border-r border-[var(--color-border)] px-3 text-sm last:border-r-0",
                      theme === option
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                        : "bg-[var(--color-surface)] text-[var(--color-text-muted)]",
                    )}
                  >
                    <Icon
                      name={
                        option === "light"
                          ? "sun"
                          : option === "dark"
                            ? "moon"
                            : "settings"
                      }
                      size={16}
                    />
                    <span className="capitalize">{option}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="font-medium">Database location</p>
                <code className="data-text block overflow-wrap-anywhere text-xs text-[var(--color-text-muted)]">
                  ~/.krouter9/db/data.sqlite
                </code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  icon="download"
                  onClick={() =>
                    setDbAuth({ open: true, mode: "export", password: "" })
                  }
                  loading={dbLoading}
                >
                  Download backup
                </Button>
                <Button
                  variant="outline"
                  icon="upload"
                  onClick={() => importFileRef.current?.click()}
                  disabled={dbLoading}
                >
                  Import backup
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportDatabase}
                />
              </div>
            </div>
            <StatusMessage status={dbStatus} />
            <button
              type="button"
              onClick={() => setLangOpen(true)}
              className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left"
              data-i18n-skip="true"
            >
              <span className="flex items-center gap-3">
                <Icon name="language" />
                <span>
                  <span className="block font-medium">Language</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    Display language
                  </span>
                </span>
              </span>
              <span className="data-text text-sm">
                {localeName} · {locale}
              </span>
            </button>
          </section>

          <section
            id="access"
            tabIndex={-1}
            className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] scroll-mt-24"
          >
            <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">02</span>
              <h2 className="font-semibold">Access</h2>
            </header>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex items-start justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-medium">Require login</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Require a password before dashboard access.
                </p>
              </div>
              <Toggle
                checked={settings.requireLogin === true}
                onChange={() => updateRequireLogin(!settings.requireLogin)}
                disabled={loading}
              />
            </div>
            {settings.requireLogin === true && (
              <form
                onSubmit={handlePasswordChange}
                className="border-b border-[var(--color-border)] p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {settings.hasPassword && (
                    <div className="sm:col-span-2">
                      <Input
                        label="Current password"
                        type="password"
                        placeholder="Enter current password"
                        value={passwords.current}
                        onChange={(e) =>
                          setPasswords({
                            ...passwords,
                            current: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  )}
                  <Input
                    label="New password"
                    type="password"
                    placeholder="Enter new password"
                    value={passwords.new}
                    onChange={(e) =>
                      setPasswords({ ...passwords, new: e.target.value })
                    }
                    required
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    placeholder="Confirm new password"
                    value={passwords.confirm}
                    onChange={(e) =>
                      setPasswords({ ...passwords, confirm: e.target.value })
                    }
                    required
                  />
                </div>
                <StatusMessage status={passStatus} />
                <div className="mt-4">
                  <Button type="submit" variant="primary" loading={passLoading}>
                    {settings.hasPassword ? "Update password" : "Set password"}
                  </Button>
                </div>
              </form>
            )}

            <button
              type="button"
              onClick={() => setOidcExpanded((value) => !value)}
              aria-expanded={oidcExpanded}
              className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
            >
              <Icon name="lock" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Single Sign-On</span>
                <span className="block text-xs text-[var(--color-text-muted)]">
                  {settings.authMode === "sso" ||
                  settings.authMode === "oidc" ||
                  settings.authMode === "saml"
                    ? `${settings.ssoType === "saml" ? "SAML 2.0" : "OIDC"} SSO active`
                    : settings.authMode === "both"
                      ? `Password + ${settings.ssoType === "saml" ? "SAML 2.0" : "OIDC"} active`
                      : "Optional SSO via SAML 2.0 or OIDC"}
                </span>
              </span>
              <Icon
                name="chevron_down"
                className={cn(
                  "transition-transform",
                  oidcExpanded && "rotate-180",
                )}
              />
            </button>

            {oidcExpanded && (
              <div className="space-y-5 border-b border-[var(--color-border)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">
                  Configure enterprise dashboard access without changing
                  password-login behavior until settings are saved.
                </p>
                <div>
                  <span className="mb-2 block text-sm font-medium">
                    SSO protocol
                  </span>
                  <div
                    role="group"
                    aria-label="SSO protocol"
                    className="grid grid-cols-2 border border-[var(--color-border)]"
                  >
                    {[
                      ["saml", "SAML 2.0"],
                      ["oidc", "OIDC"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={ssoTypeTab === value}
                        onClick={() => setSsoTypeTab(value)}
                        className={cn(
                          "min-h-11 border-r border-[var(--color-border)] px-3 text-sm last:border-r-0",
                          ssoTypeTab === value
                            ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                            : "bg-[var(--color-surface)]",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-2 block text-sm font-medium">
                    Auth mode
                  </span>
                  <div
                    role="group"
                    aria-label="Authentication mode"
                    className="grid border border-[var(--color-border)] sm:grid-cols-3"
                  >
                    {[
                      {
                        value: "password",
                        title: "Password only",
                        desc: "Keep password login.",
                      },
                      {
                        value: "sso",
                        title: `${ssoTypeTab === "saml" ? "SAML" : "OIDC"} only`,
                        desc: "Require SSO.",
                      },
                      {
                        value: "both",
                        title: "Both",
                        desc: "Allow either method.",
                      },
                    ].map((option) => {
                      const currentMode = oidcForm.authMode;
                      const active =
                        option.value === "password"
                          ? currentMode === "password"
                          : option.value === "sso"
                            ? ["sso", "saml", "oidc"].includes(currentMode)
                            : currentMode === "both";
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            updateOidcForm("authMode", option.value)
                          }
                          disabled={loading || oidcLoading || samlLoading}
                          className={cn(
                            "min-h-16 border-b border-[var(--color-border)] p-3 text-left last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0",
                            active
                              ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                              : "bg-[var(--color-surface)]",
                          )}
                        >
                          <span className="block text-sm font-medium">
                            {option.title}
                          </span>
                          <span
                            className={cn(
                              "block text-xs",
                              active
                                ? "opacity-80"
                                : "text-[var(--color-text-muted)]",
                            )}
                          >
                            {option.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {ssoTypeTab === "saml" ? (
                  <div className="space-y-5 border-t border-[var(--color-border)] pt-5">
                    <div className="border-y border-[var(--color-border)]">
                      <button
                        type="button"
                        onClick={() => setShowSamlGuide((value) => !value)}
                        aria-expanded={showSamlGuide}
                        className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
                      >
                        <Icon name="menu_book" />
                        <span className="flex-1">
                          <span className="block text-sm font-medium">
                            IdP setup guide
                          </span>
                          <span className="block text-xs text-[var(--color-text-muted)]">
                            AWS IAM Identity Center, Microsoft Entra ID, Okta,
                            Auth0, Keycloak and Authentik
                          </span>
                        </span>
                        <Icon
                          name="chevron_down"
                          className={cn(
                            "transition-transform",
                            showSamlGuide && "rotate-180",
                          )}
                        />
                      </button>
                      {showSamlGuide && (
                        <div className="space-y-4 border-t border-[var(--color-border)] py-4 text-xs text-[var(--color-text-muted)]">
                          <div>
                            <p className="font-medium text-[var(--color-text)]">
                              Required service-provider values
                            </p>
                            <dl className="mt-2 grid gap-2">
                              <div>
                                <dt>ACS URL</dt>
                                <dd>
                                  <code className="data-text block overflow-wrap-anywhere text-[var(--color-text)]">
                                    {samlAcsUrl}
                                  </code>
                                </dd>
                              </div>
                              <div>
                                <dt>SP Entity ID / Audience</dt>
                                <dd>
                                  <code className="data-text block overflow-wrap-anywhere text-[var(--color-text)]">
                                    {samlForm.samlIssuer || "urn:krouter9:sp"}
                                  </code>
                                </dd>
                              </div>
                              <div>
                                <dt>NameID format</dt>
                                <dd>EmailAddress or Unspecified</dd>
                              </div>
                            </dl>
                          </div>
                          {[
                            {
                              name: "AWS IAM Identity Center",
                              steps: [
                                "Add a custom SAML 2.0 application.",
                                "Set the ACS URL and SAML audience shown above.",
                                "Map Subject or email to the user email, then download metadata XML.",
                              ],
                            },
                            {
                              name: "Microsoft Entra ID",
                              steps: [
                                "Create an enterprise application and choose SAML single sign-on.",
                                "Set Identifier to the SP Entity ID and Reply URL to the ACS URL.",
                                "Download Federation Metadata XML or the X.509 certificate.",
                              ],
                            },
                            {
                              name: "Okta / Auth0",
                              steps: [
                                "Create a SAML 2.0 app integration.",
                                "Set Single Sign-On URL to the ACS URL and Audience URI to the SP Entity ID.",
                                "Use EmailAddress Name ID, then download IdP metadata or certificate.",
                              ],
                            },
                            {
                              name: "Keycloak / Authentik",
                              steps: [
                                "Create a SAML client using the SP Entity ID.",
                                "Set the master SAML processing URL to the ACS URL.",
                                "Export the descriptor XML or copy the IdP certificate.",
                              ],
                            },
                          ].map((provider) => (
                            <section
                              key={provider.name}
                              className="border-t border-[var(--color-border)] pt-3"
                            >
                              <h3 className="font-medium text-[var(--color-text)]">
                                {provider.name}
                              </h3>
                              <ol className="mt-1 list-decimal space-y-1 pl-4">
                                {provider.steps.map((step) => (
                                  <li key={step}>{step}</li>
                                ))}
                              </ol>
                            </section>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          IdP metadata XML import
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Auto-fill the SSO URL and certificate from metadata.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        icon="upload_file"
                        onClick={() => idpMetadataFileRef.current?.click()}
                      >
                        Upload metadata XML
                      </Button>
                      <input
                        ref={idpMetadataFileRef}
                        type="file"
                        accept=".xml,application/xml,text/xml"
                        className="hidden"
                        onChange={handleIdpMetadataUpload}
                      />
                    </div>
                    <div className="grid gap-4">
                      <Input
                        label="Single Sign-On Service URL (samlEntryPoint)"
                        placeholder="https://idp.example.com/app/saml/sso/..."
                        value={samlForm.samlEntryPoint}
                        onChange={(e) =>
                          updateSamlForm("samlEntryPoint", e.target.value)
                        }
                        disabled={loading || samlLoading}
                      />
                      <Input
                        label="SP Entity ID / Audience (samlIssuer)"
                        placeholder="urn:krouter9:sp"
                        value={samlForm.samlIssuer}
                        onChange={(e) =>
                          updateSamlForm("samlIssuer", e.target.value)
                        }
                        disabled={loading || samlLoading}
                      />
                      <div>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <label
                            htmlFor="saml-cert"
                            className="text-sm font-medium"
                          >
                            IdP X.509 certificate (samlCert)
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            icon="upload_file"
                            onClick={() => certFileRef.current?.click()}
                          >
                            Upload certificate
                          </Button>
                          <input
                            ref={certFileRef}
                            type="file"
                            accept=".crt,.pem,.cer,text/plain"
                            className="hidden"
                            onChange={handleCertFileUpload}
                          />
                        </div>
                        <textarea
                          id="saml-cert"
                          rows={4}
                          placeholder="-----BEGIN CERTIFICATE-----"
                          value={samlForm.samlCert}
                          onChange={(e) =>
                            updateSamlForm("samlCert", e.target.value)
                          }
                          className="w-full rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
                          disabled={loading || samlLoading}
                        />
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          Paste raw Base64 certificate or a PEM block.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Input
                          label="Login button label"
                          placeholder="Sign in with SAML SSO"
                          value={samlForm.samlLoginLabel}
                          onChange={(e) =>
                            updateSamlForm("samlLoginLabel", e.target.value)
                          }
                          disabled={loading || samlLoading}
                        />
                        <Input
                          label="Email claim attribute"
                          placeholder="email"
                          value={samlForm.samlAttributeEmail}
                          onChange={(e) =>
                            updateSamlForm("samlAttributeEmail", e.target.value)
                          }
                          disabled={loading || samlLoading}
                        />
                        <Input
                          label="Display name claim"
                          placeholder="name"
                          value={samlForm.samlAttributeName}
                          onChange={(e) =>
                            updateSamlForm("samlAttributeName", e.target.value)
                          }
                          disabled={loading || samlLoading}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 border-y border-[var(--color-border)] py-3 text-xs sm:grid-cols-2">
                      <div className="min-w-0">
                        <p className="font-medium">ACS callback URL</p>
                        <code className="data-text block overflow-wrap-anywhere text-[var(--color-text-muted)]">
                          {samlAcsUrl}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          icon="content_copy"
                          className="mt-2"
                          onClick={() => {
                            navigator.clipboard.writeText(samlAcsUrl);
                            setSamlStatus({
                              type: "success",
                              message: "ACS URL copied to clipboard!",
                            });
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">SP XML metadata</p>
                        <code className="data-text block overflow-wrap-anywhere text-[var(--color-text-muted)]">
                          {samlMetadataUrl}
                        </code>
                        <a
                          href={samlMetadataUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download="krouter9-sp-metadata.xml"
                          className="mt-2 inline-flex min-h-9 items-center gap-2 text-[var(--color-primary)] underline"
                        >
                          <Icon name="download" size={16} />
                          Download XML
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="primary"
                        loading={samlLoading}
                        onClick={() => saveSamlSettings(oidcForm.authMode)}
                      >
                        Save SAML settings
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        loading={samlTestLoading}
                        onClick={testSamlConnection}
                      >
                        Test SAML settings
                      </Button>
                    </div>
                    <StatusMessage status={samlTestStatus} />
                    <StatusMessage status={samlStatus} />
                  </div>
                ) : (
                  <div className="space-y-5 border-t border-[var(--color-border)] pt-5">
                    <div className="grid gap-4">
                      <Input
                        label="Issuer URL"
                        placeholder="https://auth.example.com/application/o/krouter9/"
                        value={oidcForm.oidcIssuerUrl}
                        onChange={(e) =>
                          updateOidcForm("oidcIssuerUrl", e.target.value)
                        }
                        disabled={loading || oidcLoading}
                      />
                      <Input
                        label="Client ID"
                        placeholder="krouter9-dashboard"
                        value={oidcForm.oidcClientId}
                        onChange={(e) =>
                          updateOidcForm("oidcClientId", e.target.value)
                        }
                        disabled={loading || oidcLoading}
                      />
                      <Input
                        label="Client secret"
                        type="password"
                        placeholder="Leave blank to keep existing secret"
                        value={oidcClientSecret}
                        onChange={(e) => setOidcClientSecret(e.target.value)}
                        disabled={loading || oidcLoading}
                        hint="Write-only after saving. Leave blank to preserve the configured secret."
                      />
                      <Input
                        label="Scopes"
                        placeholder="openid profile email"
                        value={oidcForm.oidcScopes}
                        onChange={(e) =>
                          updateOidcForm("oidcScopes", e.target.value)
                        }
                        disabled={loading || oidcLoading}
                      />
                      <Input
                        label="Login button label"
                        placeholder="Sign in with OIDC"
                        value={oidcForm.oidcLoginLabel}
                        onChange={(e) =>
                          updateOidcForm("oidcLoginLabel", e.target.value)
                        }
                        disabled={loading || oidcLoading}
                      />
                    </div>
                    <div className="border-y border-[var(--color-border)] py-3">
                      <p className="text-sm font-medium">Redirect URI</p>
                      <code className="data-text block overflow-wrap-anywhere text-xs text-[var(--color-text-muted)]">
                        {oidcRedirectUri}
                      </code>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="primary"
                        loading={oidcLoading}
                        onClick={() => saveOidcSettings()}
                      >
                        Save OIDC settings
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        loading={oidcTestLoading}
                        onClick={testOidcConnection}
                      >
                        Test connection
                      </Button>
                    </div>
                    <StatusMessage status={oidcTestStatus} />
                    <StatusMessage status={oidcStatus} />
                  </div>
                )}
                {(["oidc", "saml", "sso"].includes(settings.authMode) ||
                  settings.authMode === "both") && (
                  <div className="flex items-start gap-2 border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-warning)]">
                    <Icon
                      name="warning"
                      size={17}
                      className="mt-0.5 shrink-0"
                    />
                    <p>
                      {settings.authMode === "both"
                        ? `Password and SSO login (${settings.ssoType === "saml" ? "SAML 2.0" : "OIDC"}) are both active.`
                        : `SSO login (${settings.ssoType === "saml" ? "SAML 2.0" : "OIDC"}) is active. Password login is disabled until you switch back.`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section
            id="routing"
            tabIndex={-1}
            className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] scroll-mt-24"
          >
            <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">03</span>
              <h2 className="font-semibold">Routing</h2>
            </header>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="font-medium">Account strategy</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Choose priority order or distribute requests across accounts.
                </p>
              </div>
              <div
                role="group"
                aria-label="Account routing strategy"
                className="grid grid-cols-2 border border-[var(--color-border)]"
              >
                {[
                  ["fill-first", "Fill first"],
                  ["round-robin", "Round robin"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={settings.fallbackStrategy === value}
                    onClick={() => updateFallbackStrategy(value)}
                    disabled={loading}
                    className={cn(
                      "min-h-11 border-r border-[var(--color-border)] px-3 text-sm last:border-r-0",
                      settings.fallbackStrategy === value
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                        : "bg-[var(--color-surface)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {settings.fallbackStrategy === "round-robin" && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium">Account sticky limit</p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Calls per account before switching.
                  </p>
                </div>
                <Input
                  aria-label="Account sticky limit"
                  type="number"
                  min="1"
                  max="10"
                  value={settings.stickyRoundRobinLimit || 3}
                  onChange={(e) => updateStickyLimit(e.target.value)}
                  disabled={loading}
                  className="w-20 text-center"
                />
              </div>
            )}
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="font-medium">Combo strategy</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Choose fallback order or rotate through combo models.
                </p>
              </div>
              <div
                role="group"
                aria-label="Combo routing strategy"
                className="grid grid-cols-2 border border-[var(--color-border)]"
              >
                {[
                  ["fallback", "Fallback"],
                  ["round-robin", "Round robin"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={
                      (settings.comboStrategy || "fallback") === value
                    }
                    onClick={() => updateComboStrategy(value)}
                    disabled={loading}
                    className={cn(
                      "min-h-11 border-r border-[var(--color-border)] px-3 text-sm last:border-r-0",
                      (settings.comboStrategy || "fallback") === value
                        ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                        : "bg-[var(--color-surface)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {settings.comboStrategy === "round-robin" && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium">Combo sticky limit</p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Calls per combo model before switching.
                  </p>
                </div>
                <Input
                  aria-label="Combo sticky limit"
                  type="number"
                  min="1"
                  max="100"
                  value={settings.comboStickyRoundRobinLimit || 1}
                  onChange={(e) => updateComboStickyLimit(e.target.value)}
                  disabled={loading}
                  className="w-20 text-center"
                />
              </div>
            )}
            <div className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
              <Icon name="route" size={16} className="mr-2 inline" />
              {settings.fallbackStrategy === "round-robin"
                ? `Accounts rotate after ${settings.stickyRoundRobinLimit || 3} calls.`
                : "Accounts are used in priority order."}{" "}
              {settings.comboStrategy === "round-robin"
                ? `Combos rotate after ${settings.comboStickyRoundRobinLimit || 1} call${(settings.comboStickyRoundRobinLimit || 1) === 1 ? "" : "s"}.`
                : "Combos begin with their first model."}
            </div>
          </section>

          <section
            id="network"
            tabIndex={-1}
            className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] scroll-mt-24"
          >
            <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">04</span>
              <h2 className="font-semibold">Network</h2>
            </header>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex items-start justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-medium">Outbound proxy</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Proxy OAuth and provider outbound requests.
                </p>
              </div>
              <Toggle
                checked={settings.outboundProxyEnabled === true}
                onChange={() =>
                  updateOutboundProxyEnabled(
                    !(settings.outboundProxyEnabled === true),
                  )
                }
                disabled={loading || proxyLoading}
              />
            </div>
            {settings.outboundProxyEnabled === true && (
              <form onSubmit={updateOutboundProxy} className="space-y-4 p-4">
                {settings.hasOutboundProxyAuth && (
                  <div className="border-y border-[var(--color-border)] py-3">
                    <p className="text-sm font-medium">Configured proxy</p>
                    <code className="data-text block overflow-wrap-anywhere text-xs text-[var(--color-text-muted)]">
                      {settings.outboundProxyUrlMasked || "hidden"}
                    </code>
                  </div>
                )}
                <Input
                  label="Replacement proxy URL"
                  type="password"
                  placeholder={
                    settings.hasOutboundProxyAuth
                      ? "Leave blank to keep current"
                      : "http://127.0.0.1:7897"
                  }
                  value={proxyForm.outboundProxyUrl}
                  onChange={(e) =>
                    setProxyForm((previous) => ({
                      ...previous,
                      outboundProxyUrl: e.target.value,
                    }))
                  }
                  disabled={loading || proxyLoading}
                  hint={
                    settings.hasOutboundProxyAuth
                      ? "Leave blank to preserve the configured proxy URL."
                      : "Leave blank to inherit an environment proxy, when available."
                  }
                />
                <Input
                  label="No proxy"
                  placeholder="localhost,127.0.0.1"
                  value={proxyForm.outboundNoProxy}
                  onChange={(e) =>
                    setProxyForm((previous) => ({
                      ...previous,
                      outboundNoProxy: e.target.value,
                    }))
                  }
                  disabled={loading || proxyLoading}
                  hint="Comma-separated hostnames or domains that bypass the proxy."
                />
                <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-4 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={proxyTestLoading}
                    disabled={loading || proxyLoading}
                    onClick={testOutboundProxy}
                  >
                    Test proxy URL
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={proxyLoading}
                  >
                    Apply
                  </Button>
                </div>
              </form>
            )}
            <StatusMessage status={proxyStatus} />
          </section>

          <section
            id="observability"
            tabIndex={-1}
            className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] scroll-mt-24"
          >
            <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">05</span>
              <h2 className="font-semibold">Observability</h2>
            </header>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] flex items-start justify-between gap-4 px-4 py-4">
              <div>
                <p className="font-medium">Request observability</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Record request details for inspection in the logs view.
                </p>
              </div>
              <Toggle
                checked={observabilityEnabled}
                onChange={updateObservabilityEnabled}
                disabled={loading}
              />
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Input
                label="Body cap (bytes)"
                type="number"
                min="0"
                value={settings.observabilityBodyCapBytes ?? 262144}
                onChange={(e) =>
                  updateNumberSetting(
                    "observabilityBodyCapBytes",
                    e.target.value,
                  )
                }
                hint="Truncate recorded request and response bodies above this size."
              />
              <Input
                label="Stream accumulate cap (bytes)"
                type="number"
                min="0"
                value={settings.streamAccumulateCapBytes ?? 65536}
                onChange={(e) =>
                  updateNumberSetting(
                    "streamAccumulateCapBytes",
                    e.target.value,
                  )
                }
                hint="Maximum in-memory bytes retained per streamed completion."
              />
              <Input
                label="Rate-limit map cap"
                type="number"
                min="0"
                value={settings.rateLimitMapCap ?? 10000}
                onChange={(e) =>
                  updateNumberSetting("rateLimitMapCap", e.target.value)
                }
                hint="Maximum tracked keys before the oldest entries are evicted."
              />
              <Input
                label="Circuit-breaker max entries"
                type="number"
                min="0"
                value={settings.circuitBreakerMaxEntries ?? 5000}
                onChange={(e) =>
                  updateNumberSetting(
                    "circuitBreakerMaxEntries",
                    e.target.value,
                  )
                }
                hint="Maximum provider and model health entries retained."
              />
            </div>
          </section>

          <section
            id="session"
            tabIndex={-1}
            className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] scroll-mt-24"
          >
            <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
              <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">06</span>
              <h2 className="font-semibold">Session</h2>
            </header>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="font-medium">Current session</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Sign out without stopping the gateway.
                </p>
              </div>
              <Button variant="outline" icon="logout" onClick={handleLogout}>
                Logout
              </Button>
            </div>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-b-0 hover:bg-[var(--color-surface-hover)] grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="font-medium text-[var(--color-danger)]">
                  Shutdown gateway
                </p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Stop the local proxy server after confirmation.
                </p>
              </div>
              <Button
                variant="outline"
                icon="power_settings_new"
                onClick={() => setShutdownOpen(true)}
                className="border-[var(--color-danger)] text-[var(--color-danger)]"
              >
                Shutdown
              </Button>
            </div>
            <div className="grid gap-2 px-4 py-3 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
              <span>
                {APP_CONFIG.name}{" "}
                <span className="data-text">v{APP_CONFIG.version}</span>
              </span>
              <span className="sm:text-right">
                {isRemoteHost
                  ? "Remote mode"
                  : "Local mode · Data stored on this machine"}
              </span>
            </div>
          </section>
        </div>
      </div>

      <LanguageSwitcher
        hideTrigger
        isOpen={langOpen}
        onClose={(next) => {
          setLangOpen(false);
          setLocale(next);
        }}
      />
      <ConfirmModal
        isOpen={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
        onConfirm={handleShutdown}
        title="Close Proxy"
        message="Are you sure you want to close the proxy server?"
        confirmText="Close"
        cancelText="Cancel"
        variant="danger"
        loading={isShuttingDown}
      />
      <Modal
        isOpen={dbAuth.open}
        onClose={() => setDbAuth({ open: false, mode: "", password: "" })}
        title="Confirm Password"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDbAuth({ open: false, mode: "", password: "" })}
              disabled={dbLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleDbAuthConfirm}
              loading={dbLoading}
              disabled={!dbAuth.password}
            >
              Confirm
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Enter your current password to{" "}
          {dbAuth.mode === "export" ? "export" : "import"} the database.
        </p>
        <Input
          type="password"
          value={dbAuth.password}
          onChange={(e) =>
            setDbAuth((state) => ({ ...state, password: e.target.value }))
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && dbAuth.password) handleDbAuthConfirm();
          }}
          placeholder="Current password"
          autoFocus
        />
      </Modal>
    </div>
  );
}
