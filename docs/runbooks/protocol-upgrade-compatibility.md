# Soroban protocol-upgrade compatibility

Protocol support is based on versions validated by this repository, not versions that are merely announced. `GET /api/v1/protocol` reports the current network's protocol version, the validated range, known features, and a warning for unknown versions. An unknown version is intentionally reported as unsupported until the regression corpus and XDR compatibility checks have been reviewed. XDR parse failures use the protocol guard's fallback path so an unfamiliar XDR arm does not terminate ingestion; inspect warnings and persisted raw payloads rather than treating fallback output as decoded data.

Before promoting an SDK or decoder change to production:

1. Update the protocol feature registry only after the new protocol's XDR changes have been reviewed. Do not add anticipated versions or features.
2. Run `npm test -- tests/indexer/protocol-guard.test.ts tests/indexer/event-decoding-corpus.test.ts` and the complete indexer decoder tests.
3. Deploy first against the matching Stellar test network. Check `/api/v1/protocol`, indexer decode/persist error metrics, event fixtures and raw XDR availability; promote to mainnet only after the test network reports the new version without unknown-version warnings and the reviewed fixture outputs remain stable.
4. Repeat for each network profile used in production. Protocol versions, RPC capabilities, and upgrade activation times are network-specific; a testnet result alone does not establish mainnet compatibility.

The protocol guard monitors the node configured by the current indexer process. It does not establish support for unvalidated XDR schemas and does not replace a staged network rollout.
