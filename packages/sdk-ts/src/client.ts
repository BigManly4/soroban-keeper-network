import { ContractInvoker, type ClientConfig } from "./core/contractInvoker.js";
import * as views from "./methods/views.js";

/**
 * The Soroban Keeper Network SDK client. Wraps a single keeper-registry
 * contract deployment and exposes contract methods as typed, promise-based
 * calls. Method implementations live in `./methods/*.ts`, grouped by shape
 * and bound here so each group's file stays focused on just its own
 * methods and can be reviewed/merged independently. See CONVENTIONS.md for
 * the bigint/Date conventions every method follows.
 *
 * NOTE: this client currently only wires up the read-only view methods
 * (packages/sdk-ts/src/methods/views.ts). The single- and dual-auth admin
 * methods are proposed in sibling PRs against the same file; once those
 * land, this constructor's method bindings should be merged together (a
 * three-way merge here is expected and trivial — each PR only adds new
 * bound properties, none touch existing ones).
 */
export class KeeperClient {
  readonly invoker: ContractInvoker;

  constructor(config: ClientConfig) {
    this.invoker = new ContractInvoker(config);
  }

  // ── Views (packages/sdk-ts/src/methods/views.ts) ────────────────────────
  getTask = (taskId: views.IntegerInput) => views.getTask(this.invoker, taskId);
  taskCount = () => views.taskCount(this.invoker);
  keeperBalance = (keeper: string) => views.keeperBalance(this.invoker, keeper);
  isClaimable = (taskId: views.IntegerInput) => views.isClaimable(this.invoker, taskId);
}

export type { ClientConfig } from "./core/contractInvoker.js";
