import { describe, expect, it } from 'vitest';
import { subtituloLogro } from './logro';

describe('subtituloLogro', () => {
  it('los tres primeros hitos tienen texto propio', () => {
    expect(subtituloLogro(1)).toBe('Primera nota de tu cursada · +50 XP');
    expect(subtituloLogro(5)).toBe('¡5 notas! Vas tomando ritmo · +100 XP');
    expect(subtituloLogro(10)).toBe('10 notas. Imparable · +150 XP');
  });

  it('cada 25 notas hay hito grande', () => {
    expect(subtituloLogro(25)).toBe('25 notas acumuladas · +250 XP');
    expect(subtituloLogro(50)).toBe('50 notas acumuladas · +250 XP');
  });

  it('fuera de un hito no hay logro', () => {
    expect(subtituloLogro(2)).toBeNull();
    expect(subtituloLogro(9)).toBeNull();
    expect(subtituloLogro(26)).toBeNull();
  });

  it('el 0 no cuenta como múltiplo de 25', () => {
    expect(subtituloLogro(0)).toBeNull();
  });
});
