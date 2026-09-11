import Link from "next/link";

export const metadata = {
  title: "API Reference — KRouter9",
  description: "KRouter9 OpenAI-compatible API reference",
};

const SECTIONS = [
  {
    title: "Chat",
    endpoints: [
      { method: "POST", path: "/v1/chat/completions", desc: "OpenAI-compatible chat completion. Supports stream=true, tools, and response_format." },
      { method: "POST", path: "/v1/api/chat", desc: "Alternate chat entrypoint." },
    ],
  },
  {
    title: "Responses",
    endpoints: [
      { method: "POST", path: "/v1/responses", desc: "Responses API completion; previous_response_id for continuation." },
      { method: "POST", path: "/v1/responses/compact", desc: "Compact a Responses conversation." },
    ],
  },
  {
    title: "Messages (Claude)",
    endpoints: [
      { method: "POST", path: "/v1/messages", desc: "Anthropic Messages API." },
      { method: "POST", path: "/v1/messages/count_tokens", desc: "Count input tokens." },
    ],
  },
  {
    title: "Embeddings",
    endpoints: [
      { method: "POST", path: "/v1/embeddings", desc: "Create embeddings." },
    ],
  },
  {
    title: "Images / Audio / Video",
    endpoints: [
      { method: "POST", path: "/v1/images/generations", desc: "Generate an image." },
      { method: "POST", path: "/v1/audio/speech", desc: "Text-to-speech." },
      { method: "POST", path: "/v1/audio/transcriptions", desc: "Speech-to-text (multipart)." },
      { method: "GET", path: "/v1/audio/voices", desc: "List TTS voices." },
      { method: "POST", path: "/v1/videos/generations", desc: "Create a video job." },
      { method: "GET", path: "/v1/videos/{id}", desc: "Get a video job status." },
      { method: "POST", path: "/v1/videos/edits", desc: "Edit a video." },
      { method: "POST", path: "/v1/videos/extensions", desc: "Extend a video." },
      { method: "POST", path: "/v1/ocr", desc: "OCR an image." },
      { method: "POST", path: "/v1/music", desc: "Music generation (returns 501 in this build)." },
    ],
  },
  {
    title: "Search / Ranking / Moderation",
    endpoints: [
      { method: "POST", path: "/v1/search", desc: "Web search." },
      { method: "POST", path: "/v1/web/fetch", desc: "Fetch and extract a web page." },
      { method: "POST", path: "/v1/rerank", desc: "Rerank documents." },
      { method: "POST", path: "/v1/moderations", desc: "Content moderation." },
    ],
  },
  {
    title: "Models",
    endpoints: [
      { method: "GET", path: "/v1/models", desc: "List available models." },
      { method: "GET", path: "/v1/models/{model}", desc: "Model detail." },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-bg text-text-main">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold sm:text-3xl">KRouter9 API Reference</h1>
            <a
              href="/api/docs/openapi.yaml"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2"
            >
              OpenAPI (YAML)
            </a>
          </div>
          <p className="mt-2 text-sm text-text-muted">
            OpenAI-compatible routing gateway. Point any OpenAI/Claude/Gemini client at the base
            URL and authenticate with your API key.
          </p>
        </header>

        <section className="mb-8 rounded-lg border border-border bg-surface-2 p-4">
          <h2 className="mb-2 font-medium">Authentication</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
            <li>
              <strong className="text-text-primary">LLM API</strong> — send{" "}
              <code className="rounded bg-black/10 px-1 dark:bg-white/10">Authorization: Bearer &lt;key&gt;</code>{" "}
              or <code className="rounded bg-black/10 px-1 dark:bg-white/10">x-api-key</code>.
              The Gemini-native <code className="rounded bg-black/10 px-1 dark:bg-white/10">/v1beta/*</code> surface
              also accepts <code className="rounded bg-black/10 px-1 dark:bg-white/10">x-goog-api-key</code> and{" "}
              <code className="rounded bg-black/10 px-1 dark:bg-white/10">?key=</code>.
            </li>
            <li>
              <strong className="text-text-primary">Dashboard API</strong> — same-origin session cookie/JWT or{" "}
              <code className="rounded bg-black/10 px-1 dark:bg-white/10">x-9r-cli-token</code>.
            </li>
            <li>Per-key limits: RPM, TPM, model allow/deny, credit and token quota (0 = unlimited).</li>
          </ul>
        </section>

        <section className="mb-8 rounded-lg border border-border p-4">
          <h2 className="mb-2 font-medium">Errors</h2>
          <pre className="overflow-x-auto rounded bg-black/20 p-3 text-xs dark:bg-black/40">
{`{ "error": { "message": "...", "type": "...", "code": "..." } }`}
          </pre>
          <p className="mt-2 text-sm text-text-muted">
            400 bad request · 401 missing/invalid key · 402 credit exhausted · 403 model not allowed ·
            404 model not found · 429 rate/token limit · 502/503/504 upstream failure
          </p>
        </section>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mb-8">
            <h2 className="mb-3 font-medium">{section.title}</h2>
            <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {section.endpoints.map((e) => (
                <div key={e.path} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className={`w-16 shrink-0 rounded px-2 py-0.5 text-center text-xs font-semibold ${e.method === "GET" ? "bg-blue-500/15 text-blue-500" : "bg-green-500/15 text-green-500"}`}>
                    {e.method}
                  </span>
                  <code className="text-sm text-text-primary">{e.path}</code>
                  <span className="text-xs text-text-muted sm:ml-auto sm:text-right">{e.desc}</span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <footer className="border-t border-border pt-6 text-sm text-text-muted">
          <Link href="/dashboard" className="text-primary hover:underline">
            ← Back to dashboard
          </Link>
          <span className="ml-3">Full dashboard endpoint reference: docs/API-AUTOMATION.md</span>
        </footer>
      </div>
    </div>
  );
}
