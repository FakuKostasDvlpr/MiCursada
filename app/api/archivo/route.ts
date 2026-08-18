// Proxy de archivos del aula virtual: sirve un PDF/ZIP/imagen de Moodle sin que
// el token salga nunca del servidor.
//
// ── POR QUÉ un `ref` opaco y no la URL ──────────────────────────────────────
// Aceptar una URL por querystring sería un SSRF de manual: cualquiera que
// abriera la app podría hacer que el server pida cualquier host (metadata de la
// nube, servicios internos…) y, peor, con el token de Moodle pegado. Por eso el
// único parámetro es `ref` ("{cmid}:{indice}"), que se resuelve contra el
// índice que escribió el sync: en modo local, el archivo de refs
// (datos/aula-virtual-archivos.json); en modo Supabase (multiusuario), la
// tabla `archivo_refs` (la llena el sync compartido). La URL sale SIEMPRE de
// ahí, nunca del request, y encima se valida que el host sea exactamente el
// de la credencial de Moodle.
//
// El token se agrega recién acá, al hacer el fetch, y no aparece en ninguna
// cabecera ni en el body de la respuesta al cliente.

import fs from 'node:fs/promises';
import { z } from 'zod';
import { rutaDatos } from '@/lib/datos-locales';
import { RE_REF } from '@/lib/moodle/contenido';
import { credencialDelUsuario } from '@/lib/moodle/credencial-actual';
import { leerCredenciales } from '@/lib/moodle/credenciales';
import { cabeceraContentRange, headerRangoUpstream, parsearRango } from '@/lib/rango';
import { hayAcceso } from '@/lib/sesion-actual';
import { adminClient } from '@/lib/supabase/admin';
import { supabaseConfigurado } from '@/lib/supabase/configurado';

export const dynamic = 'force-dynamic';

/**
 * Tope de descarga COMPLETA: más que esto no se previsualiza en el celular
 * igual. No aplica a los pedidos con `Range`, que traen un tramo acotado: así un
 * video largo se puede mirar aunque el archivo entero pase los 25 MB.
 */
const MAX_BYTES = 25 * 1024 * 1024;

const refSchema = z.string().regex(RE_REF);

const refArchivoSchema = z.object({
  url: z.string(),
  nombre: z.string().default(''),
  mime: z.string().default(''),
});

const indiceSchema = z.record(z.string(), refArchivoSchema);

/**
 * `Content-Disposition` con el nombre real del archivo.
 *
 * Las cabeceras HTTP son ByteString: un solo carácter fuera de latin-1 hace
 * explotar `new Response` con un 500 (pasaba con "Modularización.mp4" — la
 * tilde combinante U+0301). Por eso van los dos formatos del RFC 6266: un
 * `filename` ASCII de respaldo y un `filename*` UTF-8 percent-encoded, que es
 * el que usan todos los browsers modernos.
 */
function contentDisposition(nombre: string): string {
  const limpio = nombre.replace(/[\r\n"\\]/g, '').trim() || 'archivo';
  // NFKD + quitar diacríticos: "Modularización" → "Modularizacion".
  const ascii =
    limpio
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '')
      .trim() || 'archivo';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(limpio)}`;
}

export async function GET(request: Request): Promise<Response> {
  // Son los materiales de TU cursada, y el fetch va con tu token: sin sesión no
  // se sirve nada (los route handlers no pasan por el layout de (app)).
  if (!(await hayAcceso())) return new Response('Sin sesión', { status: 401 });

  const ref = refSchema.safeParse(new URL(request.url).searchParams.get('ref') ?? '');
  if (!ref.success) return new Response('Ref inválida', { status: 400 });

  let entrada: z.infer<typeof refArchivoSchema>;
  let cred: Awaited<ReturnType<typeof leerCredenciales>>;

  if (supabaseConfigurado()) {
    // Multiusuario: la ref sale de la base (la llenó el sync compartido) y el
    // token es el DEL USUARIO logueado — así solo ve el archivo quien está
    // inscripto a esa materia.
    const { data, error } = await adminClient()
      .from('archivo_refs')
      .select('datos')
      .eq('ref', ref.data)
      .maybeSingle();
    if (error) return new Response('Error consultando el índice de archivos', { status: 500 });
    if (!data) return new Response('No encontramos ese archivo', { status: 404 });
    try {
      entrada = refArchivoSchema.parse(data.datos);
    } catch {
      return new Response('Archivo inválido', { status: 500 });
    }
    cred = await credencialDelUsuario();
  } else {
    let indice: z.infer<typeof indiceSchema>;
    try {
      indice = indiceSchema.parse(JSON.parse(await fs.readFile(rutaDatos('archivosCurso'), 'utf8')));
    } catch {
      return new Response('No hay índice de archivos. Sincronizá el aula virtual.', { status: 404 });
    }
    const encontrada = indice[ref.data];
    if (encontrada === undefined) return new Response('No encontramos ese archivo', { status: 404 });
    entrada = encontrada;
    cred = await leerCredenciales();
  }

  if (cred === null) return new Response('Sin token del aula virtual', { status: 503 });

  let destino: URL;
  let esperado: URL;
  try {
    destino = new URL(entrada.url);
    esperado = new URL(cred.url);
  } catch {
    return new Response('Archivo inválido', { status: 500 });
  }
  // Anti-SSRF: solo el host del aula virtual, solo https/http, y el token va
  // como query param (es como Moodle sirve pluginfile por web service).
  if (destino.host !== esperado.host || (destino.protocol !== 'https:' && destino.protocol !== 'http:')) {
    return new Response('Archivo fuera del aula virtual', { status: 400 });
  }
  destino.searchParams.set('token', cred.token);

  // El browser manda `Range: bytes=0-` al abrir un <video>: se traduce a una
  // ventana acotada (lib/rango.ts) y se le pide ESO a Moodle.
  const pedido = parsearRango(request.headers.get('range'), null);
  if (pedido === 'invalido') {
    return new Response('Rango inválido', { status: 416, headers: { 'Accept-Ranges': 'bytes' } });
  }

  let upstream: Response;
  try {
    upstream = await fetch(destino, {
      cache: 'no-store',
      ...(pedido === null ? {} : { headers: { Range: headerRangoUpstream(pedido) } }),
    });
  } catch {
    // Ojo: el mensaje del error de red incluiría la URL (con el token).
    return new Response('No pudimos conectarnos al aula virtual', { status: 502 });
  }
  // Moodle sí puede saber que el tramo no existe (nosotros no sabíamos el
  // tamaño antes de pedirlo): su 416 se pasa tal cual.
  if (upstream.status === 416) {
    return new Response('Rango inválido', {
      status: 416,
      headers: {
        'Accept-Ranges': 'bytes',
        ...(upstream.headers.get('content-range') === null
          ? {}
          : { 'Content-Range': upstream.headers.get('content-range') as string }),
      },
    });
  }
  if (!upstream.ok || upstream.body === null) {
    return new Response('El aula virtual no devolvió el archivo', { status: 502 });
  }

  const contentRangeUpstream = upstream.headers.get('content-range');
  // Un 206 sin Content-Range no es usable: se trata como respuesta completa.
  const parcial = upstream.status === 206 && contentRangeUpstream !== null;
  // El tope de 25 MB es para la descarga entera; un tramo ya viene acotado.
  const declarado = Number(upstream.headers.get('content-length') ?? '0');
  if (!parcial && Number.isFinite(declarado) && declarado > MAX_BYTES) {
    return new Response('El archivo es muy grande para verlo acá (más de 25 MB).', {
      status: 413,
    });
  }

  const datos = new Uint8Array(await upstream.arrayBuffer());
  if (!parcial && datos.byteLength > MAX_BYTES) {
    return new Response('El archivo es muy grande para verlo acá (más de 25 MB).', {
      status: 413,
    });
  }

  const tipo =
    upstream.headers.get('content-type') ?? (entrada.mime || 'application/octet-stream');
  const comunes = {
    'Content-Type': tipo,
    // inline para que el PDF se pueda previsualizar en un <iframe>.
    'Content-Disposition': contentDisposition(entrada.nombre),
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    // Se anuncia SIEMPRE: sin esto Safari ni intenta pedir tramos.
    'Accept-Ranges': 'bytes',
  };

  if (parcial) {
    // Moodle entendió el Range: se pasa su Content-Range tal cual (es la única
    // fuente confiable del total del archivo).
    return new Response(datos, {
      status: 206,
      headers: {
        ...comunes,
        'Content-Range': contentRangeUpstream,
        'Content-Length': String(datos.byteLength),
      },
    });
  }

  if (pedido !== null) {
    // Moodle ignoró el Range y mandó todo: recortamos nosotros, así el <video>
    // igual puede adelantar.
    const total = datos.byteLength;
    const rango = parsearRango(request.headers.get('range'), total);
    if (rango === 'invalido' || rango === null) {
      return new Response('Rango inválido', {
        status: 416,
        headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${total}` },
      });
    }
    const tramo = datos.slice(rango.inicio, rango.fin + 1);
    return new Response(tramo, {
      status: 206,
      headers: {
        ...comunes,
        'Content-Range': cabeceraContentRange(rango, total),
        'Content-Length': String(tramo.byteLength),
      },
    });
  }

  return new Response(datos, {
    headers: { ...comunes, 'Content-Length': String(datos.byteLength) },
  });
}
