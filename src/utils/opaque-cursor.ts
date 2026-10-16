import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const TOKEN_VERSION = 'v1';
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const DEVELOPMENT_SECRET = 'soroban-explorer-development-cursor-secret';

function getKey(): Buffer {
  const secret =
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === 'production' ? undefined : DEVELOPMENT_SECRET);
  if (!secret) {
    throw new Error('JWT_SECRET is required to issue or validate API cursors in production');
  }
  return createHmac('sha256', secret).update('soroban-api-cursor-v1').digest();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function createCursorScope(endpoint: string, query: unknown): string {
  return JSON.stringify({
    endpoint,
    network: process.env.STELLAR_NETWORK ?? 'testnet',
    query: canonicalize(query),
  });
}

export function encodeOpaqueCursor(payload: unknown, scope: string): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getKey(), nonce);
  cipher.setAAD(Buffer.from(TOKEN_VERSION));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ scope, payload }), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `${TOKEN_VERSION}.${nonce.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decodeOpaqueCursor(token: string, scope: string): unknown | null {
  if (token.length > 4096) return null;

  const [version, encodedNonce, encodedCiphertext, extra] = token.split('.');
  if (version !== TOKEN_VERSION || !encodedNonce || !encodedCiphertext || extra !== undefined) {
    return null;
  }

  try {
    const nonce = Buffer.from(encodedNonce, 'base64url');
    const encrypted = Buffer.from(encodedCiphertext, 'base64url');
    if (nonce.length !== NONCE_BYTES || encrypted.length <= AUTH_TAG_BYTES) return null;

    const ciphertext = encrypted.subarray(0, -AUTH_TAG_BYTES);
    const authTag = encrypted.subarray(-AUTH_TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', getKey(), nonce);
    decipher.setAAD(Buffer.from(TOKEN_VERSION));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );
    const parsed: unknown = JSON.parse(plaintext);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('scope' in parsed) ||
      parsed.scope !== scope ||
      !('payload' in parsed)
    ) {
      return null;
    }
    return parsed.payload;
  } catch {
    return null;
  }
}
