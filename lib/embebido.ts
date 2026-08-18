// Helpers del lector embebido: URLs de embed, links al proxy de archivos y
// formateo de tipo/tamaño. Puras y SIN dependencias de node: las usa tanto el
// sanitizador del server (lib/moodle/contenido.ts) como el acordeón del cliente
// (components/materia-detalle.tsx).

/** Prefijo de `ModuloCurso.video` cuando es una playlist y no un video suelto. */
export const PREFIJO_LISTA = 'lista:';

export const esLista = (video: string): boolean => video.startsWith(PREFIJO_LISTA);

export const idLista = (video: string): string => video.slice(PREFIJO_LISTA.length);

/**
 * URL de embed de un video o de una playlist. SIEMPRE youtube-nocookie: es el
 * mismo reproductor pero sin las cookies de tracking de youtube.com.
 *
 * `inicioSeg` (el `t`/`start` que traía el link original) se agrega como
 * `start=` para que el player arranque donde apuntaba el profe.
 */
export function urlEmbed(video: string, inicioSeg?: number): string {
  const inicio =
    typeof inicioSeg === 'number' && Number.isFinite(inicioSeg) && inicioSeg > 0
      ? `&start=${Math.floor(inicioSeg)}`
      : '';
  if (esLista(video)) {
    return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(
      idLista(video)
    )}&rel=0${inicio}`;
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video)}?rel=0${inicio}`;
}

/** URL de embed de un video de Vimeo, a partir de su id numérico. */
export function urlEmbedVimeo(id: string): string {
  return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
}

/**
 * URL de embed de una presentación de SlideShare, a partir de su `key`.
 *
 * La key NO se puede derivar del link público de la presentación
 * (`/Autor/titulo-del-slide`): sale únicamente del código de embed que pegó el
 * profe. Por eso este helper recibe la key ya extraída de un `<iframe>` real y
 * nunca se arma una a partir de un `<a href>`.
 */
export function urlEmbedSlideShare(key: string): string {
  return `https://www.slideshare.net/slideshow/embed_code/key/${encodeURIComponent(key)}`;
}

/**
 * ¿El HTML del módulo ya trae ESE player embebido?
 *
 * El sanitizador convierte los links de video del profe en `<figure class=
 * "video">`, así que el `video` del módulo puede estar ya dibujado adentro del
 * html: sin este chequeo se vería el mismo video dos veces.
 */
export function playerEnHtml(video: string, html: string): boolean {
  return esLista(video) ? html.includes(`list=${idLista(video)}`) : html.includes(`/embed/${video}`);
}

/**
 * Miniatura de un video de YouTube, o null si es una playlist (no tiene una
 * propia derivable del id).
 *
 * `hqdefault` existe SIEMPRE, incluso en videos viejos; `maxresdefault` da 404
 * en muchos y dejaría la celda vacía.
 */
export function miniaturaYoutube(video: string): string | null {
  if (esLista(video)) return null;
  return `https://i.ytimg.com/vi/${encodeURIComponent(video)}/hqdefault.jpg`;
}

/** Link "de verdad" a YouTube, para abrirlo afuera si el embed no alcanza. */
export function urlYoutube(video: string): string {
  return esLista(video)
    ? `https://www.youtube.com/playlist?list=${encodeURIComponent(idLista(video))}`
    : `https://www.youtube.com/watch?v=${encodeURIComponent(video)}`;
}

/** Link al proxy que resuelve la ref del lado servidor. */
export function urlArchivo(ref: string): string {
  return `/api/archivo?ref=${encodeURIComponent(ref)}`;
}

const ETIQUETA_MIME: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
  'application/x-rar-compressed': 'RAR',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/gif': 'GIF',
  'image/webp': 'WEBP',
  'video/mp4': 'MP4',
  'audio/mpeg': 'MP3',
};

/** "PDF", "ZIP", "DOCX"… Si el mime no dice nada, la extensión del nombre. */
export function tipoArchivo(mime: string, nombre: string): string {
  const porMime = ETIQUETA_MIME[mime.toLowerCase()];
  if (porMime) return porMime;
  const ext = nombre.includes('.') ? (nombre.split('.').pop() ?? '') : '';
  return ext === '' ? 'Archivo' : ext.toUpperCase().slice(0, 6);
}

/** Los PDFs se pueden previsualizar en un iframe; el resto solo se descarga. */
export const esPdf = (mime: string, nombre: string): boolean =>
  mime.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(nombre);

/**
 * Con qué se muestra un archivo adentro de la app.
 *
 * - `pdf` → visor embebido (iframe)
 * - `imagen` → `<img>` inline, se ve sin descargar nada
 * - `video` → `<video controls>` contra el proxy (soporta Range)
 * - `ninguno` → zip, docx, lo que sea: solo "Descargar"
 */
export type Visor = 'pdf' | 'imagen' | 'video' | 'ninguno';

/** Extensión en minúsculas, sin el punto ("Unidad 6 - 2018.MP4" → "mp4"). */
const extension = (nombre: string): string =>
  nombre.includes('.') ? (nombre.split('.').pop() ?? '').toLowerCase() : '';

const EXT_IMAGEN = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']);
const EXT_VIDEO = new Set(['mp4', 'm4v', 'webm', 'ogv', 'mov']);

/**
 * Visor que le toca a un archivo, por mimetype y —si el mime no dice nada— por
 * extensión.
 *
 * El fallback por extensión NO es cosmético: en el aula real hay 14 archivos que
 * Moodle informa como `application/octet-stream` y que en realidad son PDFs,
 * PNGs y hasta un `.mp4` ("Unidad 6 - 2018.mp4"). Sin esto quedarían como
 * "solo descargar".
 */
export function tipoVisor(mime: string, nombre: string): Visor {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  const ext = extension(nombre);
  if (esPdf(m, nombre)) return 'pdf';
  if (m.startsWith('image/') || EXT_IMAGEN.has(ext)) return 'imagen';
  if (m.startsWith('video/') || EXT_VIDEO.has(ext)) return 'video';
  return 'ninguno';
}

/** 0 → "", 165 000 → "161 KB", 2 400 000 → "2,3 MB". */
export function tamanoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

/** "youtube.com" — el dominio visible de un enlace externo. */
export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
