import { DefaultExecutor } from "./default.js";

/**
 * CodeBuddyExecutor — talks to https://copilot.tencent.com/v2/chat/completions
 *
 * CodeBuddy is OpenAI-compatible but rejects non-stream chat requests
 * (HTTP 400, code 11101 "Non-stream chat request is currently not supported").
 * The same-format (openai→openai) translator path leaves body.stream as the
 * client sent it, so we force it true here — 9router still re-aggregates the
 * SSE into a JSON response for non-streaming clients.
 */
export class CodeBuddyExecutor extends DefaultExecutor {
  constructor() {
    super("codebuddy-cn");
  }

  transformRequest(model, body, stream, credentials) {
    const transformed = super.transformRequest(model, body, stream, credentials);
    transformed.stream = true;

    // Tencent's content filter flags CLI agent system prompts ("You are Claude
    // Code, Anthropic's official CLI...") as prompt injection / sensitive content
    // and rejects the whole request. Detect agent system prompts (length catch-all
    // + identity-marker regex) and replace them with a neutral one, while leaving
    // legitimate user system prompts untouched. content may be a string or typed
    // blocks ([{type:"text",text}]) depending on the incoming client format, so
    // flatten before matching and preserve the original shape on replacement.
    const NEUTRAL_PROMPT = "You are a helpful AI assistant that helps with software engineering tasks.";
    const AGENT_PATTERN = /you are claude code|claude.?code.+official.+cli|anthropic.+official.+cli|anxthxropic.+official.+cli|you are (?:cursor|windsurf|cline|aider|continue|copilot|cody)|you are an? (?:ai )?(?:coding |code )?agent|cc_entrypoint\s*=\s*(?:cli|vscode|jetbrains|gui)|claude.?code.+issues|give feedback.+claude.?code|you are .{0,30}(?:powerful )?ai agent|orchestration capabilities|OhMyOpenCode|<agent-identity>|<Role>|<Behavior_Instructions>/i;
    const flatten = (content) =>
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((b) => (b && typeof b.text === "string" ? b.text : "")).join("\n")
          : "";
    if (Array.isArray(transformed.messages)) {
      transformed.messages = transformed.messages.map((message) => {
        if (!message || message.role !== "system") return message;
        const text = flatten(message.content);
        if (!text) return message;
        if (text.length > 2000 || AGENT_PATTERN.test(text)) {
          return typeof message.content === "string"
            ? { ...message, content: NEUTRAL_PROMPT }
            : { ...message, content: [{ type: "text", text: NEUTRAL_PROMPT }] };
        }
        return message;
      });
    }

    // CodeBuddy only surfaces model reasoning when the request carries the CLI's
    // OpenAI-style params: reasoning_effort + reasoning_summary:"auto". 9router's
    // thinking pipeline sets reasoning_effort only when the client asks, and never
    // sets reasoning_summary — so reasoning never shows. Mirror the CLI here.
    const eff = transformed.reasoning_effort;
    if (eff === "none" || eff === "off") {
      delete transformed.reasoning_effort; // gateway has no "none" — just omit
    } else if (eff) {
      // Client explicitly asked for reasoning — mirror the CLI's reasoning_summary
      // so CodeBuddy surfaces the model's reasoning.
      transformed.reasoning_summary = "auto";
    }
    // No reasoning requested: leave both unset. Forcing reasoning_effort:"medium"
    // + reasoning_summary on plain requests makes CodeBuddy trip its content
    // filter and return an error (#2071).

    // CodeBuddy is stream-only and ignores/breaks on response_format (models
    // answer in prose even with the schema in the user turn). Drop it entirely
    // and mirror the schema/directive into the last user text instead — the only
    // lever these models actually follow. (ported from srouter ac92a2b)
    const rf = transformed.response_format;
    if (rf && (rf.type === "json_schema" || rf.type === "json_object")) {
      delete transformed.response_format;
      let directive = rf.type === "json_object" ? "Respond only in valid JSON." : "";
      if (rf.type === "json_schema") {
        const schemaObj = rf.json_schema?.schema ?? rf.json_schema;
        if (schemaObj) {
          directive = "You must respond with valid JSON matching this schema:\n" +
            JSON.stringify(schemaObj, null, 2);
        }
      }
      if (directive) {
        const msgs = transformed.messages || [];
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m.role !== "user") continue;
          if (typeof m.content === "string") {
            m.content = m.content + "\n\n" + directive;
          } else if (Array.isArray(m.content)) {
            const lastText = [...m.content].reverse().find(b => b.type === "text");
            if (lastText) lastText.text = lastText.text + "\n\n" + directive;
            else m.content.push({ type: "text", text: directive });
          }
          break;
        }
      }
    }
    return transformed;
  }
}

export default CodeBuddyExecutor;
