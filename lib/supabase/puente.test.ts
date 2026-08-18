import { describe, expect, it } from 'vitest';
import { emailSombra } from '@/lib/supabase/puente';

describe('emailSombra', () => {
  it('deriva un email sintético estable del id de Moodle', () => {
    expect(emailSombra(10747)).toBe('moodle-10747@micursada.local');
  });
  it('rechaza ids no positivos', () => {
    expect(() => emailSombra(0)).toThrow();
    expect(() => emailSombra(-1)).toThrow();
  });
});
