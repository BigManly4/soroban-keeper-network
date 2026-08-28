# @soroban-keeper-network/sdk-ts

TypeScript client SDK for the [`keeper-registry`](../../contracts/keeper-registry)
contract. Wraps contract calls in typed methods with typed errors, so
callers don't have to hand-encode `ScVal`s or parse raw simulation
failures.

```ts
import { KeeperClient } from "@soroban-keeper-network/sdk-ts";
import { Keypair } from "@stellar/stellar-sdk";

const client = new KeeperClient({
  contractId: "C...",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
});

const task = await client.getTask(1n);
await client.setFeeBps({ admin: Keypair.fromSecret("S..."), newBps: 250 });
```

See [CONVENTIONS.md](./CONVENTIONS.md) for the SDK-wide `bigint`/`Date`
conventions every method follows.

## Development

```bash
npm install
npm run typecheck
npm test
```
