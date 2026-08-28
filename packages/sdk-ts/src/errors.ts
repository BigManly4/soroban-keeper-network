/**
 * Mirrors `KeeperError` in contracts/keeper-registry/src/lib.rs. Keep the
 * numeric values in sync — they are the contract's actual error codes.
 */
export enum KeeperErrorCode {
  AlreadyInitialized = 1,
  Unauthorized = 2,
  ContractPaused = 3,
  TaskNotFound = 4,
  InvalidTaskStatus = 5,
  DeadlinePassed = 6,
  DeadlineNotPassed = 7,
  InvalidReward = 8,
  LockPeriodActive = 9,
  InvalidFeeBps = 10,
  NotTaskOwner = 11,
  NotTaskClaimer = 12,
  NoRewardsAvailable = 13,
}

const MESSAGES: Record<KeeperErrorCode, string> = {
  [KeeperErrorCode.AlreadyInitialized]: "registry has already been initialized",
  [KeeperErrorCode.Unauthorized]: "caller is not authorized for this action",
  [KeeperErrorCode.ContractPaused]: "registry is paused",
  [KeeperErrorCode.TaskNotFound]: "task does not exist",
  [KeeperErrorCode.InvalidTaskStatus]: "task is not in a valid status for this action",
  [KeeperErrorCode.DeadlinePassed]: "task deadline has already passed",
  [KeeperErrorCode.DeadlineNotPassed]: "task deadline has not passed yet",
  [KeeperErrorCode.InvalidReward]: "reward/amount value is invalid",
  [KeeperErrorCode.LockPeriodActive]: "task's claim lock window is still active",
  [KeeperErrorCode.InvalidFeeBps]: "fee bps exceeds the 10,000 (100%) maximum",
  [KeeperErrorCode.NotTaskOwner]: "caller is not this task's owner",
  [KeeperErrorCode.NotTaskClaimer]: "caller is not this task's current claimer",
  [KeeperErrorCode.NoRewardsAvailable]: "no rewards/fees available to withdraw",
};

/**
 * Thrown when the contract call reverted with a `KeeperError`. `code` lets
 * callers branch on the exact on-chain error (`error.code === KeeperErrorCode.Unauthorized`)
 * instead of parsing the error message.
 */
export class KeeperContractError extends Error {
  readonly code: KeeperErrorCode;

  constructor(code: KeeperErrorCode) {
    super(MESSAGES[code] ?? `KeeperRegistry contract error (code ${code})`);
    this.name = "KeeperContractError";
    this.code = code;
  }
}

/**
 * Thrown by admin methods when the SDK determines client-side (via a
 * cheap `admin()` view call, before submitting the write) that the
 * registry has never been initialized. The contract itself does not
 * distinguish this from `Unauthorized` — `require_admin` falls back to
 * `Unauthorized` when no admin is set — so without this check a caller
 * could not tell "you're the wrong signer" apart from "nobody has called
 * `initialize` yet". See packages/sdk-ts/src/methods/admin.ts.
 */
export class NotInitializedError extends Error {
  constructor() {
    super("KeeperRegistry has not been initialized (no admin set yet)");
    this.name = "NotInitializedError";
  }
}

/** Thrown by `getTask` for an id with no stored task, instead of returning null/undefined. */
export class TaskNotFoundError extends Error {
  readonly taskId: bigint;

  constructor(taskId: bigint) {
    super(`Task ${taskId} does not exist`);
    this.name = "TaskNotFoundError";
    this.taskId = taskId;
  }
}

/** Client-side pre-check failure for `setFeeBps` — never reaches the network. */
export class InvalidFeeBpsError extends Error {
  constructor(newBps: number) {
    super(`newBps must be between 0 and 10000, got ${newBps}`);
    this.name = "InvalidFeeBpsError";
  }
}

/** Client-side pre-check failure for a non-32-byte wasm hash. */
export class InvalidWasmHashError extends Error {
  constructor(length: number) {
    super(`newWasmHash must be exactly 32 bytes, got ${length}`);
    this.name = "InvalidWasmHashError";
  }
}

/** Client-side pre-check failure for `sweepFees`'s amount argument. */
export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

/**
 * Maps a raw contract error code (as decoded off a failed simulation/
 * transaction result) to a typed `KeeperContractError`.
 */
export function fromContractErrorCode(code: number): KeeperContractError {
  return new KeeperContractError(code as KeeperErrorCode);
}
