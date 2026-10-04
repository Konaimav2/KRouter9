export default {
  id: "jina-reader-free",
  alias: "jina-reader-free",
  display: {
    name: "Jina Reader Free",
    icon: "menu_book",
    color: "#000000",
    textIcon: "JF",
    website: "https://jina.ai/reader"
  },
  category: "freeTier",
  authType: "none",
  serviceKinds: [
    "webFetch"
  ],
  noAuth: true,
  fetchConfig: {
    baseUrl: "https://r.jina.ai",
    method: "GET",
    authType: "none",
    authHeader: "none",
    costPerQuery: 0,
    freeMonthlyQuota: 999999,
    formats: [
      "markdown",
      "text",
      "html"
    ],
    maxCharacters: 200000,
    timeoutMs: 30000
  }
};
