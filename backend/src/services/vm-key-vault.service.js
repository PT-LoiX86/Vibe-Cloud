import crypto from 'node:crypto';
import { env } from '../config/env.js';

function getAesKey() {
  return crypto
    .createHash('sha256')
    .update(String(env.vmKeyEncryptionSecret))
    .digest();
}

export function computeSshKeyFingerprint(publicKeyLine) {
  const parts = String(publicKeyLine || '').trim().split(/\s+/);
  if (parts.length < 2) return null;
  const rawBlob = Buffer.from(parts[1], 'base64');
  const hash = crypto.createHash('sha256').update(rawBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${hash}`;
}

export function encryptPrivateKey(privateKeyPem) {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(privateKeyPem), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedPrivateKey: encrypted.toString('base64'),
    keyIv: iv.toString('base64'),
    keyAuthTag: authTag.toString('base64'),
  };
}

export function decryptPrivateKey({ encryptedPrivateKey, keyIv, keyAuthTag }) {
  if (!encryptedPrivateKey || !keyIv || !keyAuthTag) {
    throw new Error('Managed SSH key material is missing or has been wiped.');
  }
  const key = getAesKey();
  const iv = Buffer.from(keyIv, 'base64');
  const authTag = Buffer.from(keyAuthTag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPrivateKey, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
