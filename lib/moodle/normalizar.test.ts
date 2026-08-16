// Portado de cursada-sync/src/normalizar.test.ts (node:test → vitest).
import { describe, expect, it } from 'vitest';
import {
  aTextoPlano,
  decodificarHtml,
  epochADate,
  epochAIso,
  limpiarNombre,
  separarNombreCodigo,
  sinToken,
  urlModulo,
  urlModuloAbsoluta,
} from './normalizar';

describe('decodificarHtml', () => {
  it('decodifica entidades numéricas decimales y hexadecimales', () => {
    expect(decodificarHtml('Programaci&#243;n I&#039;s')).toBe("Programación I's");
    expect(decodificarHtml('D&#x27;Angelo &#x26; asociados')).toBe("D'Angelo & asociados");
  });

  it('decodifica las entidades nombradas comunes', () => {
    expect(decodificarHtml('Ma&ntilde;ana &amp; &quot;pr&aacute;ctica&quot; &lt;b&gt;')).toBe(
      'Mañana & "práctica" <b>'
    );
    expect(decodificarHtml('30&deg; &mdash; &ndash; &hellip; &laquo;x&raquo;')).toBe(
      '30° — – … «x»'
    );
    expect(decodificarHtml('&Ntilde;u &Aacute;lgebra ping&uuml;ino&nbsp;fin')).toBe(
      'Ñu Álgebra pingüino fin'
    );
  });

  it('NO decodifica dos veces: &amp;#039; queda como &#039; literal', () => {
    expect(decodificarHtml('&amp;#039;')).toBe('&#039;');
    expect(decodificarHtml('&amp;amp;')).toBe('&amp;');
  });

  it('deja intacto lo que no es una entidad conocida', () => {
    expect(decodificarHtml('a & b &noexiste; c')).toBe('a & b &noexiste; c');
  });
});

describe('aTextoPlano', () => {
  it('elimina script y style con su contenido', () => {
    const html = '<p>Hola</p><script>alert("x")</script><style>.a{color:red}</style><p>Chau</p>';
    expect(aTextoPlano(html)).toBe('Hola\nChau');
  });

  it('convierte br, li y bloques en saltos de línea y viñetas', () => {
    const html = '<div>Consigna:<br>Entregar<ul><li>Parte A</li><li>Parte B</li></ul></div>';
    expect(aTextoPlano(html)).toBe('Consigna:\nEntregar\n• Parte A\n• Parte B');
  });

  it('decodifica entidades y colapsa espacios conservando los saltos', () => {
    expect(aTextoPlano('<p>An&aacute;lisis    Matem&aacute;tico</p><p>2C</p>')).toBe(
      'Análisis Matemático\n2C'
    );
  });

  it('convierte filas de tabla en saltos', () => {
    expect(aTextoPlano('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>')).toBe('a\nb');
  });
});

describe('separarNombreCodigo / limpiarNombre', () => {
  it('separa el código de comisión entre paréntesis', () => {
    expect(separarNombreCodigo('Programación I (INF-101-A)')).toEqual({
      nombre: 'Programación I',
      codigo: 'INF-101-A',
    });
    expect(limpiarNombre('Programación I (INF-101-A)')).toBe('Programación I');
  });

  it('separa el código entre corchetes', () => {
    expect(separarNombreCodigo('Programación I [2025-2C]')).toEqual({
      nombre: 'Programación I',
      codigo: '2025-2C',
    });
  });

  it('NO recorta paréntesis legítimos con espacios', () => {
    const nombre = 'Análisis Matemático (Comisión de la tarde)';
    expect(separarNombreCodigo(nombre)).toEqual({ nombre, codigo: null });
    expect(limpiarNombre(nombre)).toBe(nombre);
  });

  it('decodifica entidades y colapsa espacios múltiples', () => {
    expect(limpiarNombre('  Bases   de   Datos &amp;   Sistemas  ')).toBe(
      'Bases de Datos & Sistemas'
    );
  });

  it('no devuelve nombre vacío si el nombre entero es un código', () => {
    expect(separarNombreCodigo('(INF-101)')).toEqual({ nombre: '(INF-101)', codigo: null });
  });

  it('quita las comillas que envuelven el nombre completo (caso real de ORT)', () => {
    expect(
      limpiarNombre('&#039;Fundamentos de Programación - Plan 2 años 2°Semestre 2026&#039;')
    ).toBe('Fundamentos de Programación - Plan 2 años 2°Semestre 2026');
    expect(limpiarNombre('&quot;Bases de Datos&quot;')).toBe('Bases de Datos');
    expect(limpiarNombre("'Programación I (INF-101-A)'")).toBe('Programación I');
  });

  it('NO quita comillas que no envuelven todo, distintas entre sí, o sueltas', () => {
    expect(limpiarNombre('D&#039;Angelo y asociados')).toBe("D'Angelo y asociados");
    expect(limpiarNombre('"Mixta\'')).toBe('"Mixta\'');
    expect(limpiarNombre("'")).toBe("'");
  });
});

describe('epochADate', () => {
  it('trata 0 como "sin fecha" y no como 1970', () => {
    expect(epochADate(0)).toBeNull();
  });

  it('devuelve null para null, undefined y negativos', () => {
    expect(epochADate(null)).toBeNull();
    expect(epochADate(undefined)).toBeNull();
    expect(epochADate(-1)).toBeNull();
  });

  it('convierte segundos a milisegundos', () => {
    const d = epochADate(1_700_000_000);
    expect(d).toBeInstanceOf(Date);
    expect(d?.getTime()).toBe(1_700_000_000_000);
    expect(d?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
  });
});

describe('epochAIso', () => {
  it('usa el día de Buenos Aires, no el de UTC (borde nocturno)', () => {
    // 2025-03-01T23:30:00-03:00 → en UTC ya es el 2 de marzo, en BA todavía el 1.
    const epoch = Math.floor(Date.parse('2025-03-02T02:30:00Z') / 1000);
    expect(new Date(epoch * 1000).toISOString().slice(0, 10)).toBe('2025-03-02');
    expect(epochAIso(epoch)).toBe('2025-03-01');
  });

  it('formatea YYYY-MM-DD en un caso diurno', () => {
    expect(epochAIso(Math.floor(Date.parse('2025-07-09T15:00:00Z') / 1000))).toBe('2025-07-09');
  });

  it('propaga el null de "sin fecha"', () => {
    expect(epochAIso(0)).toBeNull();
    expect(epochAIso(null)).toBeNull();
  });
});

describe('urlModulo', () => {
  it('arma la ruta relativa del módulo', () => {
    expect(urlModulo('resource', 12345)).toBe('/mod/resource/view.php?id=12345');
    expect(urlModulo('assign', 7)).toBe('/mod/assign/view.php?id=7');
  });

  it('une con la base sin duplicar barras', () => {
    expect(urlModuloAbsoluta('https://aulavirtual.instituto.ort.edu.ar/', 'forum', 99)).toBe(
      'https://aulavirtual.instituto.ort.edu.ar/mod/forum/view.php?id=99'
    );
    expect(urlModuloAbsoluta('https://aulavirtual.instituto.ort.edu.ar', 'folder', 99)).toBe(
      'https://aulavirtual.instituto.ort.edu.ar/mod/folder/view.php?id=99'
    );
  });
});

describe('sinToken', () => {
  it('redacta token y wstoken en una URL', () => {
    expect(
      sinToken('https://x.edu.ar/webservice/pluginfile.php/1/f.pdf?token=abc123DEF&forcedownload=1')
    ).toBe('https://x.edu.ar/webservice/pluginfile.php/1/f.pdf?token=***&forcedownload=1');
    expect(sinToken('POST /server.php?wstoken=deadbeef0123&wsfunction=core_x')).toBe(
      'POST /server.php?wstoken=***&wsfunction=core_x'
    );
  });

  it('redacta el authtoken del feed .ics', () => {
    expect(
      sinToken('/calendar/export_execute.php?userid=10747&authtoken=abcd1234&preset_what=all')
    ).toBe('/calendar/export_execute.php?userid=10747&authtoken=***&preset_what=all');
  });

  it('redacta también en JSON serializado', () => {
    expect(sinToken('{"token": "s3cr3t"}')).toBe('{"token": "***"}');
  });

  it('no toca texto sin tokens', () => {
    expect(sinToken('Entrega del TP1 el lunes')).toBe('Entrega del TP1 el lunes');
  });
});
