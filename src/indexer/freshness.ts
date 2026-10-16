import { indexerIngestionLag, indexerLastLedger, indexerLedgerCloseTimestamp } from '../metrics';

export function recordIndexerFreshness(
  network: string,
  ledger: number,
  closeTime: Date,
  networkTip?: number,
): void {
  indexerLastLedger.set({ network }, ledger);
  indexerLedgerCloseTimestamp.set({ network }, closeTime.getTime() / 1000);
  if (networkTip !== undefined) {
    indexerIngestionLag.set({ network }, Math.max(0, networkTip - ledger));
  }
}
