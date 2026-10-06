import { describe, expect, it } from "vitest";
import {
  filterDisabledPickerModels,
  normalizeCuratedModel,
  normalizeLiveModel,
  normalizeStaticModel,
} from "../../src/shared/utils/playgroundModels.js";

const connection = {
  id: "connection-1",
  provider: "openai-compatible-connection-1",
  name: "Compatible",
  providerSpecificData: { prefix: "demo" },
};

function sourceRows() {
  return [
    normalizeStaticModel({ id: "static-off" }, connection),
    normalizeStaticModel({ id: "static-on" }, connection),
    normalizeLiveModel("live-off", connection),
    normalizeLiveModel("live-on", connection),
    normalizeCuratedModel({ id: "curated-off" }, connection, "demo"),
    normalizeCuratedModel({ id: "curated-on" }, connection, "demo"),
  ];
}

describe("playground disabled-model filtering", () => {
  it("excludes static, live, and curated rows using alias + modelId keys", () => {
    const rows = filterDisabledPickerModels(sourceRows(), {
      demo: ["static-off", "curated-off"],
      [connection.provider]: ["live-off"],
    });

    expect(rows.map((row) => row.requestModel)).toEqual([
      "demo/static-on",
      "demo/live-on",
      "demo/curated-on",
    ]);
  });

  it.each([undefined, null, {}, { demo: [] }])(
    "fails open when the disabled map is absent or empty (%j)",
    (disabledByAlias) => {
      expect(filterDisabledPickerModels(sourceRows(), disabledByAlias)).toHaveLength(6);
    }
  );
});
