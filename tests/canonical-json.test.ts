import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/lib/audit/canonical-json";

describe("canonicalJson", () => {
  it("uses the same sorted output for different object key orders", () => {
    expect(canonicalJson({ zebra: 1, apple: 2 })).toBe('{"apple":2,"zebra":1}');
    expect(canonicalJson({ apple: 2, zebra: 1 })).toBe(canonicalJson({ zebra: 1, apple: 2 }));
  });

  it("orders object keys by code unit for stable audit hashes", () => {
    expect(canonicalJson({ b: 1, B: 2, a: 3, _x: 4, "10": 5, "9": 6 }))
      .toBe('{"10":5,"9":6,"B":2,"_x":4,"a":3,"b":1}');
  });

  it("sorts nested objects while preserving nested array order", () => {
    expect(canonicalJson({ z: [{ z: 1, a: 2 }, [{ b: null, a: true }, 3]], a: "text" }))
      .toBe('{"a":"text","z":[{"a":2,"z":1},[{"a":true,"b":null},3]]}');
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("serializes empty objects, empty arrays, and null", () => {
    expect(canonicalJson({ emptyObject: {}, emptyArray: [], value: null }))
      .toBe('{"emptyArray":[],"emptyObject":{},"value":null}');
  });

  it("repeatedly serializes the same data identically", () => {
    const data = { z: [{ b: false, a: "quoted \"value\"" }], a: 12.5 };
    expect(canonicalJson(data)).toBe(canonicalJson(data));
    expect(canonicalJson(data)).toBe('{"a":12.5,"z":[{"a":"quoted \\"value\\"","b":false}]}');
  });

  it("rejects values that JSON would omit or alter", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow(TypeError);
    expect(() => canonicalJson([undefined])).toThrow(TypeError);
    expect(() => canonicalJson(Array(1))).toThrow(TypeError);
    expect(() => canonicalJson(NaN)).toThrow(TypeError);
    expect(() => canonicalJson(BigInt(1))).toThrow(TypeError);
    expect(() => canonicalJson(new Date("2026-01-01T00:00:00.000Z"))).toThrow(TypeError);
    expect(() => canonicalJson({ [Symbol("hidden")]: 1 })).toThrow(TypeError);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(TypeError);
  });

  it("preserves negative zero rather than silently changing it", () => {
    expect(canonicalJson(-0)).toBe("-0");
    expect(Object.is(JSON.parse(canonicalJson(-0)), -0)).toBe(true);
  });
});
