import crypto from 'crypto';

// Llave legacy: solo para PODER LEER datos que se encriptaron antes de exigir
// ENCRYPTION_KEY. NUNCA se usa para encriptar datos nuevos.
const LEGACY_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Valida y normaliza la llave — debe ser exactamente 32 bytes (64 hex).
// FAIL-CLOSED: si ENCRYPTION_KEY falta o es inválida, el proceso NO arranca
// (en vez de caer silenciosamente en una llave pública conocida).
function resolveKey(raw) {
  const buf = Buffer.from(raw || '', 'hex');
  if (buf.length === 32) return buf;
  throw new Error(
    'ENCRYPTION_KEY inválida o ausente: debe ser una cadena hex de 64 caracteres (32 bytes). ' +
    'Configúrala como variable de entorno antes de iniciar el servidor.'
  );
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

  // Prueba la llave activa primero; luego la legacy solo para LEER datos antiguos.
  const keysToTry = [ACTIVE_KEY, Buffer.from(LEGACY_KEY, 'hex')];
  for (const key of keysToTry) {
    try {
      const result = tryDecrypt(encryptedData, key);
      if (result) return result;
    } catch (_) { /* try next key */ }
  }

  console.error('Decryption error: all keys failed');
  return null;
}
