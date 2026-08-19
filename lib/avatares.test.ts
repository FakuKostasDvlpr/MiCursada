import { describe, expect, it } from 'vitest';
import {
  AVISAR_DESDE,
  LADO_AVATAR,
  MAX_GIF,
  MAX_ORIGINAL,
  MAX_SUBIDA,
  formatearPeso,
} from '@/lib/avatares';
import { recorteCover } from '@/lib/imagen';

describe('formatearPeso', () => {
  it('muestra bytes debajo de 1 KB', () => {
    expect(formatearPeso(612)).toBe('612 bytes');
  });

  it('muestra KB redondeados, sin decimales', () => {
    expect(formatearPeso(28 * 1024)).toBe('28 KB');
    expect(formatearPeso(1024)).toBe('1 KB');
  });

  it('un valor redondo va sin decimal', () => {
    expect(formatearPeso(2 * 1024 * 1024)).toBe('2 MB');
  });

  it('muestra MB con un decimal y coma, como se escribe en castellano', () => {
    expect(formatearPeso(8.43 * 1024 * 1024)).toBe('8,4 MB');
    expect(formatearPeso(1024 * 1024)).toBe('1 MB');
  });

  it('no rompe con valores inválidos', () => {
    expect(formatearPeso(Number.NaN)).toBe('—');
    expect(formatearPeso(-5)).toBe('—');
  });

  it('el cero es cero bytes, no un guion', () => {
    expect(formatearPeso(0)).toBe('0 bytes');
  });
});

describe('presupuesto del bucket', () => {
  it('el aviso salta antes del máximo del server', () => {
    expect(AVISAR_DESDE).toBeLessThan(MAX_SUBIDA);
  });

  it('un GIF al tope entra en lo que acepta el server', () => {
    expect(MAX_GIF).toBeLessThanOrEqual(MAX_SUBIDA);
  });

  it('el techo del original es mayor que el de la subida (se optimiza en el medio)', () => {
    expect(MAX_ORIGINAL).toBeGreaterThan(MAX_SUBIDA);
  });

  it('el lado alcanza para el avatar más grande de la app (160 px) en pantallas retina', () => {
    expect(LADO_AVATAR).toBeGreaterThanOrEqual(160);
  });
});

describe('recorteCover', () => {
  it('una imagen cuadrada se toma entera', () => {
    expect(recorteCover(800, 800)).toEqual({ sx: 0, sy: 0, lado: 800 });
  });

  it('una apaisada se recorta a los costados, centrada', () => {
    expect(recorteCover(1000, 600)).toEqual({ sx: 200, sy: 0, lado: 600 });
  });

  it('una vertical se recorta arriba y abajo, centrada', () => {
    expect(recorteCover(600, 1000)).toEqual({ sx: 0, sy: 200, lado: 600 });
  });

  it('el recorte nunca se sale de la imagen', () => {
    for (const [a, h] of [
      [1, 1],
      [4032, 3024],
      [3024, 4032],
      [1920, 1080],
    ] as const) {
      const r = recorteCover(a, h);
      expect(r.sx + r.lado).toBeLessThanOrEqual(a);
      expect(r.sy + r.lado).toBeLessThanOrEqual(h);
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
    }
  });

  it('con lado impar sobrante no pierde píxeles por redondeo', () => {
    const r = recorteCover(101, 100);
    expect(r.lado).toBe(100);
    expect(r.sx + r.lado).toBeLessThanOrEqual(101);
  });
});
