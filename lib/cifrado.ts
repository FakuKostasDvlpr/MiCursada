// Cifrado de los tokens del aula virtual — SOLO SERVIDOR.
// AES-256-GCM con nonce de 12 bytes por registro. La clave vive en
// CURSADA_TOKEN_KEY (base64, 32 bytes): un dump de la base se lleva ruido.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function clave(): Buffer {
  const crudo = process.env.CURSADA_TOKEN_KEY;
  if (!crudo) throw new Error('Falta CURSADA_TOKEN_KEY en el entorno.');
  const k = Buffer.from(crudo, 'base64');
  if (k.length !== 32) throw new Error('CURSADA_TOKEN_KEY tiene que ser 32 bytes en base64.');
  return k;
}

/** Cifra un texto. El tag GCM (16 bytes) va pegado al final del cifrado. */
export function cifrar(texto: string): { cifrado: Buffer; nonce: Buffer } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', clave(), nonce);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { cifrado, nonce };
}

export function descifrar(cifrado: Buffer, nonce: Buffer): string {
  const tag = cifrado.subarray(cifrado.length - 16);
  const cuerpo = cifrado.subarray(0, cifrado.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', clave(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cuerpo), decipher.final()]).toString('utf8');
}

/** Hash para el log de eventos: identifica sin identificar (la sal es la clave). */
export function hashUsuario(userId: string): string {
  return createHash('sha256').update(clave()).update(userId).digest('hex');
}
