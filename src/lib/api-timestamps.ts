import type { Express } from 'express';

const API_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/i;

export function normalizeApiTimestamp(value: unknown): unknown {
  if (typeof value !== 'string' || !API_TIMESTAMP_PATTERN.test(value)) return value;

  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  const instant = new Date(timestamp);
  return Number.isNaN(instant.getTime()) ? value : instant.toISOString();
}

export function apiTimestampReplacer(_key: string, value: unknown): unknown {
  return normalizeApiTimestamp(value);
}

export function configureApiJsonSerialization(app: Express): void {
  app.set('json replacer', apiTimestampReplacer);
}
