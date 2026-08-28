import type { IntegerInput, TimestampInput } from "../types.js";

/**
 * Normalizes an i128/u64 input to `bigint`, per CONVENTIONS.md. Rejects a
 * `number` outside the safe-integer range up front rather than silently
 * truncating a reward or balance value.
 */
export function toBigInt(value: IntegerInput, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${field} must be a safe integer or a bigint (got ${value}); pass a ` +
        `bigint literal for values above Number.MAX_SAFE_INTEGER`
    );
  }
  return BigInt(value);
}

/**
 * Normalizes a timestamp input to Unix-second `bigint`, per CONVENTIONS.md.
 */
export function toUnixSeconds(value: TimestampInput, field: string): bigint {
  if (value instanceof Date) {
    return BigInt(Math.floor(value.getTime() / 1000));
  }
  return toBigInt(value, field);
}

/** Converts a Unix-second on-chain value back to a `Date` for return values. */
export function fromUnixSeconds(seconds: bigint): Date {
  return new Date(Number(seconds) * 1000);
}
