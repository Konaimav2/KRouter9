import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const componentPath = process.env.PROVIDER_LIMITS_SOURCE || resolve(
  process.cwd(),
  "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.js",
);
const source = readFileSync(componentPath, "utf8");

function loadFunction(name) {
  const start = source.indexOf(`export async function ${name}`) >= 0
    ? source.indexOf(`export async function ${name}`)
    : source.indexOf(`export function ${name}`);
  if (start < 0) throw new Error(`${name} is not exported`);

  const functionStart = source.indexOf("function", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let cursor = source.indexOf("(", functionStart); cursor < source.length; cursor += 1) {
    if (source[cursor] === "(") parameterDepth += 1;
    if (source[cursor] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      bodyStart = source.indexOf("{", cursor + 1);
      break;
    }
  }
  let depth = 0;
  let end = bodyStart;
  for (; end < source.length; end += 1) {
    if (source[end] === "{") depth += 1;
    if (source[end] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  const declarationStart = source.lastIndexOf("export ", functionStart);
  const asyncPrefix = source.slice(declarationStart, functionStart).includes("async")
    ? "async "
    : "";
  return Function(`return (${asyncPrefix}${source.slice(functionStart, end + 1)})`)();
}

const fetchConnectionsPage = loadFunction("fetchConnectionsPage");
const toggleExpiringSort = loadFunction("toggleExpiringSort");

const request = {
  targetPage: 3,
  pageSize: 24,
  accountFilter: "all",
  providerFilter: "all",
};

function successfulFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ connections: [] }),
  });
}

describe("ProviderLimits server sort", () => {
  it("requests expiring order when expiring-first is on", async () => {
    const fetchMock = successfulFetch();

    await fetchConnectionsPage(
      { ...request, expiringFirst: true },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("sort")).toBe("expiring");
  });

  it("requests A-Z name order when expiring-first is off", async () => {
    const fetchMock = successfulFetch();

    await fetchConnectionsPage(
      { ...request, expiringFirst: false },
      fetchMock,
    );

    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("sort")).toBe("name");
  });

  it("resets pagination to page one when toggled", () => {
    const setPage = vi.fn();
    const setExpiringFirst = vi.fn();

    toggleExpiringSort(setPage, setExpiringFirst);

    expect(setPage).toHaveBeenCalledWith(1);
    expect(setExpiringFirst).toHaveBeenCalledOnce();
    expect(setExpiringFirst.mock.calls[0][0](false)).toBe(true);
  });
});

describe("ProviderLimits reset axis", () => {
  it("renders only the two reset labels without stray marker elements", () => {
    const axis = source.match(
      /<div className="[^"]*border-b border-border[^"]*">([\s\S]*?)<\/div>/,
    )?.[1];

    expect(axis).toBeDefined();
    expect(axis?.match(/Earlier reset/g)).toHaveLength(1);
    expect(axis?.match(/Later or unknown reset/g)).toHaveLength(1);
    expect(axis?.match(/aria-hidden|h-2 w-2|bg-primary/g) ?? []).toHaveLength(0);
  });
});
