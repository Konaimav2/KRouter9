import Link from "next/link";
import CopyButton from "./CopyButton";
import DocsJumpMenu from "./DocsJumpMenu";

export const metadata = {
  title: "API Reference — KRouter9",
  description: "KRouter9 OpenAI-compatible API reference",
};

const ENDPOINTS = [
  ["Chat", [
    { method: "POST", path: "/v1/chat/completions", description: "OpenAI-compatible chat completion. Supports stream=true, tools, and response_format.", body: { model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "Say hello in five words." }] }, response: { id: "chatcmpl_example", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "Hello, hope you are well!" }, finish_reason: "stop" }] } },
    { method: "POST", path: "/v1/api/chat", description: "Alternate chat entrypoint.", body: { model: "anthropic/claude-sonnet-4-5", messages: [{ role: "user", content: "Summarize: Routing keeps clients portable." }] }, response: { choices: [{ message: { role: "assistant", content: "Routing preserves client portability." } }] } },
  ]],
  ["Responses", [
    { method: "POST", path: "/v1/responses", description: "Responses API completion; previous_response_id for continuation.", body: { model: "openai/gpt-4o-mini", input: "Name one benefit of an API gateway." }, response: { id: "resp_example", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Centralized routing." }] }] } },
    { method: "POST", path: "/v1/responses/compact", description: "Compact a Responses conversation.", body: { model: "openai/gpt-4o-mini", input: [{ role: "user", content: "Remember that the project is named Atlas." }, { role: "assistant", content: "Understood." }] }, response: { id: "resp_compact_example", object: "response.compaction", compacted: true } },
  ]],
  ["Messages (Claude)", [
    { method: "POST", path: "/v1/messages", description: "Anthropic Messages API.", extraHeaders: { "anthropic-version": "2023-06-01" }, body: { model: "anthropic/claude-sonnet-4-5", max_tokens: 64, messages: [{ role: "user", content: "What is 2 + 2?" }] }, response: { id: "msg_example", type: "message", role: "assistant", content: [{ type: "text", text: "4" }], stop_reason: "end_turn" } },
    { method: "POST", path: "/v1/messages/count_tokens", description: "Count input tokens.", extraHeaders: { "anthropic-version": "2023-06-01" }, body: { model: "anthropic/claude-sonnet-4-5", messages: [{ role: "user", content: "Count these tokens." }] }, response: { input_tokens: 6 } },
  ]],
  ["Embeddings", [
    { method: "POST", path: "/v1/embeddings", description: "Create embeddings.", body: { model: "openai/text-embedding-3-small", input: "Routing made simple." }, response: { object: "list", data: [{ object: "embedding", index: 0, embedding: [0.012, -0.034, 0.056] }], model: "text-embedding-3-small" } },
  ]],
  ["Images / Audio / Video", [
    { method: "POST", path: "/v1/images/generations", description: "Generate an image.", body: { model: "openai/gpt-image-1", prompt: "A red paper kite over a blue sea", size: "1024x1024" }, response: { created: 1760000000, data: [{ url: "https://example.invalid/generated/kite.png" }] } },
    { method: "POST", path: "/v1/audio/speech", description: "Text-to-speech.", body: { model: "openai/tts-1", voice: "alloy", input: "KRouter9 is ready." }, responseText: "Binary audio/mpeg body (save as speech.mp3).", output: "speech.mp3" },
    { method: "POST", path: "/v1/audio/transcriptions", description: "Speech-to-text (multipart).", multipart: { file: "@speech.mp3", model: "openai/whisper-1" }, response: { text: "KRouter9 is ready." } },
    { method: "GET", path: "/v1/audio/voices", description: "List TTS voices.", response: { object: "list", data: [{ id: "alloy", name: "Alloy" }] } },
    { method: "POST", path: "/v1/videos/generations", description: "Create a video job.", body: { model: "video/sora", prompt: "A paper kite crossing a sunrise", seconds: 5 }, response: { id: "video_example_123", object: "video", status: "queued" } },
    { method: "GET", path: "/v1/videos/{id}", samplePath: "/v1/videos/video_example_123", description: "Get a video job status.", response: { id: "video_example_123", object: "video", status: "completed", url: "https://example.invalid/generated/video.mp4" } },
    { method: "POST", path: "/v1/videos/edits", description: "Edit a video.", body: { model: "video/sora", video: "video_example_123", prompt: "Change the sky to sunset" }, response: { id: "video_edit_456", object: "video", status: "queued" } },
    { method: "POST", path: "/v1/videos/extensions", description: "Extend a video.", body: { model: "video/sora", video: "video_example_123", prompt: "Continue for five seconds", seconds: 5 }, response: { id: "video_extension_789", object: "video", status: "queued" } },
    { method: "POST", path: "/v1/ocr", description: "OCR an image.", body: { model: "ocr/default", image_url: "https://example.invalid/receipt.png" }, response: { text: "TOTAL 24.50", pages: 1 } },
    { method: "POST", path: "/v1/music", description: "Music generation (returns 501 in this build).", body: { model: "music/default", prompt: "A calm piano loop" }, response: { error: { message: "Music generation is not implemented in this build.", type: "not_implemented", code: "not_implemented" } } },
  ]],
  ["Search / Ranking / Moderation", [
    { method: "POST", path: "/v1/search", description: "Web search.", body: { query: "KRouter9 documentation", max_results: 3 }, response: { results: [{ title: "KRouter9", url: "https://example.invalid/docs", snippet: "API gateway documentation." }] } },
    { method: "POST", path: "/v1/web/fetch", description: "Fetch and extract a web page.", body: { url: "https://example.com", format: "markdown" }, response: { url: "https://example.com", title: "Example Domain", content: "# Example Domain" } },
    { method: "POST", path: "/v1/rerank", description: "Rerank documents.", body: { model: "rerank/default", query: "API routing", documents: ["A guide to gardening", "A guide to routing APIs"] }, response: { results: [{ index: 1, relevance_score: 0.98 }, { index: 0, relevance_score: 0.03 }] } },
    { method: "POST", path: "/v1/moderations", description: "Content moderation.", body: { model: "moderation/default", input: "A friendly greeting." }, response: { id: "modr_example", results: [{ flagged: false, categories: {} }] } },
  ]],
  ["Models", [
    { method: "GET", path: "/v1/models", description: "List available models.", response: { object: "list", data: [{ id: "openai/gpt-4o-mini", object: "model", owned_by: "openai" }] } },
    { method: "GET", path: "/v1/models/{model}", samplePath: "/v1/models/openai%2Fgpt-4o-mini", description: "Model detail.", response: { id: "openai/gpt-4o-mini", object: "model", owned_by: "openai" } },
  ]],
];

const slug = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const json = (value) => JSON.stringify(value, null, 2);

function curlExample(endpoint) {
  const path = endpoint.samplePath || endpoint.path;
  const lines = [
    `curl${endpoint.method === "GET" ? "" : ` -X ${endpoint.method}`} "$BASE${path}"`,
    '  -H "Authorization: Bearer sk-test-example"',
  ];
  Object.entries(endpoint.extraHeaders || {}).forEach(([name, value]) => {
    lines.push(`  -H "${name}: ${value}"`);
  });
  if (endpoint.multipart) {
    Object.entries(endpoint.multipart).forEach(([name, value]) => {
      lines.push(`  -F "${name}=${value}"`);
    });
  } else if (endpoint.body) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push(`  --data '${JSON.stringify(endpoint.body)}'`);
  }
  if (endpoint.output) lines.push(`  --output ${endpoint.output}`);
  return lines.join(" \\\n");
}

function clientExample(endpoint) {
  const path = endpoint.samplePath || endpoint.path;
  if (endpoint.multipart) {
    return `const form = new FormData();\nform.append("file", fileInput.files[0]);\nform.append("model", "${endpoint.multipart.model}");\n\nconst response = await fetch(\`${"${baseUrl}"}${path}\`, {\n  method: "POST",\n  headers: { Authorization: "Bearer sk-test-example" },\n  body: form,\n});\nconst result = await response.json();`;
  }
  const headers = {
    Authorization: "Bearer sk-test-example",
    ...endpoint.extraHeaders,
    ...(endpoint.body ? { "Content-Type": "application/json" } : {}),
  };
  const options = [
    `method: "${endpoint.method}"`,
    `headers: ${JSON.stringify(headers, null, 2)}`,
  ];
  if (endpoint.body) options.push(`body: JSON.stringify(${json(endpoint.body)})`);
  return `const baseUrl = "http://localhost:20128";\nconst response = await fetch(\`${"${baseUrl}"}${path}\`, {\n  ${options.join(",\n  ")}\n});\n${endpoint.output ? "const audio = await response.blob();" : "const result = await response.json();"}`;
}

const QUICKSTART = curlExample(ENDPOINTS[0][1][0]);

function CodeExample({ label, text, language = "json" }) {
  return (
    <div className="overflow-hidden border border-[var(--color-border)] bg-[var(--color-code-bg)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--p-carbon-300)]">
        <span className="data-text">{label}</span>
        <CopyButton label={`Copy ${label}`} text={text} />
      </div>
      <pre className="overflow-x-auto p-4 text-xs text-[var(--p-carbon-100)]"><code className={`language-${language}`}>{text}</code></pre>
    </div>
  );
}

export default function DocsPage() {
  const index = [
    ["quickstart", "Quickstart"],
    ["authentication", "Authentication"],
    ["errors", "Errors"],
    ...ENDPOINTS.map(([title]) => [slug(title), title]),
  ];

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-text)]">
      <a href="#docs-main" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--workbar-border)] bg-[var(--workbar-bg)]">
        <div className="mx-auto flex min-h-16 max-w-[var(--layout-content-max)] flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:py-0 lg:px-8">
          <img src="/krouter9.png" alt="" className="size-8 object-contain" />
          <span className="font-semibold">KRouter9</span><span className="text-[var(--color-text-subtle)]">/</span>
          <span className="text-sm text-[var(--color-text-muted)]">API Reference</span>
          <nav className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
            <Link href="/dashboard" className="rounded-[var(--radius-sm)] border border-[var(--button-border)] px-3 py-2 text-sm">Dashboard</Link>
            <a href="/api/docs/openapi.yaml" className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-on-primary)]">OpenAPI YAML</a>
          </nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-[var(--layout-content-max)] gap-8 px-4 py-8 lg:grid-cols-[220px_minmax(0,var(--layout-reading-max))_180px] lg:px-8">
        <aside className="hidden lg:block"><nav aria-label="Documentation sections" className="sticky top-24 border-l border-[var(--color-border)] pl-4"><p className="mb-3 text-xs font-semibold tracking-[var(--tracking-label)] text-[var(--color-text-subtle)]">Sections</p><DocsJumpMenu sections={index} variant="links" /></nav></aside>
        <main id="docs-main" tabIndex={-1} className="min-w-0">
          <DocsJumpMenu sections={index} />
          <section id="quickstart" tabIndex={-1} className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] scroll-mt-24">
            <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3"><span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">01</span><h1 className="text-xl font-semibold">Quickstart</h1></header>
            <div className="space-y-4 p-5"><p className="text-sm leading-6 text-[var(--color-text-muted)]">Set <code>$BASE</code> to your gateway origin. Create an API key in Endpoint &amp; Key. Replace the placeholder key before sending the request. Add <code>&quot;stream&quot;: true</code> for server-sent events.</p><CodeExample label="shell" text={QUICKSTART} language="shell" /></div>
          </section>
          <section id="authentication" tabIndex={-1} className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] mt-8 scroll-mt-24"><header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3"><span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">02</span><h2 className="font-semibold">Authentication</h2></header><ul className="list-disc space-y-2 p-5 pl-10 text-sm leading-6 text-[var(--color-text-muted)]"><li><strong className="text-[var(--color-text)]">LLM API</strong> — send <code>Authorization: Bearer &lt;key&gt;</code> or <code>x-api-key</code>. The Gemini-native <code>/v1beta/*</code> surface also accepts <code>x-goog-api-key</code> and <code>?key=</code>.</li><li><strong className="text-[var(--color-text)]">Dashboard API</strong> — same-origin session cookie/JWT or <code>x-9r-cli-token</code>.</li><li>Per-key limits: RPM, TPM, model allow/deny, credit and token quota (0 = unlimited).</li></ul></section>
          <section id="errors" tabIndex={-1} className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] mt-8 scroll-mt-24"><header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3"><span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">03</span><h2 className="font-semibold">Errors</h2></header><div className="space-y-3 p-5"><pre className="overflow-x-auto bg-[var(--color-code-bg)] p-4 text-xs text-[var(--p-carbon-100)]"><code>{`{ "error": { "message": "...", "type": "...", "code": "..." } }`}</code></pre><p className="text-sm text-[var(--color-text-muted)]">400 bad request · 401 missing/invalid key · 402 credit exhausted · 403 model not allowed · 404 model not found · 429 rate/token limit · 502/503/504 upstream failure</p></div></section>
          {ENDPOINTS.map(([title, endpoints], sectionIndex) => (
            <section id={slug(title)} key={title} tabIndex={-1} className="min-w-0 overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] mt-8 scroll-mt-24">
              <header className="flex min-h-11 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3"><span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">{String(sectionIndex + 4).padStart(2, "0")}</span><h2 className="font-semibold">{title}</h2></header>
              <div className="divide-y divide-[var(--color-border)]">
                {endpoints.map((endpoint) => {
                  const curl = curlExample(endpoint);
                  const client = clientExample(endpoint);
                  const response = endpoint.responseText || json(endpoint.response);
                  return (
                    <article key={endpoint.path} className="space-y-4 px-4 py-5">
                      <div className="grid gap-2 sm:grid-cols-[64px_minmax(180px,1fr)_minmax(180px,1fr)_auto] sm:items-center">
                        <span className={`data-text rounded-[var(--radius-xs)] border px-2 py-1 text-center text-xs font-semibold ${endpoint.method === "GET" ? "border-[var(--color-info)] text-[var(--color-info)]" : "border-[var(--color-success)] text-[var(--color-success)]"}`}>{endpoint.method}</span>
                        <code className="break-all text-sm">{endpoint.path}</code>
                        <span className="text-sm text-[var(--color-text-muted)]">{endpoint.description}</span>
                        <CopyButton label={`Copy ${endpoint.method} ${endpoint.path} URL`} path={endpoint.path} />
                      </div>
                      <div className="grid gap-3 xl:grid-cols-2"><CodeExample label="curl request" text={curl} language="shell" /><CodeExample label="response" text={response} /></div>
                      <CodeExample label="JavaScript client" text={client} language="javascript" />
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </main>
        <aside className="hidden xl:block"><div className="sticky top-24 text-sm text-[var(--color-text-muted)]"><p className="font-medium text-[var(--color-text)]">On this page</p><p className="mt-2">Every endpoint includes a copyable curl request, representative response, and JavaScript client snippet. Examples use non-secret placeholder credentials.</p></div></aside>
      </div>
    </div>
  );
}
