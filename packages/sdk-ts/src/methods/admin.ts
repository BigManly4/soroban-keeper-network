import { Keypair } from "@stellar/stellar-sdk";
import type { ContractInvoker } from "../core/contractInvoker.js";
import { toBigInt } from "../core/numbers.js";
import { addressToScVal, i128ToScVal, u32ToScVal } from "../core/scval.js";
import { InvalidFeeBpsError, NotInitializedError } from "../errors.js";
import type { IntegerInput } from "../types.js";

/**
 * Single-auth admin controls: one admin signature, one stored value
 * changes, one event fires. See methods/adminDualAuth.ts for the admin
 * methods that require two signatures.
 */

export interface PauseArgs {
  admin: Keypair;
}

export interface UnpauseArgs {
  admin: Keypair;
}

export interface SetFeeBpsArgs {
  admin: Keypair;
  newBps: number;
}

export interface SetMinRewardArgs {
  admin: Keypair;
  minReward: IntegerInput;
}

const MAX_FEE_BPS = 10_000;

/**
 * The contract's `require_admin` returns the same `Unauthorized` error
 * whether the caller is simply the wrong address or whether the registry
 * has never been initialized (no admin stored yet) — see `require_admin`
 * in contracts/keeper-registry/src/lib.rs. This cheap read call lets the
 * SDK tell those two outcomes apart for the caller, throwing
 * `NotInitializedError` up front instead of a `KeeperContractError` whose
 * `Unauthorized` code could mean either.
 */
async function requireInitialized(invoker: ContractInvoker): Promise<void> {
  const currentAdmin = await invoker.read<string | undefined>("admin", [], (v) => v as string | undefined);
  if (currentAdmin === undefined) {
    throw new NotInitializedError();
  }
}

/** Admin emergency circuit breaker — blocks register/claim/execute while paused. */
export async function pause(invoker: ContractInvoker, { admin }: PauseArgs): Promise<void> {
  await requireInitialized(invoker);
  await invoker.write<void>("pause", [addressToScVal(admin.publicKey())], admin, () => undefined);
}

/** Lifts a pause set by {@link pause}. */
export async function unpause(invoker: ContractInvoker, { admin }: UnpauseArgs): Promise<void> {
  await requireInitialized(invoker);
  await invoker.write<void>("unpause", [addressToScVal(admin.publicKey())], admin, () => undefined);
}

/**
 * Sets the platform fee. `newBps` is checked against the 10,000 (100%)
 * bound client-side before any network call — the contract enforces the
 * same bound (`InvalidFeeBps`), but there is no reason to pay a simulation
 * round trip for a value that can never succeed.
 */
export async function setFeeBps(invoker: ContractInvoker, { admin, newBps }: SetFeeBpsArgs): Promise<void> {
  if (!Number.isInteger(newBps) || newBps < 0 || newBps > MAX_FEE_BPS) {
    throw new InvalidFeeBpsError(newBps);
  }
  await requireInitialized(invoker);
  await invoker.write<void>(
    "set_fee_bps",
    [addressToScVal(admin.publicKey()), u32ToScVal(newBps)],
    admin,
    () => undefined
  );
}

/** Sets the minimum reward a task may be registered with (future registrations only). */
export async function setMinReward(
  invoker: ContractInvoker,
  { admin, minReward }: SetMinRewardArgs
): Promise<void> {
  const minRewardBig = toBigInt(minReward, "minReward");
  await requireInitialized(invoker);
  await invoker.write<void>(
    "set_min_reward",
    [addressToScVal(admin.publicKey()), i128ToScVal(minRewardBig)],
    admin,
    () => undefined
  );
}
