/**
 * Static TransactionMeta V3 XDR fixtures serialized with @stellar/stellar-sdk
 * 12.3.0. Expected native values are the SDK's scValToNative() results.
 */
export const stellarSdkTransactionMetaFixtures = [
  {
    name: 'symbol return value',
    xdr: 'AAAAAwAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAPAAAABXJlYWR5AAAAAAAAAA==',
    sdkValue: 'ready',
    decoded: { type: 'symbol', value: 'ready' },
  },
  {
    name: 'large i128 return value',
    xdr: 'AAAAAwAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAKAAAAAY7pD/bDc+DuTj8K0gAAAAA=',
    sdkValue: 123456789012345678901234567890n,
    decoded: { type: 'i128', value: '123456789012345678901234567890' },
  },
] as const;

export const stellarSdkMetadataWithoutSorobanResultXdr = 'AAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const stellarSdkLegacyTransactionMetaXdr = 'AAAAAAAAAAA=';
