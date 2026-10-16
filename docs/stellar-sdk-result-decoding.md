# Soroban transaction return-value decoding

Soroban return values must be decoded from XDR `TransactionMeta` version 3,
specifically `sorobanMeta.returnValue`. An XDR `TransactionResult` is not the
return-value payload: Stellar's SDK schema stores a hash of the
`InvokeHostFunctionSuccessPreImage` in the successful operation result. Treating
that hash as `ScVal` XDR is invalid and can silently lose return data.

`parseInvokeResult` accepts base64 `TransactionMeta` XDR and returns the
structured `ScVal` representation for V3 metadata containing Soroban metadata.
It returns `null` for malformed XDR, pre-V3 metadata, or V3 metadata without a
Soroban result. The static V3 fixtures in
`tests/fixtures/stellar-sdk-transaction-meta.ts` were serialized with
`@stellar/stellar-sdk` 12.3.0; tests compare their decoded values against the
SDK's `scValToNative` output, including a large-precision `i128` value.

This parsing behavior does not require a database migration and is compatible
with persisted metadata XDR. Callers holding only `TransactionResult` XDR must
also supply the corresponding transaction metadata to decode a return value.
