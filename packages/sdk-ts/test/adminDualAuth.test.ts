import { Address, Keypair, Networks, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { signAuthEntries } from "../src/core/auth.js";
import type { ContractInvoker } from "../src/core/contractInvoker.js";
import { InvalidAmountError, InvalidWasmHashError } from "../src/errors.js";
import { sweepFees, upgrade } from "../src/methods/adminDualAuth.js";

const CONTRACT_ID = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const NETWORK = Networks.TESTNET;

/** Builds an unsigned `sorobanCredentialsAddress` auth entry requiring `address`'s signature. */
function unsignedAuthEntry(address: string): xdr.SorobanAuthorizationEntry {
  const credentials = xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: Address.fromString(address).toScAddress(),
      nonce: new xdr.Int64(1),
      signatureExpirationLedger: 1000,
      signature: xdr.ScVal.scvVoid(),
    })
  );
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
        functionName: "transfer_admin",
        args: [],
      })
    ),
    subInvocations: [],
  });
  return new xdr.SorobanAuthorizationEntry({ credentials, rootInvocation: invocation });
}

function isSigned(entry: xdr.SorobanAuthorizationEntry): boolean {
  return entry.credentials().address().signature().switch().name !== "scvVoid";
}

describe("transferAdmin dual-signer auth entry resolution", () => {
  it("fails when only the source (current admin) signer is provided", async () => {
    const currentAdmin = Keypair.random();
    const newAdmin = Keypair.random();
    // transfer_admin requires require_auth from both admin and new_admin;
    // simulation would report an entry for each. Model just the entry that
    // isn't satisfied implicitly by the tx envelope: new_admin's.
    const entries = [unsignedAuthEntry(newAdmin.publicKey())];

    await expect(
      signAuthEntries(entries, [currentAdmin], 2000, NETWORK, "transfer_admin")
    ).rejects.toThrow(/requires authorization from/);
  });

  it("succeeds and signs the entry when both signers are provided", async () => {
    const currentAdmin = Keypair.random();
    const newAdmin = Keypair.random();
    const entries = [unsignedAuthEntry(newAdmin.publicKey())];

    const signed = await signAuthEntries(entries, [currentAdmin, newAdmin], 2000, NETWORK, "transfer_admin");

    expect(signed).toHaveLength(1);
    expect(isSigned(signed[0]!)).toBe(true);
  });

  it("leaves source-account (implicit) credential entries untouched", async () => {
    const currentAdmin = Keypair.random();
    const sourceAccountEntry = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: unsignedAuthEntry(currentAdmin.publicKey()).rootInvocation(),
    });

    const result = await signAuthEntries([sourceAccountEntry], [currentAdmin], 2000, NETWORK, "transfer_admin");

    expect(result[0]!.credentials().switch().name).toBe("sorobanCredentialsSourceAccount");
  });
});

describe("upgrade wasm hash validation", () => {
  it("rejects a hash that is not exactly 32 bytes, before any network call", async () => {
    const admin = Keypair.random();
    const invoker = { write: vi.fn() } as unknown as ContractInvoker;

    await expect(upgrade(invoker, { admin, newWasmHash: new Uint8Array(31) })).rejects.toBeInstanceOf(
      InvalidWasmHashError
    );
    expect(invoker.write).not.toHaveBeenCalled();
  });

  it("accepts an exact 32-byte hash and proceeds to the network", async () => {
    const admin = Keypair.random();
    const invoker = { write: vi.fn().mockResolvedValue(undefined) } as unknown as ContractInvoker;

    await upgrade(invoker, { admin, newWasmHash: new Uint8Array(32) });
    expect(invoker.write).toHaveBeenCalledTimes(1);
  });
});

describe("sweepFees client-side checks", () => {
  it("rejects a non-positive amount before any network call", async () => {
    const admin = Keypair.random();
    const invoker = { read: vi.fn(), write: vi.fn() } as unknown as ContractInvoker;

    await expect(sweepFees(invoker, { admin, treasury: Keypair.random().publicKey(), amount: 0 })).rejects
      .toBeInstanceOf(InvalidAmountError);
    expect(invoker.read).not.toHaveBeenCalled();
    expect(invoker.write).not.toHaveBeenCalled();
  });

  it("rejects an amount over the accrued balance after one cheap read call", async () => {
    const admin = Keypair.random();
    const invoker = {
      read: vi.fn().mockResolvedValue(100n),
      write: vi.fn(),
    } as unknown as ContractInvoker;

    await expect(
      sweepFees(invoker, { admin, treasury: Keypair.random().publicKey(), amount: 101 })
    ).rejects.toBeInstanceOf(InvalidAmountError);
    expect(invoker.read).toHaveBeenCalledTimes(1);
    expect(invoker.write).not.toHaveBeenCalled();
  });

  it("proceeds to the network for an amount within the accrued balance", async () => {
    const admin = Keypair.random();
    const invoker = {
      read: vi.fn().mockResolvedValue(100n),
      write: vi.fn().mockResolvedValue(undefined),
    } as unknown as ContractInvoker;

    await sweepFees(invoker, { admin, treasury: Keypair.random().publicKey(), amount: 100 });
    expect(invoker.write).toHaveBeenCalledTimes(1);
  });
});
