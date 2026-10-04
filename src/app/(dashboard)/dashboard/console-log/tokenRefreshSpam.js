// Pattern-matched filter for token-refresh spam in the console-log stream.
// Matches the logger tags used by src/sse/utils/logger.js callers:
//   log.info/warn("TOKEN_REFRESH", ...)   (src/sse/services/tokenRefresh.js)
//   log.info/warn("BG_TOKEN_REFRESH", ...) (backgroundTokenRefresh.js)
// Reversible: callers keep the full buffer and only hide at render time;
// toggle OFF returns every line.

export const TOKEN_REFRESH_SPAM_PATTERNS = [
  /\[TOKEN_REFRESH\]/,
  /\[BG_TOKEN_REFRESH\]/,
  /Refreshing provider credentials proactively/,
  /Connection refresh (finished|failed)/,
  /Copilot token expiring soon/,
  /Credentials updated in localDb/,
];

export function isTokenRefreshSpam(line) {
  if (typeof line !== "string") return false;
  return TOKEN_REFRESH_SPAM_PATTERNS.some((re) => re.test(line));
}

export function filterTokenRefreshSpam(lines, hideSpam = true) {
  if (!Array.isArray(lines)) return { visible: [], hiddenCount: 0 };
  if (!hideSpam) return { visible: [...lines], hiddenCount: 0 };
  const visible = [];
  let hiddenCount = 0;
  for (const line of lines) {
    if (isTokenRefreshSpam(line)) hiddenCount += 1;
    else visible.push(line);
  }
  return { visible, hiddenCount };
}
