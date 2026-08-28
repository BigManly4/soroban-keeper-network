import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import type { ContractInvoker } from "../src/core/contractInvoker.js";
import { InvalidFeeBpsError, NotInitializedError } from "../src/errors.js";
import { pause, setFeeBps, setMinReward, unpause } from "../src/methods/admin.js";

/** Minimal fake satisfying only the `.read`/`.write` surface these methods call. */
function fakeInvoker(overrides: Partial<ContractInvoker> = {}): ContractInvoker {
  return {
    read: vi.fn(),
    write: vi.fn(),
    ...overrides,
  } as unknown as ContractInvoker;
}

describe("setFeeBps client-side bound check", () => {
  it("accepts exactly 10000 (the boundary) and proceeds to the network", async () => {
    const admin = Keypair.random();
    const invoker = fakeInvoker({
      read: vi.fn().mockResolvedValue(admin.publicKey()),
      write: vi.fn().mockResolvedValue(undefined),
    });

    await setFeeBps(invoker, { admin, newBps: 10_000 });

    expect(invoker.read).toHaveBeenCalledTimes(1);
    expect(invoker.write).toHaveBeenCalledTimes(1);
    expect(invoker.write).toHaveBeenCalledWith(
      "set_fee_bps",
      expect.any(Array),
      admin,
      expect.any(Function)
    );
  });

  it("rejects 10001 before any network call", async () => {
    const admin = Keypair.random();
    const invoker = fakeInvoker();

    await expect(setFeeBps(invoker, { admin, newBps: 10_001 })).rejects.toBeInstanceOf(InvalidFeeBpsError);

    expect(invoker.read).not.toHaveBeenCalled();
    expect(invoker.write).not.toHaveBeenCalled();
  });

  it("rejects a negative value before any network call", async () => {
    const admin = Keypair.random();
    const invoker = fakeInvoker();

    await expect(setFeeBps(invoker, { admin, newBps: -1 })).rejects.toBeInstanceOf(InvalidFeeBpsError);

    expect(invoker.read).not.toHaveBeenCalled();
    expect(invoker.write).not.toHaveBeenCalled();
  });
});

describe("NotInitialized vs Unauthorized", () => {
  it("throws NotInitializedError when the registry has no admin set", async () => {
    const admin = Keypair.random();
    const invoker = fakeInvoker({
      read: vi.fn().mockResolvedValue(undefined),
      write: vi.fn(),
    });

    await expect(pause(invoker, { admin })).rejects.toBeInstanceOf(NotInitializedError);
    expect(invoker.write).not.toHaveBeenCalled();
  });

  it("proceeds to the write call when an admin is set, regardless of whether it matches the caller", async () => {
    const someAdmin = Keypair.random();
    const wrongCaller = Keypair.random();
    const invoker = fakeInvoker({
      read: vi.fn().mockResolvedValue(someAdmin.publicKey()),
      write: vi.fn().mockResolvedValue(undefined),
    });

    // The SDK can't know client-side whether `wrongCaller` is the real
    // admin — that's exactly the `Unauthorized` case, which is left to the
    // contract to reject during the write call itself.
    await unpause(invoker, { admin: wrongCaller });

    expect(invoker.write).toHaveBeenCalledTimes(1);
  });
});
