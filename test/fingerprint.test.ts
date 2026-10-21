import { describe, expect, it } from "vitest";
import { NonSerializableError } from "../src/core/errors.js";
import { canonicalize, fingerprintValue } from "../src/core/fingerprint.js";

const GOLDEN = [
  {
    name: "key order",
    value: { z: 1, a: { b: 2, a: [3, null, "x"] } },
    canonical: '{"a":{"a":[3,null,"x"],"b":2},"z":1}',
    hash: "7e7556bc524eb870f03bb54a755984ab1aae2559a716a49b149bc5ab97302635",
  },
  {
    name: "numbers",
    value: { zero: -0, big: 1e21, small: 1e-7, float: 1.5, int: 42 },
    canonical: '{"big":1e+21,"float":1.5,"int":42,"small":1e-7,"zero":0}',
    hash: "41c0c3e2fa7d474a50a43881ac93379c58b6e546bcff800f6986760dda990a97",
  },
  {
    name: "unicode",
    value: { 名字: "张三", emoji: "🙂", quote: 'he said "hi"' },
    canonical: '{"emoji":"🙂","quote":"he said \\"hi\\"","名字":"张三"}',
    hash: "7a2ebaf69730abbcaa83b4bd9ad8ea8f15dddfb2ca4780b7ee7817ecfa790545",
  },
  {
    name: "undefined",
    value: { a: undefined, b: [undefined, 1], c: null },
    canonical: '{"b":[null,1],"c":null}',
    hash: "64bc30bfd62744beca4ce123f3280e686d526f23736e52728511a172d4d53601",
  },
  {
    name: "nested tools",
    value: {
      model: "gpt-4.1-mini",
      tools: [
        {
          type: "function",
          function: {
            name: "b",
            parameters: { type: "object", properties: { z: { type: "string" }, a: { type: "integer" } } },
          },
        },
        { type: "function", function: { name: "a", parameters: {} } },
      ],
      temperature: 0.2,
    },
    canonical:
      '{"model":"gpt-4.1-mini","temperature":0.2,"tools":[{"function":{"name":"b","parameters":{"properties":{"a":{"type":"integer"},"z":{"type":"string"}},"type":"object"}},"type":"function"},{"function":{"name":"a","parameters":{}},"type":"function"}]}',
    hash: "41405876351535117e783928f18198062323d1cf9ace8d863db7fc45f590c141",
  },
] as const;

describe("canonicalize", () => {
  for (const vector of GOLDEN) {
    it(`matches golden vector: ${vector.name}`, () => {
      expect(canonicalize(vector.value)).toBe(vector.canonical);
      expect(fingerprintValue(vector.value)).toBe(vector.hash);
    });
  }

  it("ignores object key insertion order but preserves array order", () => {
    expect(fingerprintValue({ a: 1, b: 2 })).toBe(fingerprintValue({ b: 2, a: 1 }));
    expect(fingerprintValue([1, 2])).not.toBe(fingerprintValue([2, 1]));
  });

  it("accepts null-prototype objects", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.a = 1;
    expect(canonicalize(value)).toBe('{"a":1}');
  });

  it("rejects NaN and Infinity with a path", () => {
    expect(() => canonicalize({ nested: [Number.NaN] })).toThrowError(NonSerializableError);
    try {
      canonicalize({ nested: [Number.NaN] });
    } catch (error) {
      expect((error as NonSerializableError).path).toBe("$.nested[0]");
    }
    expect(() => canonicalize({ value: Infinity })).toThrowError(NonSerializableError);
  });

  it("rejects BigInt, functions, symbols, and class instances", () => {
    expect(() => canonicalize({ value: 1n })).toThrowError(NonSerializableError);
    expect(() => canonicalize({ value: () => 1 })).toThrowError(NonSerializableError);
    expect(() => canonicalize({ value: Symbol("x") })).toThrowError(NonSerializableError);
    expect(() => canonicalize({ value: new Date(0) })).toThrowError(NonSerializableError);
  });

  it("rejects circular references", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalize(value)).toThrowError(NonSerializableError);
  });

  it("rejects an undefined root", () => {
    expect(() => canonicalize(undefined)).toThrowError(NonSerializableError);
  });

  it("rejects enumerable symbol keys", () => {
    const symbol = Symbol("secret");
    const value = { [symbol]: 1 };
    expect(() => canonicalize(value)).toThrowError(NonSerializableError);
  });
});
