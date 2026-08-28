import type { ContractInvoker } from "../core/contractInvoker.js";
import { fromUnixSeconds } from "../core/numbers.js";
import { addressToScVal, u64ToScVal } from "../core/scval.js";
import { KeeperErrorCode, TaskNotFoundError, fromContractErrorCode } from "../errors.js";
import { TaskStatus, TaskType, type IntegerInput, type Task } from "../types.js";

/**
 * Task-and-keeper-facing read-only views. Every call here is a free
 * simulation — no signature, no fee, no network write — via
 * `ContractInvoker.read`.
 */

function toTaskId(taskId: IntegerInput): bigint {
  return typeof taskId === "bigint" ? taskId : BigInt(taskId);
}

/**
 * `scValToNative` decodes the contract's `Task` struct into a plain object
 * keyed by its Rust field names. This accepts either snake_case (the
 * struct's literal field names) or camelCase, so a future soroban-sdk
 * decoding-convention change doesn't silently produce `undefined` fields.
 */
function parseTask(native: unknown): Task {
  const raw = native as Record<string, unknown>;
  const field = <T>(snake: string, camel: string): T => (raw[snake] ?? raw[camel]) as T;

  return {
    owner: field<string>("owner", "owner"),
    taskType: field<TaskType>("task_type", "taskType"),
    calldata: field<Uint8Array>("calldata", "calldata"),
    reward: field<bigint>("reward", "reward"),
    deadline: fromUnixSeconds(field<bigint>("deadline", "deadline")),
    ttlLedgers: field<number>("ttl_ledgers", "ttlLedgers"),
    status: field<TaskStatus>("status", "status"),
    claimer: field<string | undefined>("claimer", "claimer"),
    claimLedger: field<number | undefined>("claim_ledger", "claimLedger"),
    lockLedgers: field<number>("lock_ledgers", "lockLedgers"),
  };
}

/**
 * Fetches a task by id. Rejects with {@link TaskNotFoundError} for a
 * nonexistent id rather than resolving to `null`/`undefined` — a caller
 * checking `if (!task)` on a nullish "not found" result could mistake it
 * for a task whose fields all happen to be falsy, so "does not exist" is a
 * distinct rejection instead.
 */
export async function getTask(invoker: ContractInvoker, taskId: IntegerInput): Promise<Task> {
  const id = toTaskId(taskId);
  try {
    return await invoker.read<Task>("get_task", [u64ToScVal(id)], parseTask);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: unknown }).code === KeeperErrorCode.TaskNotFound) {
      throw new TaskNotFoundError(id);
    }
    throw err;
  }
}

/** Total number of tasks ever registered (the next task id minus one). */
export async function taskCount(invoker: ContractInvoker): Promise<bigint> {
  return invoker.read<bigint>("task_count", [], (v) => v as bigint);
}

/** A keeper's withdrawable reward balance. `0n` for an address with no accrued rewards. */
export async function keeperBalance(invoker: ContractInvoker, keeper: string): Promise<bigint> {
  return invoker.read<bigint>("keeper_balance", [addressToScVal(keeper)], (v) => v as bigint);
}

/**
 * True if the task can be claimed right now (exists, deadline not passed,
 * and Pending or a Claimed task whose lock window has elapsed). Unlike
 * {@link getTask}, a nonexistent id resolves to `false` here — this
 * mirrors the contract's own `is_claimable`, which treats "not found" as
 * just another reason a task can't be claimed rather than an error.
 */
export async function isClaimable(invoker: ContractInvoker, taskId: IntegerInput): Promise<boolean> {
  return invoker.read<boolean>("is_claimable", [u64ToScVal(toTaskId(taskId))], (v) => v as boolean);
}

// Re-exported so callers pulling in only this file still get the shared
// error-code helper for advanced use (e.g. mapping a raw simulation error
// themselves).
export { fromContractErrorCode };
export type { IntegerInput } from "../types.js";
