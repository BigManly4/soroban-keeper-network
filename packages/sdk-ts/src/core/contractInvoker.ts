import {
  Account,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  contract as stellarContract,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { signAuthEntries } from "./auth.js";
import { fromContractErrorCode } from "../errors.js";

/** How many ledgers ahead a signed auth entry remains valid for. ~5 minutes at 5s/ledger. */
const AUTH_ENTRY_VALIDITY_LEDGERS = 60;

export interface ClientConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  /** Passed through to `rpc.Server`. Default: inferred from `rpcUrl`'s scheme. */
  allowHttp?: boolean;
}

/**
 * Thin, shared wrapper around a Soroban RPC server + contract id. Every
 * method module builds on this instead of re-implementing simulate/sign/
 * submit, so the plumbing (retries aside, left to callers per the
 * keeper-bot example) and error mapping stay in one place.
 */
export class ContractInvoker {
  readonly server: rpc.Server;
  readonly contract: Contract;
  readonly contractId: string;
  readonly networkPassphrase: string;
  readonly rpcUrl: string;

  constructor(config: ClientConfig) {
    this.server = new rpc.Server(config.rpcUrl, {
      allowHttp: config.allowHttp ?? config.rpcUrl.startsWith("http://"),
    });
    this.contract = new Contract(config.contractId);
    this.contractId = config.contractId;
    this.networkPassphrase = config.networkPassphrase;
    this.rpcUrl = config.rpcUrl;
  }

  /**
   * Free simulation call for a read-only view method — no signature, no
   * submission, no network write. `parse` converts the decoded native
   * value into the method's public return type (e.g. mapping a Task's
   * fields, or converting seconds to a `Date`).
   */
  async read<T>(method: string, args: xdr.ScVal[], parse: (native: unknown) => T): Promise<T> {
    const sourceAccount = new Account(stellarContract.NULL_ACCOUNT, "0");
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw this.translateSimulationError(sim.error);
    }
    if (!sim.result) {
      throw new Error(`${method}: simulation returned no result`);
    }
    return parse(scValToNative(sim.result.retval));
  }

  /**
   * Single-signer write call: build, simulate, sign with `signer`, submit,
   * and poll for confirmation. `parse` converts the decoded native return
   * value (if any) into the method's public return type.
   */
  async write<T>(
    method: string,
    args: xdr.ScVal[],
    signer: Keypair,
    parse: (native: unknown) => T
  ): Promise<T> {
    const account = await this.server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw this.translateSimulationError(sim.error);
    }

    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(signer);

    const sendResult = await this.server.sendTransaction(prepared);
    if (sendResult.status === "ERROR") {
      throw this.translateSimulationError(JSON.stringify(sendResult.errorResult));
    }

    const getResult = await this.pollForResult(method, sendResult.hash);
    if (getResult.returnValue === undefined) {
      return parse(undefined);
    }
    return parse(scValToNative(getResult.returnValue));
  }

  /**
   * Multi-signer write call, for methods like `transfer_admin` that require
   * `require_auth` from more than one address in a single transaction.
   * `signers[0]` is the transaction's fee-paying source account; every
   * signer authorizes its own Soroban auth entry, matched by public key,
   * against whichever entries simulation reports as needing an explicit
   * address signature (an entry whose required address equals the source
   * account is satisfied implicitly by the envelope signature and is left
   * untouched — see `assembleTransaction`'s `existingAuth` handling).
   *
   * Throws before any signature is attempted if an entry requires an
   * address for which no signer was supplied.
   */
  async writeMultiAuth<T>(
    method: string,
    args: xdr.ScVal[],
    signers: Keypair[],
    parse: (native: unknown) => T
  ): Promise<T> {
    const source = signers[0];
    if (!source) {
      throw new Error(`${method}: at least one signer is required`);
    }
    const account = await this.server.getAccount(source.publicKey());
    const startingSequence = account.sequenceNumber();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw this.translateSimulationError(sim.error);
    }
    if (!sim.result) {
      throw new Error(`${method}: simulation returned no result`);
    }

    const validUntilLedgerSeq =
      (await this.server.getLatestLedger()).sequence + AUTH_ENTRY_VALIDITY_LEDGERS;

    const signedAuth = await signAuthEntries(
      sim.result.auth,
      signers,
      validUntilLedgerSeq,
      this.networkPassphrase,
      method
    );

    // Rebuild with a fresh Account at the original sequence number — the
    // first `.build()` above already advanced `account`'s local counter.
    const resignableAccount = new Account(source.publicKey(), startingSequence);
    const signedTx = new TransactionBuilder(resignableAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: (tx.operations[0] as Operation.InvokeHostFunction).func,
          auth: signedAuth,
        })
      )
      .setTimeout(30)
      .build();

    const prepared = rpc.assembleTransaction(signedTx, sim).build();
    prepared.sign(source);

    const sendResult = await this.server.sendTransaction(prepared);
    if (sendResult.status === "ERROR") {
      throw this.translateSimulationError(JSON.stringify(sendResult.errorResult));
    }

    const getResult = await this.pollForResult(method, sendResult.hash);
    if (getResult.returnValue === undefined) {
      return parse(undefined);
    }
    return parse(scValToNative(getResult.returnValue));
  }

  private async pollForResult(method: string, hash: string): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
    let result = await this.server.getTransaction(hash);
    let attempts = 0;
    while (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 30) {
      await sleep(1000);
      result = await this.server.getTransaction(hash);
      attempts++;
    }
    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`${method}: transaction did not succeed (status: ${result.status})`);
    }
    return result;
  }

  /**
   * Best-effort extraction of a `KeeperError` numeric code out of a
   * simulation/send failure message. The RPC surfaces contract `Err(N)`
   * results as free-form diagnostic text (e.g. containing `Error(Contract,
   * #4)`), so this pulls the trailing `#<code>` out rather than parsing
   * full XDR, which keeps this resilient to message-format churn across
   * rpc.Server versions.
   */
  private translateSimulationError(message: string): Error {
    const match = message.match(/Error\(Contract,\s*#(\d+)\)/);
    if (match?.[1]) {
      return fromContractErrorCode(Number(match[1]));
    }
    return new Error(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
