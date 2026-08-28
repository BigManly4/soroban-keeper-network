import { describe, expect, it } from "vitest";
import { fromUnixSeconds, toBigInt, toUnixSeconds } from "../src/core/numbers.js";

describe("toBigInt (CONVENTIONS.md decision 1)", () => {
  it("passes a bigint through unchanged", () => {
    expect(toBigInt(123n, "x")).toBe(123n);
  });

  it("converts a safe-integer number to bigint", () => {
    expect(toBigInt(42, "x")).toBe(42n);
  });

  it("rejects a number above Number.MAX_SAFE_INTEGER instead of truncating", () => {
    expect(() => toBigInt(Number.MAX_SAFE_INTEGER + 1, "reward")).toThrow(RangeError);
  });
});

describe("timestamp normalization (CONVENTIONS.md decision 2)", () => {
  it("accepts a Date and converts to Unix seconds", () => {
    const date = new Date("2030-01-01T00:00:00Z");
    expect(toUnixSeconds(date, "deadline")).toBe(BigInt(Math.floor(date.getTime() / 1000)));
  });

  it("accepts a plain number of Unix seconds directly", () => {
    expect(toUnixSeconds(1_893_456_000, "deadline")).toBe(1_893_456_000n);
  });

  it("accepts a bigint of Unix seconds directly", () => {
    expect(toUnixSeconds(1_893_456_000n, "deadline")).toBe(1_893_456_000n);
  });

  it("round-trips through fromUnixSeconds back to an equivalent Date", () => {
    const seconds = 1_893_456_000n;
    const date = fromUnixSeconds(seconds);
    expect(toUnixSeconds(date, "deadline")).toBe(seconds);
  });
});
