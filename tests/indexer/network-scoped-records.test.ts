import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

describe('network-scoped indexed records', () => {
  const models = Prisma.dmmf.datamodel.models;
  const getModel = (name: string) => models.find((model) => model.name === name);

  it('uses network as part of ledger identity and transaction/event references', () => {
    const ledger = getModel('Ledger');
    const transaction = getModel('Transaction');
    const event = getModel('Event');
    const signatureInspection = getModel('SignatureInspection');

    expect(ledger?.primaryKey?.fields).toEqual(['network', 'sequence']);
    expect(ledger?.uniqueFields).toContainEqual(['network', 'hash']);
    expect(ledger?.uniqueFields).not.toContainEqual(['sequence']);
    expect(transaction?.uniqueFields).toContainEqual(['network', 'hash']);
    expect(transaction?.uniqueFields).not.toContainEqual(['hash']);
    expect(event?.fields.find((field) => field.name === 'network')?.isRequired).toBe(true);
    expect(signatureInspection?.uniqueFields).toContainEqual(['network', 'transactionHash']);
  });

  it('requires network fields on both sides of ledger and transaction relations', () => {
    const transaction = getModel('Transaction');
    const event = getModel('Event');

    expect(
      transaction?.fields.find((field) => field.name === 'ledger')?.relationFromFields,
    ).toEqual(['network', 'ledgerSequence']);
    expect(event?.fields.find((field) => field.name === 'ledger')?.relationFromFields).toEqual([
      'network',
      'ledgerSequence',
    ]);
    expect(event?.fields.find((field) => field.name === 'transaction')?.relationFromFields).toEqual(
      ['network', 'transactionHash'],
    );
  });
});
