import { ContractInvoker, type ClientConfig } from "./core/contractInvoker.js";
import * as admin from "./methods/admin.js";

/**
 * The Soroban Keeper Network SDK client. Wraps a single keeper-registry
 * contract deployment and exposes contract methods as typed, promise-based
 * calls. Method implementations live in `./methods/*.ts`, grouped by shape
 * and bound here so each group's file stays focused on just its own
 * methods and can be reviewed/merged independently. See CONVENTIONS.md for
 * the bigint/Date conventions every method follows.
 *
 * NOTE: this client currently only wires up the single-auth admin methods
 * (packages/sdk-ts/src/methods/admin.ts). The dual-auth admin methods and
 * read-only views are proposed in sibling PRs against the same file; once
 * those land, this constructor's method bindings should be merged together
 * (a three-way merge here is expected and trivial — each PR only adds new
 * bound properties, none touch existing ones).
 */
export class KeeperClient {
  readonly invoker: ContractInvoker;

  constructor(config: ClientConfig) {
    this.invoker = new ContractInvoker(config);
  }

  // ── Admin: single-auth (packages/sdk-ts/src/methods/admin.ts) ──────────
  pause = (args: admin.PauseArgs) => admin.pause(this.invoker, args);
  unpause = (args: admin.UnpauseArgs) => admin.unpause(this.invoker, args);
  setFeeBps = (args: admin.SetFeeBpsArgs) => admin.setFeeBps(this.invoker, args);
  setMinReward = (args: admin.SetMinRewardArgs) => admin.setMinReward(this.invoker, args);
}

export type { ClientConfig } from "./core/contractInvoker.js";
