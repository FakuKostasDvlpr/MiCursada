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
import { urlEmbed, urlEmbedVimeo } from '@/lib/embebido';
import { decodificarHtml } from './normalizar';

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

// ─── Vimeo ───────────────────────────────────────────────────────────────────

const HOSTS_VIMEO = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** Un id de Vimeo es numérico: "vimeo.com/76979871", "player.vimeo.com/video/76979871". */
export function videoVimeo(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  let u: URL;
  try {
    u = new URL(crudo.trim());
  } catch {
    return null;
  }
  if (!HOSTS_VIMEO.has(u.hostname.toLowerCase())) return null;
  const partes = u.pathname.split('/').filter(Boolean);
  const id = partes[0] === 'video' ? (partes[1] ?? '') : (partes[0] ?? '');
  return /^\d{6,12}$/.test(id) ? id : null;
}

// ─── links de video → URL de embed ───────────────────────────────────────────

/** "90", "90s", "1m30s", "1h2m3s" → segundos. null si no se entiende. */
export function segundosDesdeT(crudo: string | null | undefined): number | null {
  if (!crudo) return null;
  const t = crudo.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (m === null || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** El segundo de arranque que traía el link (`?t=` o `?start=`), si trae alguno. */
function inicioDeLink(href: string): number | undefined {
  let u: URL;
  try {
    u = new URL(href.trim());
  } catch {
    return undefined;
  }
  const seg = segundosDesdeT(u.searchParams.get('start') ?? u.searchParams.get('t'));
  return seg !== null && seg > 0 ? seg : undefined;
}

/**
 * URL de embed de un link a un video, o null si el link no es de video.
 *
 * Reutiliza `videoYoutube` (watch?v=, youtu.be, embed/, shorts/, playlist?list=)
 * y `videoVimeo`, y reconstruye la URL con los helpers de lib/embebido.ts —
 * siempre youtube-nocookie / player.vimeo, que son los dos únicos orígenes que
 * la whitelist de iframes acepta.
 */
export function embedDeLink(href: string | null | undefined): string | null {
  if (!href) return null;
  const yt = videoYoutube(href);
  if (yt !== null) return urlEmbed(yt, inicioDeLink(href));
  const vimeo = videoVimeo(href);
  if (vimeo !== null) return urlEmbedVimeo(vimeo);
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

// ─── links de video → players embebidos ──────────────────────────────────────
//
// Los profes pegan los videos como `<a href="https://youtu.be/…">Uno</a>`, no
// como iframe: sin esto habría que salir de la app para verlos. Esta pasada
// corre SOBRE EL HTML YA SANITIZADO (así el sanitizador no puede volver a
// tocar —ni tirar— los iframes que insertamos) y arma cada player a partir de
// un id validado + un prefijo fijo, nunca copiando la URL del profe.

/** Un `<a …>…</a>` completo del HTML sanitizado (sanitize-html no deja anidados). */
const RE_ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
/** Un `<p>` cuyo único contenido es un link (lo más común: "…<p><a>Uno</a></p>"). */
const RE_P_SOLO_LINK = /<p>(?:\s|&nbsp;)*<a\b([^>]*)>([\s\S]*?)<\/a>(?:\s|&nbsp;)*<\/p>/gi;
const RE_HREF = /\bhref\s*=\s*"([^"]*)"/i;
const RE_TAG = /<(\/?)([a-z0-9]+)\b[^>]*>/gi;

/** Tags sin cierre: no abren nivel. */
const TAGS_VACIOS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source']);
/** Ancestros que se atraviesan buscando dónde cortar (inline + interiores de listas/tablas). */
const SALIR_Y_SEGUIR = new Set([
  'span',
  'em',
  'strong',
  'b',
  'i',
  'u',
  'code',
  'li',
  'td',
  'th',
  'tr',
  'thead',
  'tbody',
]);
/** Ancestros de bloque: el player va justo después de su cierre. */
const SALIR_Y_PARAR = new Set(['p', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'pre', 'table']);

/**
 * El href de la lista de atributos de un `<a>`, o ''. Se decodifican las
 * entidades: en el HTML el separador de query viene como `&amp;`, y sin
 * decodificar `?v=x&amp;t=90` daría un parámetro llamado "amp;t".
 */
function hrefDe(attrs: string): string {
  const crudo = RE_HREF.exec(attrs)?.[1];
  return crudo === undefined ? '' : decodificarHtml(crudo);
}

/** Texto plano del contenido de un link ("<strong>Uno</strong>" → "Uno"). */
function textoDeLink(interior: string): string {
  return interior
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `<figure class="video">` con el player y la leyenda (el texto del link, tal cual). */
function figuraVideo(src: string, interior: string): string | null {
  if (!PREFIJOS_IFRAME_OK.some((p) => src.startsWith(p))) return null;
  const texto = textoDeLink(interior);
  const attr = src.replace(/&/g, '&amp;');
  const titulo = (texto === '' ? 'Video' : texto).replace(/"/g, '&quot;');
  const leyenda = texto === '' ? '' : `<figcaption>${texto}</figcaption>`;
  return `<figure class="video"><iframe src="${attr}" title="${titulo}" allowfullscreen loading="lazy"></iframe>${leyenda}</figure>`;
}

/**
 * Dónde meter el player de un link que quedó INLINE: después del cierre del
 * bloque que lo contiene, para no romper la tipografía del párrafo (un
 * `<figure>` adentro de un `<p>` es HTML inválido). Si el link está dentro de
 * un `<li>` sale de la lista entera. Devuelve -1 si no hay bloque del que salir.
 */
function puntoDeInsercion(html: string, desde: number): number {
  RE_TAG.lastIndex = desde;
  let abiertos = 0;
  let mejor = -1;
  let m: RegExpExecArray | null;
  while ((m = RE_TAG.exec(html)) !== null) {
    const nombre = (m[2] ?? '').toLowerCase();
    if (TAGS_VACIOS.has(nombre)) continue;
    if (m[1] !== '/') {
      abiertos += 1;
      continue;
    }
    if (abiertos > 0) {
      abiertos -= 1;
      continue;
    }
    // Cierre de un ancestro del link.
    const fin = m.index + m[0].length;
    if (SALIR_Y_PARAR.has(nombre)) return fin;
    if (SALIR_Y_SEGUIR.has(nombre)) {
      mejor = fin;
      continue;
    }
    break; // div u otro contenedor: mejor no salir de ahí.
  }
  return mejor;
}

/**
 * Cada `<a>` a YouTube/Vimeo del HTML sanitizado pasa a ser un player embebido.
 *
 * - Si el `<a>` es TODO el párrafo, el `<p>` entero se reemplaza por el player.
 * - Si está inline (con más texto alrededor, o dentro de un `<li>`), el link se
 *   deja donde está y el player se agrega como bloque después del párrafo /
 *   de la lista.
 * - Si hay N links de video quedan N players.
 */
export function embeberLinksDeVideo(html: string): string {
  if (html === '' || !html.includes('<a')) return html;

  // 1) el párrafo que es solo un link se convierte entero.
  let salida = html.replace(RE_P_SOLO_LINK, (todo, attrs: string, interior: string) => {
    const src = embedDeLink(hrefDe(attrs));
    return (src === null ? null : figuraVideo(src, interior)) ?? todo;
  });

  // 2) los links que quedaron (inline, en listas, en celdas) suman su player.
  const inserciones: Array<{ pos: number; orden: number; texto: string }> = [];
  let i = 0;
  for (const m of salida.matchAll(RE_ANCHOR)) {
    const src = embedDeLink(hrefDe(m[1] ?? ''));
    const figura = src === null ? null : figuraVideo(src, m[2] ?? '');
    if (figura === null) continue;
    const fin = (m.index ?? 0) + m[0].length;
    const pos = puntoDeInsercion(salida, fin);
    inserciones.push({ pos: pos === -1 ? fin : pos, orden: i++, texto: figura });
  }
  // De atrás para adelante (los índices de los de más arriba no se mueven);
  // entre dos que caen en el mismo punto, el último primero, para que al
  // insertar queden en el orden en que aparecen en el texto.
  inserciones.sort((a, b) => b.pos - a.pos || b.orden - a.orden);
  for (const ins of inserciones) {
    salida = salida.slice(0, ins.pos) + ins.texto + salida.slice(ins.pos);
  }
  return salida;
}

/**
 * HTML de Moodle → HTML seguro para `dangerouslySetInnerHTML`.
 *
 * Whitelist de tags/atributos, `script`/`style`/`on*`/`javascript:` fuera,
 * links siempre `target=_blank rel="noopener noreferrer"`, iframes SOLO de
 * YouTube (reescritos a youtube-nocookie) o Vimeo, e imágenes de Moodle
 * reescritas al proxy.
 *
 * Al final, los `<a>` a YouTube/Vimeo se convierten en players embebidos
 * (`embeberLinksDeVideo`): el video se ve en la app, sin salir a otra pestaña.
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
  return embeberLinksDeVideo(salida);
}

/** ¿El HTML sanitizado tiene algo además de espacios/tags vacíos? */
export function tieneContenido(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== '' || /<(img|iframe|hr)\b/i.test(html);
}
