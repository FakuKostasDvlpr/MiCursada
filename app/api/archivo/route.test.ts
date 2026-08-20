/**
 * Tests del proxy de archivos, con foco en Range (HTTP 206).
 *
 * Sin Range el `<video>` de los 25 mp4 del aula no se puede adelantar (y en
 * Safari ni arranca), así que esto se prueba de verdad: se mockea la sesión, el
 * índice de refs, las credenciales y `fetch`, y se ejercita el handler entero.
 *
 * Invariante que también se verifica acá: el token NUNCA sale en la respuesta.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOKEN = 'tokensecretodemoodle123456789abc';
const CUERPO = new Uint8Array(5000).map((_, i) => i % 251);

const indice = {
  '146330:0': {
    url: 'https://aula.example.edu/webservice/pluginfile.php/1/mod_resource/content/clase.mp4',
    nombre: 'Unidad 6 - 2018.mp4',
    mime: 'video/mp4',
  },
  // Nombre REAL del aula, con tilde: es el que rompía la cabecera.
  '143173:0': {
    url: 'https://aula.example.edu/webservice/pluginfile.php/1/mod_resource/content/mod.mp4',
    nombre: 'Modularizácion.mp4',
    mime: 'video/mp4',
  },
};

vi.mock('@/lib/sesion-actual', () => ({ hayAcceso: async () => true }));
vi.mock('@/lib/moodle/credenciales', () => ({
  leerCredenciales: async () => ({ token: TOKEN, url: 'https://aula.example.edu', userid: 1 }),
}));
vi.mock('@/lib/datos-locales', () => ({ rutaDatos: () => '/fake/aula-virtual-archivos.json' }));
// El proxy cachea el índice en memoria y lo invalida por `mtime`, así que el
// mock necesita `stat` además de `readFile`. El mtime es constante: el índice de
// este test tampoco cambia.
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: async () => JSON.stringify(indice),
    stat: async () => ({ mtimeMs: 1 }),
  },
}));

const { GET } = await import('./route');

/** Última llamada a fetch: [url, init]. */
let ultimoPedido: { url: string; range: string | null };

/** Moodle que SÍ entiende Range (lo normal en pluginfile.php). */
function moodleConRange() {
  return vi.fn(async (destino: URL | string, init?: RequestInit) => {
    const cabeceras = new Headers(init?.headers);
    const range = cabeceras.get('Range');
    ultimoPedido = { url: String(destino), range };
    if (range === null) {
      return new Response(CUERPO, {
        status: 200,
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(CUERPO.byteLength) },
      });
    }
    const m = /^bytes=(\d+)-(\d+)$/.exec(range);
    const inicio = Number(m?.[1] ?? 0);
    if (inicio >= CUERPO.byteLength) {
      return new Response('', {
        status: 416,
        headers: { 'Content-Range': `bytes */${CUERPO.byteLength}` },
      });
    }
    const fin = Math.min(Number(m?.[2] ?? 0), CUERPO.byteLength - 1);
    const tramo = CUERPO.slice(inicio, fin + 1);
    return new Response(tramo, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${inicio}-${fin}/${CUERPO.byteLength}`,
        'Content-Length': String(tramo.byteLength),
      },
    });
  });
}

/** Moodle que IGNORA el Range y devuelve todo (el proxy tiene que recortar). */
function moodleSinRange() {
  return vi.fn(async (destino: URL | string, init?: RequestInit) => {
    ultimoPedido = { url: String(destino), range: new Headers(init?.headers).get('Range') };
    return new Response(CUERPO, {
      status: 200,
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(CUERPO.byteLength) },
    });
  });
}

const pedir = (headers: Record<string, string> = {}) =>
  GET(new Request('http://localhost/api/archivo?ref=146330%3A0', { headers }));

beforeEach(() => {
  ultimoPedido = { url: '', range: null };
});

describe('GET /api/archivo — sin Range', () => {
  it('devuelve 200 con el archivo entero y anuncia Accept-Ranges', async () => {
    vi.stubGlobal('fetch', moodleSinRange());
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get('Accept-Ranges')).toBe('bytes');
    expect(r.headers.get('Content-Length')).toBe('5000');
    expect(r.headers.get('Content-Range')).toBe(null);
    expect((await r.arrayBuffer()).byteLength).toBe(5000);
  });
});

describe('GET /api/archivo — Range', () => {
  it('bytes=0-1023 → 206 con Content-Range correcto y 1024 bytes', async () => {
    vi.stubGlobal('fetch', moodleConRange());
    const r = await pedir({ Range: 'bytes=0-1023' });
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 0-1023/5000');
    expect(r.headers.get('Content-Length')).toBe('1024');
    expect(r.headers.get('Accept-Ranges')).toBe('bytes');
    const cuerpo = new Uint8Array(await r.arrayBuffer());
    expect(cuerpo.byteLength).toBe(1024);
    expect(cuerpo[0]).toBe(CUERPO[0]);
    expect(cuerpo[1023]).toBe(CUERPO[1023]);
  });

  it('un tramo del medio devuelve exactamente esos bytes', async () => {
    vi.stubGlobal('fetch', moodleConRange());
    const r = await pedir({ Range: 'bytes=1000-1999' });
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 1000-1999/5000');
    const cuerpo = new Uint8Array(await r.arrayBuffer());
    expect(cuerpo[0]).toBe(CUERPO[1000]);
    expect(cuerpo.byteLength).toBe(1000);
  });

  it('"bytes=0-" (lo que manda el <video>) no le pide a Moodle un rango abierto', async () => {
    vi.stubGlobal('fetch', moodleConRange());
    const r = await pedir({ Range: 'bytes=0-' });
    expect(r.status).toBe(206);
    // El proxy acota la ventana antes de salir a la red.
    expect(ultimoPedido.range).toMatch(/^bytes=0-\d+$/);
    expect(ultimoPedido.range).not.toBe('bytes=0-');
    // El archivo es más chico que la ventana: viene entero, pero como 206.
    expect(r.headers.get('Content-Range')).toBe('bytes 0-4999/5000');
  });

  it('si Moodle ignora el Range, el proxy recorta igual y responde 206', async () => {
    vi.stubGlobal('fetch', moodleSinRange());
    const r = await pedir({ Range: 'bytes=0-1023' });
    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 0-1023/5000');
    expect((await r.arrayBuffer()).byteLength).toBe(1024);
  });

  it('un rango fuera del archivo da 416', async () => {
    vi.stubGlobal('fetch', moodleConRange());
    const r = await pedir({ Range: 'bytes=99999-' });
    expect(r.status).toBe(416);
    expect(r.headers.get('Accept-Ranges')).toBe('bytes');
    expect(r.headers.get('Content-Range')).toBe('bytes */5000');
  });

  it('si Moodle mandó todo, el rango fuera del archivo también da 416', async () => {
    vi.stubGlobal('fetch', moodleSinRange());
    const r = await pedir({ Range: 'bytes=99999-' });
    expect(r.status).toBe(416);
    expect(r.headers.get('Content-Range')).toBe('bytes */5000');
  });
});

describe('GET /api/archivo — Content-Disposition', () => {
  it('un nombre con tilde no rompe la cabecera (era un 500)', async () => {
    vi.stubGlobal('fetch', moodleSinRange());
    const r = await pedir();
    expect(r.status).toBe(200);
    const cd = r.headers.get('Content-Disposition') ?? '';
    // El nombre real del índice es "Unidad 6 - 2018.mp4"; el caso que reventaba
    // es "Modularización.mp4" (U+0301 combinante) — ver contentDisposition.
    expect(cd).toContain('inline; filename="');
    expect(cd).toContain("filename*=UTF-8''");
  });

  it('"Modularización.mp4" (U+0301) se sirve sin explotar', async () => {
    vi.stubGlobal('fetch', moodleSinRange());
    const r = await GET(new Request('http://localhost/api/archivo?ref=143173%3A0'));
    expect(r.status).toBe(200);
    const cd = r.headers.get('Content-Disposition') ?? '';
    expect(cd).toContain('filename="Modularizacion.mp4"');
    expect(cd).toContain("filename*=UTF-8''");
    // La cabecera tiene que ser latin-1 pura o `new Response` tira TypeError.
    expect([...cd].every((c) => c.charCodeAt(0) < 256)).toBe(true);
  });
});

describe('GET /api/archivo — el token no se filtra', () => {
  it('el token va a Moodle pero no aparece en ninguna cabecera de la respuesta', async () => {
    vi.stubGlobal('fetch', moodleConRange());
    const r = await pedir({ Range: 'bytes=0-1023' });
    // Sí se usa contra Moodle…
    expect(ultimoPedido.url).toContain(`token=${TOKEN}`);
    // …y no vuelve al cliente por ningún lado.
    const cabeceras = [...r.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
    expect(cabeceras).not.toContain(TOKEN);
    expect(cabeceras).not.toContain('token=');
  });

  it('una ref inválida no llega a la red', async () => {
    const espia = moodleConRange();
    vi.stubGlobal('fetch', espia);
    const r = await GET(new Request('http://localhost/api/archivo?ref=../../etc/passwd'));
    expect(r.status).toBe(400);
    expect(espia).not.toHaveBeenCalled();
  });
});
