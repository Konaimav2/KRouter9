"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Icon from "@/shared/components/Icon";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import {
  getModelsByProviderId,
  PROVIDER_ID_TO_ALIAS,
} from "@/shared/constants/models";
import {
  ClaudeToolCard,
  CodexToolCard,
  DroidToolCard,
  OpenClawToolCard,
  HermesToolCard,
  DefaultToolCard,
  OpenCodeToolCard,
  CoworkToolCard,
  ClineToolCard,
  KiloToolCard,
  DeepSeekTuiToolCard,
  JcodeToolCard,
  GrokBuildToolCard,
} from "../components";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

const TOOL_COMMANDS = {
  claude: { install: "npm install -g @anthropic-ai/claude-code", verify: "claude --version" },
  codex: { install: "npm install -g @openai/codex", verify: "codex --version" },
  opencode: { install: "npm install -g opencode-ai", verify: "opencode --version" },
  droid: { install: "curl -fsSL https://app.factory.ai/cli | sh", verify: "droid --version" },
  openclaw: { install: "npm install -g openclaw", verify: "openclaw --version" },
  hermes: { install: "pipx install hermes-agent", verify: "hermes --version" },
  cline: { install: "code --install-extension saoudrizwan.claude-dev", verify: "code --list-extensions | grep saoudrizwan.claude-dev" },
  kilo: { install: "code --install-extension kilocode.kilo-code", verify: "code --list-extensions | grep kilocode.kilo-code" },
  "deepseek-tui": { install: "npm install -g deepseek-tui", verify: "deepseek-tui --version" },
  jcode: { install: "npm install -g @jcode-ai/cli", verify: "jcode --version" },
  "grok-build": { install: "npm install -g @xai-org/grok-cli", verify: "grok --version" },
  cowork: { install: "# Install Claude Desktop from the official Anthropic download page", verify: "# Open Claude Desktop and confirm the chat window loads" },
  copilot: { install: "code --install-extension GitHub.copilot-chat", verify: "code --list-extensions | grep GitHub.copilot-chat" },
  antigravity: { install: "# Install Antigravity from its official release page", verify: "antigravity --version" },
  mitm: { install: "python3 -m pip install --user mitmproxy", verify: "mitmproxy --version" },
};

function CopySetupValue({ label, value }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--button-border)] px-3 py-2 text-xs font-medium text-text-main hover:border-primary hover:text-primary"
      aria-label={`${label}: ${copied ? "copied" : "copy"}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function ToolDetailClient({ toolId, machineId }) {
  const tool = CLI_TOOLS[toolId];
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modelMappings, setModelMappings] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [tailscaleEnabled, setTailscaleEnabled] = useState(false);
  const [tailscaleUrl, setTailscaleUrl] = useState("");
  const [apiKeys, setApiKeys] = useState([]);
  const [setupKeyId, setSetupKeyId] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [provRes, settingsRes, tunnelRes, keysRes] = await Promise.all([
          fetch("/api/providers?mode=full"),
          fetch("/api/settings"),
          fetch("/api/tunnel/status"),
          fetch("/api/keys"),
        ]);
        if (!mounted) return;
        if (provRes.ok) {
          const data = await provRes.json();
          setConnections(data.connections || []);
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setCloudEnabled(data.cloudEnabled || false);
        }
        if (tunnelRes.ok) {
          const data = await tunnelRes.json();
          setTunnelEnabled(
            !!(data.tunnel?.enabled || data.tunnel?.settingsEnabled),
          );
          setTunnelPublicUrl(data.tunnel?.publicUrl || "");
          setTailscaleEnabled(
            !!(data.tailscale?.enabled || data.tailscale?.settingsEnabled),
          );
          setTailscaleUrl(data.tailscale?.tunnelUrl || "");
        }
        if (keysRes.ok) {
          const data = await keysRes.json();
          setApiKeys(data.keys || []);
        }
      } catch (error) {
        console.log("Error loading tool data:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const getActiveProviders = () =>
    connections.filter((c) => c.isActive !== false);

  const getAllAvailableModels = () => {
    const activeProviders = getActiveProviders();
    const models = [];
    const seenModels = new Set();
    activeProviders.forEach((conn) => {
      const alias = PROVIDER_ID_TO_ALIAS[conn.provider] || conn.provider;
      const providerModels = getModelsByProviderId(conn.provider);
      providerModels.forEach((m) => {
        const modelValue = `${alias}/${m.id}`;
        if (!seenModels.has(modelValue)) {
          seenModels.add(modelValue);
          models.push({
            value: modelValue,
            label: `${alias}/${m.id}`,
            provider: conn.provider,
            alias,
            connectionName: conn.name,
            modelId: m.id,
          });
        }
      });

      // openai/anthropic-compatible providers are registered with a random UUID (e.g.
      // "openai-compatible-chat-<uuid>") that has no entry in the static PROVIDER_MODELS
      // catalog, so `getModelsByProviderId` returns []. Routing still works because the
      // request path uses the connection's own model config, but `hasActiveProviders`
      // below would flip to false and disable the Apply button. Fall back to the
      // connection's own models so these providers are usable from CLI tool pages.
      if (providerModels.length === 0) {
        const prefix = conn.providerSpecificData?.prefix || alias;
        const fallbackModels = [];
        if (conn.defaultModel)
          fallbackModels.push({
            id: conn.defaultModel,
            name: conn.defaultModel,
          });
        (conn.providerSpecificData?.customModels || []).forEach((m) => {
          if (m?.id && !fallbackModels.some((f) => f.id === m.id))
            fallbackModels.push({ id: m.id, name: m.name || m.id });
        });
        if (fallbackModels.length === 0 && conn.testStatus === "active") {
          // Provider is confirmed reachable but exposes no model info anywhere;
          // still let the user apply so they aren't stuck on a permanently disabled button.
          fallbackModels.push({ id: "model-id", name: `${prefix}/model-id` });
        }
        fallbackModels.forEach((m) => {
          const modelValue = `${prefix}/${m.id}`;
          if (!seenModels.has(modelValue)) {
            seenModels.add(modelValue);
            models.push({
              value: modelValue,
              label: `${prefix}/${m.id}`,
              provider: conn.provider,
              alias: prefix,
              connectionName: conn.name,
              modelId: m.id,
            });
          }
        });
      }
    });
    return models;
  };

  const handleModelMappingChange = useCallback((tId, alias, target) => {
    setModelMappings((prev) => {
      if (prev[tId]?.[alias] === target) return prev;
      return { ...prev, [tId]: { ...prev[tId], [alias]: target } };
    });
  }, []);

  const getBaseUrl = () => {
    if (tunnelEnabled && tunnelPublicUrl) return tunnelPublicUrl;
    if (cloudEnabled && CLOUD_URL) return CLOUD_URL;
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:20128";
  };

  const renderSetupLedger = () => {
    const command = TOOL_COMMANDS[toolId] || {
      install: `# Install ${tool.name} from its official distribution`,
      verify: `${toolId} --version`,
    };
    const baseUrl = getBaseUrl();
    const availableModels = getAllAvailableModels();
    const selectedModel = availableModels[0]?.value || "provider/model-id";
    const selectedKey = apiKeys.find((key) => String(key.id) === setupKeyId);
    const steps = [
      {
        title: "Install the client",
        detail: "Run this command yourself in a terminal. KRouter9 never downloads or executes it.",
        value: command.install,
      },
      {
        title: "Set the base URL",
        detail: "Use this gateway origin in the client provider or environment settings.",
        value: baseUrl,
      },
      {
        title: "Choose an API key",
        detail: "Select an existing KRouter9 key. The secret remains masked; paste the key from its secure source when the client asks for it.",
        control: (
          <select
            value={setupKeyId}
            onChange={(event) => setSetupKeyId(event.target.value)}
            className="min-h-10 w-full border border-border bg-background px-3 text-sm text-text-main sm:max-w-md"
          >
            <option value="">Select a key ({apiKeys.length} available)</option>
            {apiKeys.map((key, index) => (
              <option key={key.id || index} value={String(key.id || index)}>
                {key.name || key.label || `API key ${index + 1}`}
              </option>
            ))}
          </select>
        ),
        value: selectedKey ? selectedKey.name || selectedKey.label || "Selected API key" : "sk-your-krouter9-key",
      },
      {
        title: "Map a model",
        detail: "Use a slash-qualified route so KRouter9 can send the request to the intended provider.",
        value: selectedModel,
      },
      {
        title: "Verify the setup",
        detail: "Run the version or launch check yourself. Expected output: a version number or a successful client launch without an authentication error.",
        value: command.verify,
      },
    ];

    return (
      <section className="ledger-band">
        <header className="ledger-caption">
          <span className="ledger-number">01</span>
          <h2 className="font-semibold">Manual setup ledger</h2>
        </header>
        <ol>
          {steps.map((step, index) => (
            <li key={step.title} className="signal-row grid gap-3 px-4 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
              <span className="ledger-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0 space-y-2">
                <div><h3 className="font-medium text-text-main">{step.title}</h3><p className="text-sm leading-6 text-text-muted">{step.detail}</p></div>
                {step.control}
                <div className="flex min-w-0 items-center gap-2 border border-border bg-background p-2">
                  <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-xs text-text-main">{step.value}</code>
                  <CopySetupValue label={step.title} value={step.value} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  };

  const renderToolCard = () => {
    const availableModels = getAllAvailableModels();
    const hasActiveProviders = availableModels.length > 0;
    const commonProps = {
      tool,
      isExpanded: true,
      onToggle: () => {},
      baseUrl: getBaseUrl(),
      apiKeys,
      tunnelEnabled,
      tunnelPublicUrl,
      tailscaleEnabled,
      tailscaleUrl,
    };

    switch (toolId) {
      case "claude":
        return (
          <ClaudeToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            modelMappings={modelMappings[toolId] || {}}
            onModelMappingChange={(a, t) =>
              handleModelMappingChange(toolId, a, t)
            }
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "codex":
        return (
          <CodexToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
      case "opencode":
        return (
          <OpenCodeToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
      case "cowork":
        return (
          <CoworkToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
            cloudUrl={CLOUD_URL}
            tunnelEnabled={tunnelEnabled}
            tunnelPublicUrl={tunnelPublicUrl}
            tailscaleEnabled={tailscaleEnabled}
            tailscaleUrl={tailscaleUrl}
          />
        );
      case "droid":
        return (
          <DroidToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "openclaw":
        return (
          <OpenClawToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "hermes":
        return (
          <HermesToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "cline":
        return (
          <ClineToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
      case "kilo":
        return (
          <KiloToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
      case "deepseek-tui":
        return (
          <DeepSeekTuiToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "jcode":
        return (
          <JcodeToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "grok-build":
        return (
          <GrokBuildToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      default:
        return (
          <DefaultToolCard
            toolId={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
            tunnelEnabled={tunnelEnabled}
          />
        );
    }
  };

  // Guard removed/unknown tools (e.g. disabled Cowork) to avoid crash on direct URL.
  if (!tool) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1 sm:px-0">
        <Link
          href="/dashboard/cli-tools"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary w-fit"
        >
          <Icon name="arrow_back" size={18} />
          Back to CLI Tools
        </Link>
        <p className="text-sm text-text-muted">Tool not found or disabled.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-1 sm:px-0">
      <Link
        href="/dashboard/cli-tools"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary w-fit"
      >
        <Icon name="arrow_back" size={18} />
        Back to CLI Tools
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text-main sm:text-2xl">
          {tool.name}
        </h1>
        <p className="text-sm text-text-muted">{tool.description}</p>
      </div>
      {loading ? (
        <section className="ledger-band">
          <header className="ledger-caption">
            <span className="ledger-number">01</span>
            <h2 className="font-semibold">Configuration</h2>
          </header>
          <div className="signal-row grid animate-pulse gap-3 px-4 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]">
            <span className="ledger-number">01</span>
            <span className="h-8 bg-[var(--color-surface-raised)]" />
            <span className="h-10 w-24 bg-[var(--color-surface-raised)]" />
          </div>
        </section>
      ) : (
        <>
          {renderSetupLedger()}
          <section className="ledger-band">
            <header className="ledger-caption">
              <span className="ledger-number">02</span>
              <h2 className="font-semibold">Client-specific configuration</h2>
            </header>
            <div className="p-4">{renderToolCard()}</div>
          </section>
        </>
      )}
    </div>
  );
}
