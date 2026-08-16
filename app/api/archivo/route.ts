// Proxy de archivos del aula virtual: sirve un PDF/ZIP/imagen de Moodle sin que
// el token salga nunca del servidor.
//
// ── POR QUÉ un `ref` opaco y no la URL ──────────────────────────────────────
// Aceptar una URL por querystring sería un SSRF de manual: cualquiera que
// abriera la app podría hacer que el server pida cualquier host (metadata de la
// nube, servicios internos…) y, peor, con el token de Moodle pegado. Por eso el
// único parámetro es `ref` ("{cmid}:{indice}"), que se resuelve contra el
// índice que escribió el sync (datos/aula-virtual-archivos.json). La URL sale
// SIEMPRE de ahí, nunca del request, y encima se valida que el host sea
// exactamente el de la credencial de Moodle.
//
// El token se agrega recién acá, al hacer el fetch, y no aparece en ninguna
// cabecera ni en el body de la respuesta al cliente.

import fs from 'node:fs/promises';
import { z } from 'zod';
import { rutaDatos } from '@/lib/datos-locales';
import { RE_REF } from '@/lib/moodle/contenido';
import { leerCredenciales } from '@/lib/moodle/credenciales';
import { hayAcceso } from '@/lib/sesion-actual';

export const dynamic = 'force-dynamic';

/** Tope de descarga: más que esto no se previsualiza en el celular igual. */
const MAX_BYTES = 25 * 1024 * 1024;

const refSchema = z.string().regex(RE_REF);

const indiceSchema = z.record(
  z.string(),
  z.object({ url: z.string(), nombre: z.string().default(''), mime: z.string().default('') })
);

/** Nombre de archivo seguro para Content-Disposition (ASCII, sin comillas). */
function nombreSeguro(nombre: string): string {
  const limpio = nombre.replace(/[\r\n"\\]/g, '').trim();
  return limpio === '' ? 'archivo' : limpio;
}

export async function GET(request: Request): Promise<Response> {
  // Son los materiales de TU cursada, y el fetch va con tu token: sin sesión no
  // se sirve nada (los route handlers no pasan por el layout de (app)).
  if (!(await hayAcceso())) return new Response('Sin sesión', { status: 401 });

  const ref = refSchema.safeParse(new URL(request.url).searchParams.get('ref') ?? '');
  if (!ref.success) return new Response('Ref inválida', { status: 400 });

  let indice: z.infer<typeof indiceSchema>;
  try {
    indice = indiceSchema.parse(JSON.parse(await fs.readFile(rutaDatos('archivosCurso'), 'utf8')));
  } catch {
    return new Response('No hay índice de archivos. Sincronizá el aula virtual.', { status: 404 });
  }

  const entrada = indice[ref.data];
  if (entrada === undefined) return new Response('No encontramos ese archivo', { status: 404 });

  const cred = await leerCredenciales();
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

  let upstream: Response;
  try {
    upstream = await fetch(destino, { cache: 'no-store' });
  } catch {
    // Ojo: el mensaje del error de red incluiría la URL (con el token).
    return new Response('No pudimos conectarnos al aula virtual', { status: 502 });
  }
  if (!upstream.ok || upstream.body === null) {
    return new Response('El aula virtual no devolvió el archivo', { status: 502 });
  }

  const declarado = Number(upstream.headers.get('content-length') ?? '0');
  if (Number.isFinite(declarado) && declarado > MAX_BYTES) {
    return new Response('El archivo es muy grande para verlo acá (más de 25 MB).', {
      status: 413,
    });
  }

  const datos = new Uint8Array(await upstream.arrayBuffer());
  if (datos.byteLength > MAX_BYTES) {
    return new Response('El archivo es muy grande para verlo acá (más de 25 MB).', {
      status: 413,
    });
  }

  const tipo =
    upstream.headers.get('content-type') ?? (entrada.mime || 'application/octet-stream');
  return new Response(datos, {
    headers: {
      'Content-Type': tipo,
      // inline para que el PDF se pueda previsualizar en un <iframe>.
      'Content-Disposition': `inline; filename="${nombreSeguro(entrada.nombre)}"`,
      'Content-Length': String(datos.byteLength),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
