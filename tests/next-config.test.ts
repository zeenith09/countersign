import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

describe("Next.js security headers", () => {
  it("sets non-CSP security headers on all paths", async () => {
    const rules = await nextConfig.headers();
    const rule = rules.find(({ source }) => source === "/:path*");

    expect(rule).toBeDefined();
    expect(rule?.headers).toEqual(expect.arrayContaining([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]));
    expect(rule?.headers.some(({ key }) => key.toLowerCase() === "content-security-policy")).toBe(false);
  });
});
