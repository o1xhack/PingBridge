import { describe, expect, it } from "vitest";
import { expandEnv, normalizeConfig } from "../config.js";

describe("config", () => {
  it("expands environment placeholders", () => {
    expect(expandEnv("token: ${PINGBRIDGE_TOKEN}", { PINGBRIDGE_TOKEN: "secret" })).toBe("token: secret");
  });

  it("validates target channel references", () => {
    expect(() =>
      normalizeConfig({
        channels: {
          bark_phone: { type: "bark", deviceKey: "device" }
        },
        targets: {
          me: { channels: ["missing"] }
        }
      })
    ).toThrow('Target "me" references unknown channel "missing".');
  });
});
