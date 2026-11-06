import { describe, expect, it } from "vitest";
import { assertSpikeTarget } from "./spike-target";

const spikeEndpoint = "ep-winter-wave-b5uo4p26";

describe("spike database target guard", () => {
  it("accepts the expected direct spike endpoint", () => {
    expect(() =>
      assertSpikeTarget(
        `postgresql://user@${spikeEndpoint}.us-east-2.aws.neon.tech/db`,
        "SPIKE_DIRECT_URL",
      ),
    ).not.toThrow();
  });

  it("normalizes the pooler suffix before checking the spike endpoint", () => {
    expect(() =>
      assertSpikeTarget(
        `postgresql://user@${spikeEndpoint}-pooler.us-east-2.aws.neon.tech/db`,
        "SPIKE_DATABASE_URL",
      ),
    ).not.toThrow();
  });

  it("rejects another Neon endpoint before a database client is created", () => {
    expect(() =>
      assertSpikeTarget(
        "postgresql://user@ep-production.us-east-2.aws.neon.tech/db",
        "SPIKE_DIRECT_URL",
      ),
    ).toThrow(/expected spike endpoint/);
  });

  it("rejects a direct host when the pooled variable is selected", () => {
    expect(() =>
      assertSpikeTarget(
        `postgresql://user@${spikeEndpoint}.us-east-2.aws.neon.tech/db`,
        "SPIKE_DATABASE_URL",
      ),
    ).toThrow(/pooled Neon connection host/);
  });
});
