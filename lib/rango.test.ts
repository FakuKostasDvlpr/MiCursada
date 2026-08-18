import { describe, expect, it } from 'vitest';
import {
  CHUNK,
  cabeceraContentRange,
  headerRangoUpstream,
  parsearRango,
  totalDeContentRange,
} from './rango';

describe('parsearRango', () => {
  it('sin header no hay rango', () => {
    expect(parsearRango(null, 1000)).toBe(null);
    expect(parsearRango('', 1000)).toBe(null);
  });

  it('el pedido clásico del <video> al abrirse', () => {
    // Chrome manda "bytes=0-": pide hasta el final, y le damos una ventana.
    expect(parsearRango('bytes=0-', null)).toEqual({ inicio: 0, fin: CHUNK - 1 });
  });

  it('un tramo explícito se respeta tal cual', () => {
    expect(parsearRango('bytes=0-1023', null)).toEqual({ inicio: 0, fin: 1023 });
    expect(parsearRango('bytes=500-999', 5000)).toEqual({ inicio: 500, fin: 999 });
  });

  it('el final se recorta al tamaño real del archivo', () => {
    expect(parsearRango('bytes=0-99999', 1000)).toEqual({ inicio: 0, fin: 999 });
  });

  it('sufijo "los últimos N bytes" (necesita saber el total)', () => {
    expect(parsearRango('bytes=-500', 5000)).toEqual({ inicio: 4500, fin: 4999 });
    expect(parsearRango('bytes=-500', null)).toBe(null);
  });

  it('un rango fuera del archivo es 416, no un 206 mentiroso', () => {
    expect(parsearRango('bytes=5000-', 5000)).toBe('invalido');
    expect(parsearRango('bytes=900-100', 5000)).toBe('invalido');
  });

  it('multipart y basura no se soportan (se ignora el header)', () => {
    expect(parsearRango('bytes=0-99,200-299', 5000)).toBe(null);
    expect(parsearRango('items=0-10', 5000)).toBe(null);
    expect(parsearRango('bytes=-', 5000)).toBe(null);
  });
});

describe('cabeceraContentRange / totalDeContentRange', () => {
  it('arma el Content-Range con el total', () => {
    expect(cabeceraContentRange({ inicio: 0, fin: 1023 }, 5000)).toBe('bytes 0-1023/5000');
    expect(cabeceraContentRange({ inicio: 0, fin: 1023 }, null)).toBe('bytes 0-1023/*');
  });

  it('lee el total de un Content-Range de upstream', () => {
    expect(totalDeContentRange('bytes 0-1023/5000')).toBe(5000);
    expect(totalDeContentRange('bytes 0-1023/*')).toBe(null);
    expect(totalDeContentRange(null)).toBe(null);
  });
});

describe('headerRangoUpstream', () => {
  it('a Moodle nunca se le pide un rango abierto', () => {
    expect(headerRangoUpstream({ inicio: 0, fin: CHUNK - 1 })).toBe(`bytes=0-${CHUNK - 1}`);
  });
});
