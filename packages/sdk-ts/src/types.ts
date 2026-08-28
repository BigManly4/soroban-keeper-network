/**
 * Mirrors the on-chain `TaskType` enum in
 * contracts/keeper-registry/src/lib.rs. Keep the numeric values in sync —
 * they are the contract's wire representation, not just labels.
 */
export enum TaskType {
  Liquidation = 0,
  OraclePricePush = 1,
  FundingRateUpdate = 2,
  LiquidityRebalance = 3,
  TtlExtension = 4,
  Custom = 5,
}

/**
 * Mirrors the on-chain `TaskStatus` enum. See CONVENTIONS.md for why
 * `deadline` below is a `Date` and `reward` is a `bigint`.
 */
export enum TaskStatus {
  Pending = 0,
  Claimed = 1,
  Executed = 2,
  Cancelled = 3,
  Expired = 4,
}

/**
 * Fully typed mirror of the contract's `Task` struct. `claimer` and
 * `claimLedger` are `undefined` (not a Soroban `Option` wrapper, and not
 * `null`) when a task has not been claimed yet, so callers can use plain
 * `task.claimer !== undefined` / optional chaining rather than unwrapping
 * an SDK-specific Option type.
 */
export interface Task {
  owner: string;
  taskType: TaskType;
  calldata: Uint8Array;
  reward: bigint;
  deadline: Date;
  ttlLedgers: number;
  status: TaskStatus;
  claimer: string | undefined;
  claimLedger: number | undefined;
  lockLedgers: number;
}

/** Accepted shape for any Unix-second timestamp input. See CONVENTIONS.md. */
export type TimestampInput = Date | number | bigint;

/** Accepted shape for any i128/u64 numeric input. See CONVENTIONS.md. */
export type IntegerInput = bigint | number;
