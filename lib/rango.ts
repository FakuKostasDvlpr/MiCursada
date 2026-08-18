// Range requests (RFC 9110 §14) para el proxy de archivos.
//
// ── POR QUÉ ────────────────────────────────────────────────────────────────
// En el aula hay 25 videos mp4 subidos al propio Moodle. Un `<video>` NUNCA
// pide el archivo entero: Chrome/Safari/Firefox mandan `Range: bytes=0-` y
// después van pidiendo tramos para adelantar. Si el server contesta siempre 200
// con todo el cuerpo, el scrub no funciona y en Safari el video ni arranca.
//
// Estas funciones son PURAS (sin red ni disco) para poder testearlas solas;
// app/api/archivo/route.ts las usa para hablar con Moodle y para armar el 206.

/** Un tramo pedido: `fin` es INCLUSIVO, como en HTTP. */
export type Rango = { inicio: number; fin: number };

/**
 * Tamaño máximo de tramo que devolvemos de una. Un `Range: bytes=0-` (lo que
 * manda el browser al abrir un video) pide "de acá hasta el final": si el
 * archivo son 300 MB no vamos a bufferearlos. HTTP permite devolver MENOS de lo
 * pedido, así que se recorta a esta ventana y el browser sigue pidiendo el resto.
 *
 * 1 MiB alcanza de sobra para el `moov` de un mp4 (lo que el browser necesita
 * para saber la duración) y para que el scrub se sienta inmediato, sin que
 * abrir un módulo con 23 videos dispare 23 descargas gigantes contra Moodle.
 */
export const CHUNK = 1024 * 1024;

const RE_RANGO = /^bytes=(\d*)-(\d*)$/i;

/**
 * `Range: bytes=…` → tramo absoluto, o null si no hay header / no se entiende /
 * pide un solo rango de más de uno (multipart: no lo soportamos a propósito).
 *
 * `total` puede ser null cuando todavía no sabemos cuánto mide el archivo: en
 * ese caso un sufijo (`bytes=-500`) no se puede resolver y devuelve null.
 * Devuelve `'inválido'` cuando el rango es sintácticamente correcto pero cae
 * fuera del archivo (hay que contestar 416).
 */
export function parsearRango(
  header: string | null | undefined,
  total: number | null
): Rango | 'invalido' | null {
  if (!header) return null;
  const m = RE_RANGO.exec(header.trim());
  if (m === null) return null;
  const crudoInicio = m[1] ?? '';
  const crudoFin = m[2] ?? '';
  if (crudoInicio === '' && crudoFin === '') return null;

  // Sufijo: "los últimos N bytes".
  if (crudoInicio === '') {
    if (total === null) return null;
    const n = Number(crudoFin);
    if (n <= 0) return 'invalido';
    return { inicio: Math.max(0, total - n), fin: total - 1 };
  }

  const inicio = Number(crudoInicio);
  if (total !== null && inicio >= total) return 'invalido';
  const finPedido = crudoFin === '' ? Infinity : Number(crudoFin);
  if (finPedido < inicio) return 'invalido';

  const topeArchivo = total === null ? Infinity : total - 1;
  const fin = Math.min(finPedido, topeArchivo, inicio + CHUNK - 1);
  if (!Number.isFinite(fin)) return null;
  return { inicio, fin };
}

/** `Content-Range: bytes 0-1023/5000`. `total` desconocido → `*`. */
export function cabeceraContentRange(rango: Rango, total: number | null): string {
  return `bytes ${rango.inicio}-${rango.fin}/${total === null ? '*' : total}`;
}

/** El total del archivo que declara un `Content-Range` de upstream, o null. */
export function totalDeContentRange(header: string | null | undefined): number | null {
  const m = /^bytes\s+\d+-\d+\/(\d+)$/i.exec((header ?? '').trim());
  return m === null ? null : Number(m[1]);
}

/** Lo que le pedimos a Moodle: nunca `bytes=N-` abierto, siempre una ventana. */
export function headerRangoUpstream(rango: Rango): string {
  return `bytes=${rango.inicio}-${rango.fin}`;
}
