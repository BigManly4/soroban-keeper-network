import { ContractInvoker, type ClientConfig } from "./core/contractInvoker.js";
import * as adminDualAuth from "./methods/adminDualAuth.js";

/**
 * The Soroban Keeper Network SDK client. Wraps a single keeper-registry
 * contract deployment and exposes contract methods as typed, promise-based
 * calls. Method implementations live in `./methods/*.ts`, grouped by shape
 * and bound here so each group's file stays focused on just its own
 * methods and can be reviewed/merged independently. See CONVENTIONS.md for
 * the bigint/Date conventions every method follows.
 *
 * NOTE: this client currently only wires up the dual-auth admin methods
 * (packages/sdk-ts/src/methods/adminDualAuth.ts). The single-auth admin
 * methods and read-only views are proposed in sibling PRs against the same
 * file; once those land, this constructor's method bindings should be
 * merged together (a three-way merge here is expected and trivial — each
 * PR only adds new bound properties, none touch existing ones).
 */
export class KeeperClient {
  readonly invoker: ContractInvoker;

  constructor(config: ClientConfig) {
    this.invoker = new ContractInvoker(config);
  }

  // ── Admin: dual-auth (packages/sdk-ts/src/methods/adminDualAuth.ts) ────
  transferAdmin = (args: adminDualAuth.TransferAdminArgs) =>
    adminDualAuth.transferAdmin(this.invoker, args);
  upgrade = (args: adminDualAuth.UpgradeArgs) => adminDualAuth.upgrade(this.invoker, args);
  sweepFees = (args: adminDualAuth.SweepFeesArgs) => adminDualAuth.sweepFees(this.invoker, args);
}

export type { ClientConfig } from "./core/contractInvoker.js";
