import { describe, expect, it } from 'vitest';
import { bytesAHex, hexABytes } from '@/lib/moodle/credenciales-db';

describe('bytea por PostgREST', () => {
  it('ida y vuelta', () => {
    const b = Buffer.from([0, 1, 254, 255]);
    expect(hexABytes(bytesAHex(b)).equals(b)).toBe(true);
  });
  it('el formato es \\x + hex (lo que espera Postgres)', () => {
    expect(bytesAHex(Buffer.from([0xde, 0xad]))).toBe('\\xdead');
  });
});
