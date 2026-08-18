import { beforeEach, describe, expect, it } from 'vitest';
import { cifrar, descifrar, hashUsuario } from '@/lib/cifrado';

describe('cifrado', () => {
  beforeEach(() => {
    process.env.CURSADA_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('descifrar(cifrar(x)) === x', () => {
    const { cifrado, nonce } = cifrar('token-secreto-123');
    expect(descifrar(cifrado, nonce)).toBe('token-secreto-123');
  });

  it('cada cifrado usa un nonce distinto', () => {
    const a = cifrar('igual');
    const b = cifrar('igual');
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.cifrado.equals(b.cifrado)).toBe(false);
  });

  it('un cifrado manoseado no descifra (GCM autentica)', () => {
    const { cifrado, nonce } = cifrar('token');
    cifrado.writeUInt8(cifrado.readUInt8(0) ^ 0xff, 0);
    expect(() => descifrar(cifrado, nonce)).toThrow();
  });

  it('sin clave en el entorno, tira un error claro', () => {
    delete process.env.CURSADA_TOKEN_KEY;
    expect(() => cifrar('x')).toThrow(/CURSADA_TOKEN_KEY/);
  });

  it('hashUsuario es determinístico y no contiene el id', () => {
    const h = hashUsuario('abc-123');
    expect(h).toBe(hashUsuario('abc-123'));
    expect(h).not.toContain('abc-123');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
