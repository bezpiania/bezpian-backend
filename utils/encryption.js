import crypto from 'crypto';

const DEFAULT_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Validate and normalize encryption key — must be exactly 32 bytes (64 hex chars)
function resolveKey(raw) {
  const buf = Buffer.from(raw || '', 'hex');
  if (buf.length === 32) return buf;
  // Invalid key (non-hex chars, wrong length) — fall back to default
  return Buffer.from(DEFAULT_KEY, 'hex');
}

const ACTIVE_KEY = resolveKey(process.env.ENCRYPTION_KEY);

export function encrypt(text) {
  if (!text) return null;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ACTIVE_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

function tryDecrypt(encryptedData, key) {
  const parts = encryptedData.split(':');
  if (parts.length !== 2) return null;
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(parts[1], 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function decrypt(encryptedData) {
  if (!encryptedData) return null;

  // Try active key first, then fall back to default key (handles migrated data)
  const keysToTry = [ACTIVE_KEY, Buffer.from(DEFAULT_KEY, 'hex')];
  for (const key of keysToTry) {
    try {
      const result = tryDecrypt(encryptedData, key);
      if (result) return result;
    } catch (_) { /* try next key */ }
  }

  console.error('Decryption error: all keys failed');
  return null;
}
