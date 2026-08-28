import { Address, Keypair, authorizeEntry, xdr } from "@stellar/stellar-sdk";

/**
 * Signs whichever entries in `authEntries` require an explicit address
 * signature, matching each to a signer in `signers` by public key. Entries
 * whose credentials are implicit (`sorobanCredentialsSourceAccount` — i.e.
 * satisfied by the transaction envelope's own signature rather than a
 * separate auth entry) pass through untouched.
 *
 * Kept as a standalone, network-free function — given only already-fetched
 * simulation output — so the "does every required address have a matching
 * signer" logic that `writeMultiAuth` depends on can be exercised directly
 * in tests without a live RPC server.
 *
 * Throws if any entry requires an address for which no signer was supplied.
 */
export async function signAuthEntries(
  authEntries: readonly xdr.SorobanAuthorizationEntry[],
  signers: readonly Keypair[],
  validUntilLedgerSeq: number,
  networkPassphrase: string,
  methodLabel = "call"
): Promise<xdr.SorobanAuthorizationEntry[]> {
  const signerByAddress = new Map(signers.map((s) => [s.publicKey(), s]));

  return Promise.all(
    authEntries.map(async (entry) => {
      if (entry.credentials().switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
        return entry;
      }
      const requiredAddress = Address.fromScAddress(entry.credentials().address().address()).toString();
      const matching = signerByAddress.get(requiredAddress);
      if (!matching) {
        throw new Error(
          `${methodLabel}: transaction requires authorization from ${requiredAddress}, ` +
            `but no signer for that address was provided`
        );
      }
      return authorizeEntry(entry, matching, validUntilLedgerSeq, networkPassphrase);
    })
  );
}
