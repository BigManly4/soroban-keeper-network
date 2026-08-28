import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import type { ContractInvoker } from "../src/core/contractInvoker.js";
import { KeeperContractError, KeeperErrorCode, TaskNotFoundError } from "../src/errors.js";
import { TaskStatus, TaskType } from "../src/types.js";
import { getTask, isClaimable, keeperBalance, taskCount } from "../src/methods/views.js";

function fakeInvoker(readImpl: ContractInvoker["read"]): ContractInvoker {
  return { read: readImpl } as unknown as ContractInvoker;
}

const SAMPLE_DEADLINE_SECONDS = 1_893_456_000n; // 2030-01-01T00:00:00Z

function sampleTaskNative(owner: string) {
  return {
    owner,
    task_type: TaskType.Liquidation,
    calldata: new Uint8Array([1, 2, 3]),
    reward: 5_000_000n,
    deadline: SAMPLE_DEADLINE_SECONDS,
    ttl_ledgers: 100_000,
    status: TaskStatus.Pending,
    claimer: undefined,
    claim_ledger: undefined,
    lock_ledgers: 50,
  };
}

describe("getTask", () => {
  it("returns a fully typed Task for an existing id", async () => {
    const owner = Keypair.random().publicKey();
    const invoker = fakeInvoker(vi.fn(async (_method, _args, parse) => parse(sampleTaskNative(owner))));

    const task = await getTask(invoker, 1);

    expect(task.owner).toBe(owner);
    expect(task.taskType).toBe(TaskType.Liquidation);
    expect(task.reward).toBe(5_000_000n);
    expect(task.status).toBe(TaskStatus.Pending);
    expect(task.claimer).toBeUndefined();
    expect(task.claimLedger).toBeUndefined();
    expect(task.deadline).toBeInstanceOf(Date);
    expect(task.deadline.getTime()).toBe(Number(SAMPLE_DEADLINE_SECONDS) * 1000);
  });

  it("rejects with TaskNotFoundError, not a nullish value, for a nonexistent id", async () => {
    const invoker = fakeInvoker(vi.fn(async () => {
      throw new KeeperContractError(KeeperErrorCode.TaskNotFound);
    }));

    const rejection = getTask(invoker, 999);
    await expect(rejection).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(rejection).rejects.toMatchObject({ taskId: 999n });
  });

  it("does not mask an unrelated contract error as TaskNotFound", async () => {
    const invoker = fakeInvoker(vi.fn(async () => {
      throw new KeeperContractError(KeeperErrorCode.ContractPaused);
    }));

    await expect(getTask(invoker, 1)).rejects.toBeInstanceOf(KeeperContractError);
    await expect(getTask(invoker, 1)).rejects.not.toBeInstanceOf(TaskNotFoundError);
  });
});

describe("taskCount", () => {
  it("returns 0n when no tasks have been registered", async () => {
    const invoker = fakeInvoker(vi.fn(async (_m, _a, parse) => parse(0n)));
    await expect(taskCount(invoker)).resolves.toBe(0n);
  });

  it("returns the raw bigint count for an existing registry", async () => {
    const invoker = fakeInvoker(vi.fn(async (_m, _a, parse) => parse(42n)));
    await expect(taskCount(invoker)).resolves.toBe(42n);
  });
});

describe("keeperBalance", () => {
  it("returns 0n for a keeper with no accrued rewards", async () => {
    const invoker = fakeInvoker(vi.fn(async (_m, _a, parse) => parse(0n)));
    await expect(keeperBalance(invoker, Keypair.random().publicKey())).resolves.toBe(0n);
  });

  it("returns the raw bigint balance for a keeper with rewards", async () => {
    const invoker = fakeInvoker(vi.fn(async (_m, _a, parse) => parse(123_456n)));
    await expect(keeperBalance(invoker, Keypair.random().publicKey())).resolves.toBe(123_456n);
  });
});

describe("isClaimable", () => {
  it("returns true for a claimable existing task", async () => {
    const invoker = fakeInvoker(vi.fn(async (_m, _a, parse) => parse(true)));
    await expect(isClaimable(invoker, 1)).resolves.toBe(true);
  });

  it("returns false (not an error) for a nonexistent task id", async () => {
    const invoker = fakeInvoker(vi.fn(async (_m, _a, parse) => parse(false)));
    await expect(isClaimable(invoker, 999)).resolves.toBe(false);
  });
});
