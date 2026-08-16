/**
 * Contenido rico de los módulos del aula virtual: sanitización del HTML,
 * detección de video de YouTube y armado de la lista de archivos con refs
 * OPACAS (el proxy /api/archivo las resuelve del lado servidor).
 *
 * Todas las funciones de este archivo son PURAS salvo por depender de
 * `sanitize-html` (que corre en el server). No hacen red ni disco.
 *
 * ── POR QUÉ sanitizar acá y no al renderizar ────────────────────────────────
 * El HTML lo escriben los docentes en el editor de Moodle: puede traer
 * `<script>`, `on*=`, `javascript:`, iframes de cualquier dominio y `<img>` a
 * `pluginfile.php` (que sin token no cargan). La app lo mete en el DOM con
 * `dangerouslySetInnerHTML`, así que lo que se guarda en el snapshot tiene que
 * estar YA limpio: el cliente nunca sanitiza nada.
 *
 * ⚠️ `fileurl` de Moodle trae el `token` embebido: NUNCA se guarda en el
 * snapshot ni viaja al cliente. Solo se registra en el índice server-only
 * (datos/aula-virtual-archivos.json) y sin el token.
 *
 * SOLO SERVIDOR (parte de lib/moodle/).
 */
import sanitizeHtml from 'sanitize-html';
import { urlEmbed } from '@/lib/embebido';

// ─── refs opacas ─────────────────────────────────────────────────────────────

/** Formato de una ref de archivo: "{cmid}:{indice}". Sin URL, sin token. */
export const RE_REF = /^\d{1,12}:\d{1,4}$/;

export function armarRef(cmid: number, indice: number): string {
  return `${cmid}:${indice}`;
}

/** Un archivo descargable de un módulo, tal como lo ve el cliente. */
export type ArchivoModulo = {
  nombre: string;
  /** mimetype de Moodle ("application/pdf", "application/zip"…). */
  mime: string;
  /** bytes; 0 si Moodle no lo informa. */
  tamano: number;
  /** ref opaca para /api/archivo?ref=… — nunca contiene la URL ni el token. */
  ref: string;
};

/** Lo que el server guarda para poder resolver una ref (nunca va al cliente). */
export type RefArchivo = {
  /** URL absoluta de Moodle SIN el token. */
  url: string;
  nombre: string;
  mime: string;
};

/**
 * Quita `token`/`wstoken` de una URL de Moodle. Devuelve null si no es una URL
 * http(s) válida (defensa: nada raro entra al índice de refs).
 */
export function urlSinTokenQuery(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  let u: URL;
  try {
    u = new URL(crudo);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.searchParams.delete('token');
  u.searchParams.delete('wstoken');
  return u.toString();
}

/** Nombre de archivo desde una URL ("…/content/1/foto.png" → "foto.png"). */
export function nombreDesdeUrl(url: string): string {
  const sinQuery = url.split('?')[0] ?? url;
  const ultimo = sinQuery.split('/').filter(Boolean).pop() ?? 'archivo';
  try {
    return decodeURIComponent(ultimo);
  } catch {
    return ultimo;
  }
}

/**
 * Registrador de archivos de UN módulo: reparte índices correlativos y va
 * llenando el índice server-only de refs.
 */
export class RegistroRefs {
  private indice = 0;
  /** url → ref, para que la misma imagen registrada dos veces no duplique. */
  private readonly yaVistas = new Map<string, string>();

  constructor(
    private readonly cmid: number,
    private readonly destino: Record<string, RefArchivo>
  ) {}

  /** Registra una URL de Moodle y devuelve su ref, o null si la URL no sirve. */
  registrar(fileurl: string | null | undefined, nombre?: string, mime?: string): string | null {
    const url = urlSinTokenQuery(fileurl);
    if (url === null) return null;
    const previa = this.yaVistas.get(url);
    if (previa !== undefined) return previa;
    const ref = armarRef(this.cmid, this.indice++);
    this.yaVistas.set(url, ref);
    this.destino[ref] = {
      url,
      nombre: (nombre ?? '').trim() || nombreDesdeUrl(url),
      mime: mime ?? 'application/octet-stream',
    };
    return ref;
  }
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

const HOSTS_YOUTUBE = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/** Un id de video son 11 chars de [A-Za-z0-9_-]; una lista empieza con PL/UU/… */
const RE_ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const RE_ID_LISTA = /^[A-Za-z0-9_-]{2,64}$/;

/**
 * Extrae el video o la lista de una URL de YouTube.
 *
 * Cubre las cuatro formas que aparecen en el aula: `watch?v=`, `youtu.be/`,
 * `embed/` (con y sin `videoseries?list=`) y `playlist?list=`. Si la URL trae
 * video Y lista gana el video (es lo que se puede embeber directo).
 *
 * Devuelve el id pelado para un video y `"lista:{id}"` para una playlist —
 * ese mismo string es el que se guarda en `ModuloCurso.video`.
 */
export function videoYoutube(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  let u: URL;
  try {
    u = new URL(crudo.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!HOSTS_YOUTUBE.has(host)) return null;

  const partes = u.pathname.split('/').filter(Boolean);

  if (host.endsWith('youtu.be')) {
    const id = partes[0] ?? '';
    if (RE_ID_VIDEO.test(id)) return id;
  }

  if (partes[0] === 'embed') {
    const id = partes[1] ?? '';
    // "videoseries" mide 11 chars como un id, pero es el marcador de playlist:
    // el id de verdad está en ?list=.
    if (id !== 'videoseries' && RE_ID_VIDEO.test(id)) return id;
  }
  if (partes[0] === 'shorts') {
    const id = partes[1] ?? '';
    if (RE_ID_VIDEO.test(id)) return id;
  }

  const v = u.searchParams.get('v');
  if (v !== null && RE_ID_VIDEO.test(v)) return v;

  const lista = u.searchParams.get('list');
  if (lista !== null && RE_ID_LISTA.test(lista)) return `lista:${lista}`;

  return null;
}

/** src de todos los `<iframe>` del HTML (ya sanitizado o crudo). */
const RE_IFRAME_SRC = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

/** Primer video/lista de YouTube embebido en el HTML, o null. */
export function videoDesdeHtml(html: string): string | null {
  for (const m of html.matchAll(RE_IFRAME_SRC)) {
    const encontrado = videoYoutube(m[1]);
    if (encontrado !== null) return encontrado;
  }
  return null;
}

// ─── sanitización ────────────────────────────────────────────────────────────

const ETIQUETAS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'code',
  'pre',
  'a',
  'img',
  'iframe',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'span',
  'div',
  'hr',
];

/** Único origen de iframes permitido, después de reescribir YouTube a nocookie. */
const PREFIJOS_IFRAME_OK = [
  'https://www.youtube-nocookie.com/embed/',
  'https://player.vimeo.com/video/',
];

/** ¿Es una URL de archivo servido por Moodle (necesita token)? */
export function esPluginfile(src: string): boolean {
  return /\/(?:webservice\/)?(?:pluginfile|draftfile|tokenpluginfile)\.php\//i.test(src);
}

export type OpcionesSanitizar = {
  /**
   * Registra un archivo de Moodle (`pluginfile.php`) referenciado por el HTML —
   * una `<img>` o un `<a href>` — y devuelve su ref para apuntarlo al proxy.
   * Si devuelve null, la imagen se reemplaza por su `alt` y el link se deja
   * como estaba (abrirá en el aula virtual).
   */
  registrarArchivo?: (src: string) => string | null;
  /** Tope de caracteres del HTML de salida. */
  maxLargo?: number;
};

/** Tope por módulo: alcanza de sobra para una page larga sin inflar el snapshot. */
export const MAX_HTML = 40_000;

function opciones(o: OpcionesSanitizar): sanitizeHtml.IOptions {
  return {
    allowedTags: ETIQUETAS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      iframe: ['src', 'width', 'height', 'allowfullscreen'],
    },
    // `javascript:` / `data:` quedan afuera por no estar en la lista.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'], iframe: ['https'] },
    allowProtocolRelative: false,
    // <script> y <style> se van CON su contenido (si no, el código quedaría
    // como texto visible).
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
    transformTags: {
      a: (nombre, attribs) => {
        // Un link a pluginfile.php sin token da 403: se manda al proxy, que
        // es el único que puede autenticarse.
        const href = attribs.href ?? '';
        const ref = esPluginfile(href) ? (o.registrarArchivo?.(href) ?? null) : null;
        const destino = ref !== null ? `/api/archivo?ref=${encodeURIComponent(ref)}` : href;
        return {
          tagName: 'a',
          attribs: {
            ...(destino ? { href: destino } : {}),
            ...(attribs.title ? { title: attribs.title } : {}),
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
      iframe: (nombre, attribs) => {
        const video = videoYoutube(attribs.src ?? '');
        const src =
          video !== null
            ? urlEmbed(video)
            : /^https:\/\/player\.vimeo\.com\/video\//i.test(attribs.src ?? '')
              ? (attribs.src as string)
              : '';
        return {
          tagName: 'iframe',
          attribs: {
            src,
            ...(attribs.width ? { width: attribs.width } : {}),
            ...(attribs.height ? { height: attribs.height } : {}),
            allowfullscreen: '',
          },
        };
      },
      img: (nombre, attribs) => {
        const src = attribs.src ?? '';
        if (!esPluginfile(src)) return { tagName: 'img', attribs };
        const ref = o.registrarArchivo?.(src) ?? null;
        if (ref === null) {
          // Sin ref no hay forma de servirla: mejor su `alt` que un ícono roto.
          return { tagName: 'span', attribs: {}, text: attribs.alt ?? '' };
        }
        return {
          tagName: 'img',
          attribs: {
            src: `/api/archivo?ref=${encodeURIComponent(ref)}`,
            ...(attribs.alt ? { alt: attribs.alt } : {}),
          },
        };
      },
    },
    // Después de transformTags, un iframe que no quedó apuntando a un origen
    // permitido se elimina entero.
    exclusiveFilter: (frame) =>
      frame.tag === 'iframe' &&
      !PREFIJOS_IFRAME_OK.some((p) => (frame.attribs.src ?? '').startsWith(p)),
  };
}

/**
 * HTML de Moodle → HTML seguro para `dangerouslySetInnerHTML`.
 *
 * Whitelist de tags/atributos, `script`/`style`/`on*`/`javascript:` fuera,
 * links siempre `target=_blank rel="noopener noreferrer"`, iframes SOLO de
 * YouTube (reescritos a youtube-nocookie) o Vimeo, e imágenes de Moodle
 * reescritas al proxy.
 *
 * Si la salida pasa `maxLargo`, se recorta el crudo y se vuelve a sanitizar:
 * sanitize-html cierra los tags que quedaron abiertos, así que el resultado
 * sigue siendo HTML balanceado.
 */
export function sanitizar(html: string | null | undefined, o: OpcionesSanitizar = {}): string {
  if (!html) return '';
  const max = o.maxLargo ?? MAX_HTML;
  let salida = sanitizeHtml(html, opciones(o)).trim();
  if (salida.length > max) {
    salida = `${sanitizeHtml(html.slice(0, max), opciones(o)).trim()}<p>…</p>`;
  }
  return salida;
}

/** ¿El HTML sanitizado tiene algo además de espacios/tags vacíos? */
export function tieneContenido(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== '' || /<(img|iframe|hr)\b/i.test(html);
}
