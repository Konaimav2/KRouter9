"use client";

import { useState } from "react";
import { Button } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

const SETUP_URL = "https://raw.githubusercontent.com/Konaimav2/KRouter9/main/scripts/krouter9-setup.sh";
const STEPS = [
  { title: "Download", command: `curl --fail --show-error --silent --location '${SETUP_URL}' --output krouter9-setup.sh`, detail: "Download to a new working directory. Do not pipe an unreviewed script to a shell." },
  { title: "Review", command: "less krouter9-setup.sh", detail: "Read the script before running it. It installs krouter9@latest through npm, whose install hooks run code, and creates a private, local-only launch scaffold." },
  { title: "Run", command: "bash krouter9-setup.sh", detail: "Type yes at the prompt to approve installation. No administrator escalation and no automatic gateway start. Existing configuration is preserved." },
];

export default function KRouter9ToolCard() {
  const { copy } = useCopyToClipboard();
  const [copiedStep, setCopiedStep] = useState(null);
  const [copyError, setCopyError] = useState(false);
  const copyCommand = async (command, title) => {
    try {
      await copy(command);
      setCopyError(false);
      setCopiedStep(title);
    } catch {
      setCopyError(true);
      setCopiedStep(null);
    }
  };
  return (
    <section aria-label="KRouter9 CLI setup" className="min-w-0 space-y-4">
      <p className="text-sm text-text-muted">Install the KRouter9 gateway on your own machine. The dashboard never runs these commands.</p>
      <ol className="divide-y divide-border">
        {STEPS.map((step) => (
          <li key={step.title} className="min-w-0 space-y-2 py-3">
            <h3 className="text-sm font-semibold text-text-primary">{step.title}</h3>
            <p className="text-sm text-text-muted">{step.detail}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto border border-border bg-[var(--color-code-bg)] p-3 text-xs"><code>{step.command}</code></pre>
              <Button variant="secondary" className="min-h-11" aria-label={`Copy ${step.title.toLowerCase()} command`} onClick={() => copyCommand(step.command, step.title)}>{copiedStep === step.title ? "Copied" : "Copy"}</Button>
            </div>
          </li>
        ))}
      </ol>
      {copyError && <p role="alert" className="text-sm text-danger">Unable to copy. Select the command and copy it manually.</p>}
      <p className="text-sm text-text-muted">Start explicitly with <code>bash ~/.krouter9/start-local.sh</code>. The scaffold binds to 127.0.0.1:20128. Configure providers and access in the local dashboard before exposing it remotely.</p>
    </section>
  );
}
