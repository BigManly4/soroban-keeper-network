import { Keypair } from "@stellar/stellar-sdk";
import type { ContractInvoker } from "../core/contractInvoker.js";
import { toBigInt } from "../core/numbers.js";
import { addressToScVal, bytesN32ToScVal, i128ToScVal } from "../core/scval.js";
import { InvalidAmountError, InvalidWasmHashError } from "../errors.js";
import type { IntegerInput } from "../types.js";

/**
 * The remaining admin functions. `transferAdmin` requires two signatures in
 * one transaction (current admin and incoming admin — see `transfer_admin`
 * in contracts/keeper-registry/src/lib.rs, which calls `require_auth` on
 * both), so it goes through `ContractInvoker.writeMultiAuth` rather than
 * the single-signer path used by methods/admin.ts. `upgrade` and
 * `sweepFees` are single-signer and included here for shared review since
 * all three are "the remaining admin functions".
 */

const WASM_HASH_LENGTH = 32;

export interface TransferAdminArgs {
  /** The current admin. Pays the transaction fee and is the tx source. */
  currentAdmin: Keypair;
  /** The incoming admin. Must separately authorize taking the role. */
  newAdmin: Keypair;
}

export interface UpgradeArgs {
  admin: Keypair;
  /** Hash of the new contract WASM, already installed on-chain. Exactly 32 bytes. */
  newWasmHash: Uint8Array;
}

export interface SweepFeesArgs {
  admin: Keypair;
  treasury: string;
  amount: IntegerInput;
}

/**
 * Hands the admin role to `newAdmin`. Requires signatures from both
 * `currentAdmin` (the current admin, who also pays the transaction fee)
 * and `newAdmin` (who must consent to taking the role — the contract will
 * never let the role be transferred to an address that hasn't
 * authorized it, so there's no accidental lock-out).
 */
export async function transferAdmin(
  invoker: ContractInvoker,
  { currentAdmin, newAdmin }: TransferAdminArgs
): Promise<void> {
  await invoker.writeMultiAuth<void>(
    "transfer_admin",
    [addressToScVal(currentAdmin.publicKey()), addressToScVal(newAdmin.publicKey())],
    [currentAdmin, newAdmin],
    () => undefined
  );
}

/**
 * Swaps the contract's WASM for a new hash already installed on-chain.
 * `newWasmHash` is validated as exactly 32 bytes client-side — the
 * contract's `BytesN<32>` parameter type would otherwise surface a wrong
 * length as an opaque XDR encoding failure rather than a clear SDK error.
 */
export async function upgrade(invoker: ContractInvoker, { admin, newWasmHash }: UpgradeArgs): Promise<void> {
  if (newWasmHash.length !== WASM_HASH_LENGTH) {
    throw new InvalidWasmHashError(newWasmHash.length);
  }
  await invoker.write<void>(
    "upgrade",
    [addressToScVal(admin.publicKey()), bytesN32ToScVal(newWasmHash)],
    admin,
    () => undefined
  );
}

/**
 * Moves up to the accrued protocol fees to `treasury`. `amount` is checked
 * client-side for both a non-positive value and (via a cheap `fees_accrued`
 * view call) exceeding what's actually accrued — both are validated
 * on-chain too (`InvalidReward` / `NoRewardsAvailable`), but there's no
 * reason to pay a simulation round trip for a sweep that can never succeed.
 */
export async function sweepFees(
  invoker: ContractInvoker,
  { admin, treasury, amount }: SweepFeesArgs
): Promise<void> {
  const amountBig = toBigInt(amount, "amount");
  if (amountBig <= 0n) {
    throw new InvalidAmountError(`amount must be positive, got ${amountBig}`);
  }
  const accrued = await invoker.read<bigint>("fees_accrued", [], (v) => v as bigint);
  if (amountBig > accrued) {
    throw new InvalidAmountError(`amount (${amountBig}) exceeds accrued fees (${accrued})`);
  }

  await invoker.write<void>(
    "sweep_fees",
    [addressToScVal(admin.publicKey()), addressToScVal(treasury), i128ToScVal(amountBig)],
    admin,
    () => undefined
  );
}
